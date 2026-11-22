"""Importação dos apontamentos do Infinity (app/importacao/parsers/infinity.py).

Arquivos montados aqui com dados fictícios, no layout do export do Infinity.
"""

from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

import pytest
from openpyxl import Workbook
from sqlalchemy import text

from app.importacao.contexto import ContextoImportacao, ErroImportacao
from app.importacao.parsers.infinity import importar_infinity
from app.models import ApontamentoSecagem, Base, Importacao, Secador

CABECALHO = [
    "Processo", "Turno", "Data", "Hora", "Funcionário", "Produto", "Produto (Lote)",
    "Batch-SB", "Quantidade", "Temperatura", "Hora Inicial", "Hora Final", "Duração", "Observações",
]
PROCESSO = "SEC-01-Secador Teste"


def linha(**campos) -> list:
    padrao = {
        "Processo": PROCESSO, "Turno": "Turno A", "Data": "01/12/2026", "Hora": "10:00:00",
        "Funcionário": "Operador A", "Produto": "Erva sintética A", "Produto (Lote)": "LOTE-1",
        "Batch-SB": "1", "Quantidade": "50", "Temperatura": "60", "Hora Inicial": "07:00",
        "Hora Final": "09:30", "Duração": "150", "Observações": "",
    }
    padrao.update(campos)
    return [padrao[c] for c in CABECALHO]


@pytest.fixture
def banco(cadastro):
    with cadastro.get_bind().begin() as conexao:
        # importacao usa TINYINT do MySQL, que o SQLite não entende (como usuario no conftest)
        conexao.execute(text(
            "CREATE TABLE importacao (id INTEGER PRIMARY KEY, usuario_id INTEGER, tipo TEXT,"
            " nome_arquivo TEXT, arquivo TEXT, tamanho_bytes INTEGER, sha256 TEXT,"
            " status TEXT DEFAULT 'pendente', tentativas INTEGER DEFAULT 0, linhas_total INTEGER,"
            " linhas_com_erro INTEGER, linhas_ignoradas INTEGER, mensagem_erro TEXT,"
            " criado_em DATETIME DEFAULT CURRENT_TIMESTAMP, iniciado_em DATETIME, finalizado_em DATETIME)"
        ))
    Base.metadata.create_all(cadastro.get_bind(), tables=[ApontamentoSecagem.__table__])
    secador = cadastro.get(Secador, 1)
    secador.codigo_infinity = PROCESSO
    cadastro.commit()
    return cadastro


def importar(banco, tmp_path: Path, linhas: list[list], *, formato="csv", cabecalho=CABECALHO, antes=()):
    """Grava o arquivo, roda o parser e devolve o contexto (com erros e ignoradas)."""
    importacao = Importacao(
        tipo="infinity_csv", nome_arquivo=f"export.{formato}", tamanho_bytes=1, sha256="x" * 64
    )
    banco.add(importacao)
    banco.flush()
    caminho = tmp_path / f"export-{importacao.id}.{formato}"
    if formato == "csv":
        texto = "\n".join(";".join(str(v) for v in l) for l in [*antes, cabecalho, *linhas])
        caminho.write_text(texto, encoding="utf-8")
    else:
        livro = Workbook()
        for l in [*antes, cabecalho, *linhas]:
            livro.active.append(l)
        livro.save(caminho)
    ctx = ContextoImportacao(
        importacao_id=importacao.id, usuario_id=None, nome_arquivo=caminho.name, arquivo=caminho, db=banco
    )
    ctx.total_lido = importar_infinity(ctx)
    banco.flush()
    return ctx


def apontamentos(banco) -> list[ApontamentoSecagem]:
    return banco.query(ApontamentoSecagem).order_by(ApontamentoSecagem.inicio).all()


def test_csv_com_ponto_e_virgula_e_numeros_brasileiros(banco, tmp_path):
    ctx = importar(banco, tmp_path, [
        linha(Quantidade="1.234,5", Temperatura="58,5"),
        linha(**{"Hora Inicial": "10:00", "Hora Final": "12:30", "Batch-SB": "2"}),
    ])

    assert (ctx.total_lido, ctx.total_erros, ctx.linhas_ignoradas) == (2, 0, 0)
    primeiro, segundo = apontamentos(banco)
    assert (primeiro.secador_id, primeiro.erva_id, primeiro.data) == (1, 1, date(2026, 12, 1))
    assert (primeiro.inicio, primeiro.fim) == (datetime(2026, 12, 1, 7), datetime(2026, 12, 1, 9, 30))
    assert (primeiro.quantidade_kg, primeiro.temperatura, primeiro.duracao_min) == (
        Decimal("1234.5"), Decimal("58.5"), Decimal(150),
    )
    assert (primeiro.lote, primeiro.batch, primeiro.turno, primeiro.linha) == ("LOTE-1", "1", "Turno A", 2)
    assert segundo.batch == "2"


def test_xlsx_com_titulo_antes_do_cabecalho_e_celulas_nativas(banco, tmp_path):
    ctx = importar(banco, tmp_path, [
        linha(Data=datetime(2026, 12, 2), Quantidade=45, **{"Hora Inicial": "22:00", "Hora Final": "01:00", "Duração": None}),
    ], formato="xlsx", antes=[["Relatório de apontamentos"], []])

    assert ctx.total_erros == 0
    (apontamento,) = apontamentos(banco)
    # Passou da meia-noite: o fim é no dia seguinte, e a duração vem do horário
    assert apontamento.fim == datetime(2026, 12, 3, 1)
    assert apontamento.duracao_min == Decimal(180)
    assert apontamento.linha == 4


def test_duplicadas_no_arquivo_e_ja_importadas_sao_ignoradas(banco, tmp_path):
    importar(banco, tmp_path, [linha()])

    ctx = importar(banco, tmp_path, [
        linha(),  # já importada antes
        linha(**{"Hora Inicial": "10:00", "Hora Final": "12:30"}),
        linha(**{"Hora Inicial": "10:00", "Hora Final": "12:30"}),  # repetida no arquivo
    ])

    assert (ctx.total_erros, ctx.linhas_ignoradas) == (0, 2)
    assert [a.inicio.hour for a in apontamentos(banco)] == [7, 10]


def test_erros_por_linha_nao_gravam_nada(banco, tmp_path):
    ctx = importar(banco, tmp_path, [
        linha(),
        linha(Processo="SEC-99-Desconhecido"),
        linha(Produto="Erva que não existe"),
        linha(Quantidade=""),
        linha(Data="31/02/2026"),
        linha(Quantidade="-5"),
    ])

    assert [(e.linha, e.coluna, e.mensagem.split(":")[0]) for e in ctx.erros] == [
        (3, "Processo", "Processo 'SEC-99-Desconhecido' não está ligado a nenhum secador"),
        (4, "Produto", "Produto 'Erva que não existe' não é uma erva cadastrada"),
        (5, "Quantidade", "Campo obrigatório vazio"),
        (6, "Data", "Data inválida"),
        (7, None, "Quantidade e duração não podem ser negativas"),
    ]
    assert apontamentos(banco) == []


def test_operador_nao_e_guardado(banco, tmp_path):
    importar(banco, tmp_path, [linha(**{"Funcionário": "Nome Fictício"})])

    (apontamento,) = apontamentos(banco)
    valores = [str(getattr(apontamento, c.key)) for c in ApontamentoSecagem.__table__.columns]
    assert not any("Nome Fictício" in v for v in valores)


@pytest.mark.parametrize(
    ("cabecalho", "mensagem"),
    [
        (["Data", "Produto"], "Não encontrei o cabeçalho"),
        (["Processo", "Data", "Produto"], "Faltam colunas no arquivo do Infinity: Quantidade, Hora Inicial, Hora Final"),
    ],
)
def test_layout_desconhecido(banco, tmp_path, cabecalho, mensagem):
    with pytest.raises(ErroImportacao, match=mensagem):
        importar(banco, tmp_path, [["x"] * len(cabecalho)], cabecalho=cabecalho)


def test_arquivo_sem_linhas(banco, tmp_path):
    with pytest.raises(ErroImportacao, match="nenhuma linha"):
        importar(banco, tmp_path, [])


def test_secador_com_codigo_infinity_repetido_responde_409(cliente, banco):
    from tests.conftest import ADMIN_CADASTRO

    cliente.logar(ADMIN_CADASTRO)
    resposta = cliente.post(
        "/api/secadores", json={"codigo": "SEC-2", "nome": "Outro", "codigo_infinity": " sec-01-secador teste "}
    )

    assert resposta.status_code == 409
    assert "já está no secador SEC-1" in resposta.json()["detail"]


# --- Números que quebravam o banco e erros sem linha (QA A6) ---


@pytest.mark.parametrize(
    ("campos", "coluna", "mensagem"),
    [
        ({"Quantidade": "NaN"}, "Quantidade", "Número inválido"),
        ({"Quantidade": "Infinity"}, "Quantidade", "Número inválido"),
        ({"Temperatura": "-inf"}, "Temperatura", "Número inválido"),
        ({"Quantidade": "1234567890"}, "Quantidade", "Quantidade grande demais"),
        ({"Duração": "1e7"}, "Duração", "Duração grande demais"),
        ({"Temperatura": "12345"}, "Temperatura", "Temperatura grande demais"),
        ({"Hora Inicial": "25:00"}, "Hora Inicial", "Hora inválida"),
        ({"Data": "31/12/9999", "Hora Inicial": "23:00", "Hora Final": "01:00"}, "Data", "Data inválida"),
    ],
)
def test_valor_fora_da_coluna_vira_erro_da_linha_com_a_coluna(banco, tmp_path, campos, coluna, mensagem):
    ctx = importar(banco, tmp_path, [linha(), linha(**campos)])

    assert [(e.linha, e.coluna, e.mensagem.split(":")[0]) for e in ctx.erros] == [(3, coluna, mensagem)]
    assert apontamentos(banco) == []


def test_valores_sao_arredondados_para_a_precisao_da_coluna(banco, tmp_path):
    ctx = importar(banco, tmp_path, [linha(Quantidade="10,0004", Temperatura="60,456", Duração="150,004")])

    assert ctx.total_erros == 0
    (apontamento,) = apontamentos(banco)
    assert (apontamento.quantidade_kg, apontamento.temperatura, apontamento.duracao_min) == (
        Decimal("10.000"), Decimal("60.46"), Decimal("150.00"),
    )


def test_falha_inesperada_numa_linha_aponta_a_linha(banco, tmp_path, monkeypatch):
    from app.importacao.parsers import infinity

    original = infinity._hora

    def hora_com_bug(valor):
        if valor == "09:45":
            raise RuntimeError("bug simulado")  # nem ValueError nem ArithmeticError
        return original(valor)

    monkeypatch.setattr(infinity, "_hora", hora_com_bug)

    ctx = importar(banco, tmp_path, [linha(), linha(**{"Hora Final": "09:45"})])

    assert [(e.linha, e.mensagem) for e in ctx.erros] == [
        (3, "Não foi possível ler esta linha; confira os valores"),
    ]
