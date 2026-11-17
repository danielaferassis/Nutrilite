"""Importação dos apontamentos de secagem exportados do Infinity (CSV ou .xlsx).

Cada linha do export é uma carga de um secador: processo (secador), data,
produto, lote, quantidade, horário de início e fim e duração. Vira uma linha de
`apontamento_secagem`, base dos indicadores (OEE e aderência ao plano).

- Os nomes de coluna aceitos estão todos em COLUNAS: se o export mudar, é só ali.
- "Processo" é ligado ao secador pelo campo `codigo_infinity` do cadastro; sem
  esse vínculo a linha dá erro (nada é deduzido pelo nome).
- "Produto" é ligado à erva pelo nome ou código cadastrado.
- Duplicidade: o mesmo secador começando uma carga no mesmo horário, repetido
  no arquivo ou já importado antes. A linha repetida é ignorada (não é erro).
- "Funcionário" e "Hora" não são lidos: não entram nos indicadores, e o nome do
  operador é dado pessoal.
"""

import csv
from datetime import date, datetime, time, timedelta
from decimal import Decimal, InvalidOperation
from io import StringIO
from pathlib import Path

from openpyxl import load_workbook
from sqlalchemy import select

from app.importacao.contexto import ContextoImportacao, ErroImportacao
from app.models import ApontamentoSecagem, Erva, Secador
from app.texto import normalizar

# campo → nomes aceitos no cabeçalho (comparados sem acento e sem caixa)
COLUNAS = {
    "processo": ("Processo",),
    "turno": ("Turno",),
    "data": ("Data",),
    "produto": ("Produto",),
    "lote": ("Produto (Lote)", "Lote"),
    "batch": ("Batch-SB", "Batch"),
    "quantidade": ("Quantidade",),
    "temperatura": ("Temperatura",),
    "hora_inicial": ("Hora Inicial",),
    "hora_final": ("Hora Final",),
    "duracao": ("Duração",),
    "observacao": ("Observações", "Observação", "Obs"),
}
OBRIGATORIAS = ("processo", "data", "produto", "quantidade", "hora_inicial", "hora_final")
ROTULO = {campo: nomes[0] for campo, nomes in COLUNAS.items()}

# Até onde procurar o cabeçalho numa planilha (pode haver título antes)
LINHAS_CABECALHO = 20


# --- Leitura do arquivo -------------------------------------------------------


def _linhas_csv(caminho: Path) -> list[list]:
    bruto = caminho.read_bytes()
    try:
        texto = bruto.decode("utf-8-sig")
    except UnicodeDecodeError:
        texto = bruto.decode("cp1252")  # export do Excel em português
    try:
        delimitador = csv.Sniffer().sniff(texto[:4096], delimiters=";,\t").delimiter
    except csv.Error:
        delimitador = ";"  # padrão do Excel em português
    return list(csv.reader(StringIO(texto), delimiter=delimitador))


def _linhas_xlsx(caminho: Path) -> list[list]:
    try:
        livro = load_workbook(caminho, read_only=True, data_only=True)
    except Exception as erro:
        raise ErroImportacao("Não foi possível abrir a planilha. Envie em .xlsx ou .csv.") from erro
    try:
        return [list(linha) for linha in livro.worksheets[0].iter_rows(values_only=True)]
    finally:
        livro.close()


def _localizar_cabecalho(linhas: list[list]) -> tuple[int, dict[str, int]]:
    """Índice da linha do cabeçalho e a coluna de cada campo conhecido."""
    for i, linha in enumerate(linhas[:LINHAS_CABECALHO]):
        nomes = {normalizar(v): j for j, v in enumerate(linha) if v not in (None, "")}
        if "processo" not in nomes:
            continue
        colunas = {}
        for campo, aceitos in COLUNAS.items():
            for nome in aceitos:
                if normalizar(nome) in nomes:
                    colunas[campo] = nomes[normalizar(nome)]
                    break
        faltando = [ROTULO[c] for c in OBRIGATORIAS if c not in colunas]
        if faltando:
            raise ErroImportacao(f"Faltam colunas no arquivo do Infinity: {', '.join(faltando)}")
        return i, colunas
    raise ErroImportacao("Não encontrei o cabeçalho do Infinity (coluna 'Processo')")


# --- Conversão das células ----------------------------------------------------


def _data(valor) -> date:
    if isinstance(valor, datetime):
        return valor.date()
    if isinstance(valor, date):
        return valor
    texto = str(valor).strip()
    for formato in ("%d/%m/%Y", "%d/%m/%y", "%Y-%m-%d"):
        try:
            return datetime.strptime(texto, formato).date()
        except ValueError:
            continue
    raise ValueError(f"Data inválida: {valor!r}")


def _hora(valor) -> time:
    if isinstance(valor, datetime):
        return valor.time()
    if isinstance(valor, time):
        return valor
    if isinstance(valor, timedelta):  # alguns exports guardam a hora como duração
        return (datetime.min + valor).time()
    texto = str(valor).strip()
    for formato in ("%H:%M", "%H:%M:%S"):
        try:
            return datetime.strptime(texto, formato).time()
        except ValueError:
            continue
    raise ValueError(f"Hora inválida: {valor!r}")


def _numero(valor) -> Decimal:
    """Número da célula. Com vírgula, lê no formato brasileiro ('1.234,5')."""
    if isinstance(valor, bool):
        raise ValueError(f"Número inválido: {valor!r}")
    if isinstance(valor, (int, float, Decimal)):
        return Decimal(str(valor))
    texto = str(valor).strip().replace(" ", "")
    if "," in texto:
        texto = texto.replace(".", "").replace(",", ".")
    try:
        return Decimal(texto)
    except InvalidOperation as erro:
        raise ValueError(f"Número inválido: {valor!r}") from erro


def _texto(valor, tamanho: int) -> str | None:
    if valor in (None, ""):
        return None
    return str(valor).strip()[:tamanho] or None


# --- Importação ---------------------------------------------------------------


def importar_infinity(ctx: ContextoImportacao) -> int:
    if ctx.formato == "csv":
        linhas = _linhas_csv(ctx.arquivo)
    elif ctx.formato == "xlsx":
        linhas = _linhas_xlsx(ctx.arquivo)
    else:
        raise ErroImportacao("O export do Infinity deve vir em .csv ou .xlsx.")
    inicio_dados, colunas = _localizar_cabecalho(linhas)

    secadores = {
        normalizar(s.codigo_infinity): s
        for s in ctx.db.scalars(select(Secador).where(Secador.codigo_infinity.is_not(None)))
    }
    ervas: dict[str, Erva] = {}
    for erva in ctx.db.scalars(select(Erva)):
        ervas.setdefault(normalizar(erva.nome), erva)
        ervas.setdefault(normalizar(erva.codigo), erva)

    def celula(linha: list, campo: str):
        j = colunas.get(campo)
        return linha[j] if j is not None and j < len(linha) else None

    lidos: list[ApontamentoSecagem] = []
    total = 0
    for i in range(inicio_dados + 1, len(linhas)):
        linha = linhas[i]
        numero = i + 1  # como o usuário vê no arquivo
        if not any(v not in (None, "") and str(v).strip() for v in linha):
            continue
        total += 1

        faltando = [ROTULO[c] for c in OBRIGATORIAS if celula(linha, c) in (None, "")]
        if faltando:
            ctx.erro_linha(numero, f"Campo obrigatório vazio: {', '.join(faltando)}", coluna=faltando[0])
            continue

        processo = str(celula(linha, "processo")).strip()
        secador = secadores.get(normalizar(processo))
        if secador is None:
            ctx.erro_linha(
                numero,
                f"Processo {processo!r} não está ligado a nenhum secador: informe o "
                "código do Infinity no cadastro do secador (Matriz de Capacidade)",
                coluna=ROTULO["processo"],
            )
            continue
        produto = str(celula(linha, "produto")).strip()
        erva = ervas.get(normalizar(produto))
        if erva is None:
            ctx.erro_linha(numero, f"Produto {produto!r} não é uma erva cadastrada", coluna=ROTULO["produto"])
            continue

        try:
            dia = _data(celula(linha, "data"))
            inicio = datetime.combine(dia, _hora(celula(linha, "hora_inicial")))
            fim = datetime.combine(dia, _hora(celula(linha, "hora_final")))
            if fim <= inicio:  # carga que passa da meia-noite
                fim += timedelta(days=1)
            quantidade = _numero(celula(linha, "quantidade"))
            bruta = celula(linha, "duracao")
            duracao = (
                Decimal((fim - inicio).total_seconds() / 60).quantize(Decimal("0.01"))
                if bruta in (None, "")
                else _numero(bruta)
            )
            temperatura_bruta = celula(linha, "temperatura")
            temperatura = None if temperatura_bruta in (None, "") else _numero(temperatura_bruta)
        except ValueError as erro:
            ctx.erro_linha(numero, str(erro))
            continue
        if quantidade < 0 or duracao < 0:
            ctx.erro_linha(numero, "Quantidade e duração não podem ser negativas")
            continue

        lidos.append(ApontamentoSecagem(
            importacao_id=ctx.importacao_id,
            secador_id=secador.id,
            erva_id=erva.id,
            data=dia,
            inicio=inicio,
            fim=fim,
            duracao_min=duracao,
            quantidade_kg=quantidade,
            temperatura=temperatura,
            turno=_texto(celula(linha, "turno"), 30),
            lote=_texto(celula(linha, "lote"), 50),
            batch=_texto(celula(linha, "batch"), 50),
            observacao=_texto(celula(linha, "observacao"), 500),
            linha=numero,
        ))

    if total == 0:
        raise ErroImportacao("O arquivo não tem nenhuma linha de apontamento.")
    if ctx.total_erros or not lidos:
        return total  # com erro o worker desfaz tudo: não adianta gravar

    # Duplicidade: mesmo secador e mesmo início, no arquivo ou já importado
    ja_importados = {
        (secador_id, inicio)
        for secador_id, inicio in ctx.db.execute(
            select(ApontamentoSecagem.secador_id, ApontamentoSecagem.inicio).where(
                ApontamentoSecagem.secador_id.in_({a.secador_id for a in lidos}),
                ApontamentoSecagem.inicio >= min(a.inicio for a in lidos),
                ApontamentoSecagem.inicio <= max(a.inicio for a in lidos),
            )
        )
    }
    for apontamento in lidos:
        chave = (apontamento.secador_id, apontamento.inicio)
        if chave in ja_importados:
            ctx.ignorar_linha()
            continue
        ja_importados.add(chave)
        ctx.db.add(apontamento)
    return total
