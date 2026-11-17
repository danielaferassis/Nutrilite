"""Importação da planilha de programação (previsões por talhão).

As planilhas são montadas aqui, com números fictícios, no mesmo layout da
"Programação Produção Ervas" da fazenda. Nenhum arquivo real entra no repositório.
"""

from datetime import date, datetime
from decimal import Decimal
from io import BytesIO

import pytest
from openpyxl import Workbook

from app.importacao.programacao_ervas import ErroPlanilha, ler_aba
from app.models import Origem, PrevisaoOferta, Recebimento
from tests.conftest import CONSULTA, FONTE_A, PCP

TALHOES = ("Talhão 01", "Talhão 02")
DIAS = [date(2026, 12, d) for d in (1, 2, 3, 4, 5)]


def planilha(
    valores: dict[tuple[str, date], object],
    *,
    aba: str = "Erva A 2026",
    erva: str | None = "Erva sintética A",
    talhoes: tuple[str, ...] = TALHOES,
    dias: list = DIAS,
    outras_abas: tuple[str, ...] = (),
) -> bytes:
    """Monta um .xlsx no layout da programação: erva, talhões, cabeçalho, dias, TOTAL."""
    livro = Workbook()
    folha = livro.active
    folha.title = aba
    primeira = 6  # coluna F, como na planilha da fazenda
    for k, talhao in enumerate(talhoes):
        if erva is not None:
            folha.cell(1, primeira + k, erva)
        folha.cell(2, primeira + k, talhao)
        folha.cell(3, primeira + k, "9000m² = 0,90ha")
    for j, titulo in enumerate(["Mês", "Dia da Semana", "Semana/Week", "Total Semana"], start=2):
        folha.cell(3, j, titulo)
    linha = 4
    for dia in dias:
        folha.cell(linha, 2, datetime(dia.year, dia.month, dia.day) if isinstance(dia, date) else dia)
        folha.cell(linha, 3, "Rótulo errado")  # o dia da semana é ignorado
        folha.cell(linha, 4, "W49")
        for k, talhao in enumerate(talhoes):
            valor = valores.get((talhao, dia))
            if valor is not None:
                folha.cell(linha, primeira + k, valor)
        linha += 1
    folha.cell(linha, 4, "TOTAL")
    folha.cell(linha, primeira, 99999)  # totais não viram previsão
    for nome in outras_abas:
        livro.create_sheet(nome)
    saida = BytesIO()
    livro.save(saida)
    return saida.getvalue()


def enviar(cliente, conteudo: bytes, *, confirmar=False, usuario=PCP, nome="programacao.xlsx", **campos):
    cliente.logar(usuario)
    rota = "/api/previsoes/importacao" if confirmar else "/api/previsoes/importacao/previa"
    arquivos = {"arquivo": (nome, conteudo, "application/octet-stream")}
    return cliente.post(rota, files=arquivos, data={k: str(v) for k, v in campos.items()})


def previsoes(db) -> list[tuple]:
    db.expire_all()
    return sorted(
        (p.talhao, p.data_chegada.day, p.kg_fresco, p.origem)
        for p in db.query(PrevisaoOferta).all()
    )


# --- Leitura da aba ---


def test_le_talhoes_datas_e_ignora_vazios_zeros_e_total():
    conteudo = planilha({
        ("Talhão 01", DIAS[0]): 600,
        ("Talhão 02", DIAS[1]): "1.234,5",  # texto no formato brasileiro
        ("Talhão 02", DIAS[2]): 0,
    })

    lida = ler_aba(conteudo, "Erva A 2026")

    assert lida.erva == "Erva sintética A"
    assert lida.talhoes == ["Talhão 01", "Talhão 02"]
    assert (lida.de, lida.ate) == (DIAS[0], DIAS[-1])
    assert [(p.talhao, p.data, p.kg, p.linha, p.coluna) for p in lida.previsoes] == [
        ("Talhão 01", DIAS[0], Decimal(600), 4, "F"),
        ("Talhão 02", DIAS[1], Decimal("1234.5"), 5, "G"),
    ]
    assert lida.erros == []


def test_aceita_data_como_texto_e_padroniza_rotulo_do_talhao():
    conteudo = planilha({("talhao 3", "06/12/2026"): 10}, talhoes=("talhao 3",), dias=["06/12/2026"])

    lida = ler_aba(conteudo, "Erva A 2026")

    assert [(p.talhao, p.data) for p in lida.previsoes] == [("Talhão 03", date(2026, 12, 6))]


def test_erros_de_celula_apontam_linha_e_coluna():
    conteudo = planilha(
        {("Talhão 01", DIAS[0]): "muito", ("Talhão 02", DIAS[0]): -5, ("Talhão 01", "xx"): 3},
        dias=[DIAS[0], "xx", DIAS[0]],
    )

    lida = ler_aba(conteudo, "Erva A 2026")

    assert [(e.linha, e.coluna, e.mensagem.split(":")[0]) for e in lida.erros] == [
        (4, "F", "Valor não numérico"),
        (4, "G", "Quantidade negativa"),
        (5, "B", "Data inválida"),
        (6, "B", "Data 01/12/2026 repetida (já aparece na linha 4)"),
    ]


@pytest.mark.parametrize(
    ("conteudo", "mensagem"),
    [
        (lambda: b"isto nao e um xlsx", "Não foi possível abrir"),
        (lambda: planilha({}, talhoes=()), "não tem as colunas de talhão"),
        (lambda: planilha({}, talhoes=("Talhão 1", "Talhão 01")), "talhão repetidas: Talhão 01"),
    ],
)
def test_layout_desconhecido(conteudo, mensagem):
    with pytest.raises(ErroPlanilha, match=mensagem):
        ler_aba(conteudo(), "Erva A 2026")


def test_aba_sem_cabecalho_mes():
    livro = Workbook()
    livro.active.title = "Resumo"
    livro.active["A1"] = "Qualquer coisa"
    saida = BytesIO()
    livro.save(saida)

    with pytest.raises(ErroPlanilha, match="não encontrei a coluna 'Mês'"):
        ler_aba(saida.getvalue(), "Resumo")


# --- Prévia e importação pela API ---


def test_previa_nao_grava_e_sugere_a_erva(cliente, db):
    conteudo = planilha({("Talhão 01", DIAS[0]): 600}, outras_abas=("Resumo",))

    resposta = enviar(cliente, conteudo)

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["aplicada"] is False
    assert corpo["abas"] == ["Erva A 2026", "Resumo"]
    assert corpo["erva_sugerida_id"] == 1 and corpo["erva_id"] == 1
    assert [(c["talhao"], c["data_chegada"], c["kg_fresco"]) for c in corpo["criar"]] == [
        ("Talhão 01", "2026-12-01", "600.000"),
    ]
    assert previsoes(db) == []


def test_sem_erva_reconhecida_pede_para_escolher(cliente, db):
    conteudo = planilha({("Talhão 01", DIAS[0]): 600}, aba="Programação", erva="Hortelã")

    corpo = enviar(cliente, conteudo).json()

    assert corpo["erva_sugerida_id"] is None and corpo["erva_id"] is None
    assert corpo["criar"] == []
    assert corpo["avisos"] == ["Escolha a erva desta aba para ver o que muda"]


def test_importa_e_reimporta_sincronizando(cliente, db):
    primeira = planilha({
        ("Talhão 01", DIAS[0]): 600,
        ("Talhão 01", DIAS[1]): 300,
        ("Talhão 02", DIAS[2]): 800,
    })
    resposta = enviar(cliente, primeira, confirmar=True, aba="Erva A 2026", erva_id=1)
    assert resposta.status_code == 200 and resposta.json()["aplicada"] is True
    fazenda = Origem.FAZENDA_PROPRIA
    assert previsoes(db) == [
        ("Talhão 01", 1, Decimal("600.000"), fazenda),
        ("Talhão 01", 2, Decimal("300.000"), fazenda),
        ("Talhão 02", 3, Decimal("800.000"), fazenda),
    ]

    # Semana seguinte: dia 1 igual, dia 2 mudou, dia 3 saiu, dia 5 entrou
    segunda = planilha({
        ("Talhão 01", DIAS[0]): 600,
        ("Talhão 01", DIAS[1]): 350,
        ("Talhão 02", DIAS[4]): 100,
    })
    previa = enviar(cliente, segunda, aba="Erva A 2026", erva_id=1).json()
    assert [(c["talhao"], c["data_chegada"]) for c in previa["criar"]] == [("Talhão 02", "2026-12-05")]
    assert [(a["kg_atual"], a["kg_fresco"]) for a in previa["alterar"]] == [("300.000", "350.000")]
    assert [(r["talhao"], r["data_chegada"]) for r in previa["remover"]] == [("Talhão 02", "2026-12-03")]

    enviar(cliente, segunda, confirmar=True, aba="Erva A 2026", erva_id=1)

    assert previsoes(db) == [
        ("Talhão 01", 1, Decimal("600.000"), fazenda),
        ("Talhão 01", 2, Decimal("350.000"), fazenda),
        ("Talhão 02", 5, Decimal("100.000"), fazenda),
    ]


def test_reimportar_igual_nao_muda_nada(cliente, db):
    conteudo = planilha({("Talhão 01", DIAS[0]): 600})
    enviar(cliente, conteudo, confirmar=True, aba="Erva A 2026", erva_id=1)

    corpo = enviar(cliente, conteudo, aba="Erva A 2026", erva_id=1).json()

    assert (corpo["criar"], corpo["alterar"], corpo["remover"]) == ([], [], [])


def test_nao_toca_manuais_outras_ervas_outras_origens_e_fora_do_periodo(cliente, db):
    intocadas = [
        # cadastrada à mão (sem talhão), mesmo dia e erva
        PrevisaoOferta(erva_id=1, origem=Origem.FAZENDA_PROPRIA, data_chegada=DIAS[0],
                       kg_fresco=Decimal(50), criado_por_id=PCP),
        # outra erva, outra origem e fora do período da aba (dia 20)
        PrevisaoOferta(erva_id=2, origem=Origem.FAZENDA_PROPRIA, data_chegada=DIAS[0],
                       kg_fresco=Decimal(50), talhao="Talhão 01", criado_por_id=PCP),
        PrevisaoOferta(erva_id=1, origem=Origem.PROCOMPETE, data_chegada=DIAS[0],
                       kg_fresco=Decimal(50), talhao="Talhão 01", criado_por_id=PCP),
        PrevisaoOferta(erva_id=1, origem=Origem.FAZENDA_PROPRIA, data_chegada=date(2026, 12, 20),
                       kg_fresco=Decimal(50), talhao="Talhão 01", criado_por_id=PCP),
    ]
    db.add_all(intocadas)
    db.commit()

    corpo = enviar(cliente, planilha({}), aba="Erva A 2026", erva_id=1).json()

    assert corpo["remover"] == []


def test_previsao_recebida_nao_e_alterada_nem_removida(cliente, db):
    enviar(cliente, planilha({("Talhão 01", DIAS[0]): 600, ("Talhão 02", DIAS[1]): 800}),
           confirmar=True, aba="Erva A 2026", erva_id=1)
    for previsao in db.query(PrevisaoOferta).all():
        db.add(Recebimento(
            previsao_id=previsao.id, erva_id=1, origem=previsao.origem,
            data_recebimento=previsao.data_chegada, kg_fresco=previsao.kg_fresco,
            registrado_por_id=PCP,
        ))
    db.commit()

    # Talhão 01 mudou de kg e Talhão 02 sumiu, mas os dois já foram recebidos
    corpo = enviar(cliente, planilha({("Talhão 01", DIAS[0]): 650}),
                   confirmar=True, aba="Erva A 2026", erva_id=1).json()

    assert (corpo["alterar"], corpo["remover"]) == ([], [])
    assert len(corpo["avisos"]) == 2
    assert "já foi recebida" in corpo["avisos"][0]
    assert [kg for _, _, kg, _ in previsoes(db)] == [Decimal("600.000"), Decimal("800.000")]


def test_com_erro_na_planilha_nada_e_gravado(cliente, db):
    conteudo = planilha({("Talhão 01", DIAS[0]): 600, ("Talhão 02", DIAS[1]): "abc"})

    previa = enviar(cliente, conteudo, aba="Erva A 2026", erva_id=1).json()
    resposta = enviar(cliente, conteudo, confirmar=True, aba="Erva A 2026", erva_id=1)

    assert [(e["linha"], e["coluna"]) for e in previa["erros"]] == [(5, "G")]
    assert resposta.status_code == 422
    assert "nada foi gravado" in resposta.json()["detail"]
    assert previsoes(db) == []


def test_origem_escolhida_e_aplicada(cliente, db):
    enviar(cliente, planilha({("Talhão 01", DIAS[0]): 10}), confirmar=True,
           aba="Erva A 2026", erva_id=1, origem="procompete")

    assert previsoes(db) == [("Talhão 01", 1, Decimal("10.000"), Origem.PROCOMPETE)]


@pytest.mark.parametrize("usuario", [CONSULTA, FONTE_A])
def test_exige_permissao_de_gerenciar_previsoes(cliente, usuario):
    resposta = enviar(cliente, planilha({}), usuario=usuario)

    assert resposta.status_code == 403


@pytest.mark.parametrize(
    ("campos", "nome", "status"),
    [
        ({}, "programacao.xls", 422),  # só .xlsx
        ({"aba": "Não existe"}, "programacao.xlsx", 422),
        ({"erva_id": 3}, "programacao.xlsx", 422),  # erva inativa
    ],
)
def test_pedidos_invalidos(cliente, campos, nome, status):
    resposta = enviar(cliente, planilha({}), nome=nome, **campos)

    assert resposta.status_code == status
