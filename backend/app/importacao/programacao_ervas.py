"""Leitura da planilha "Programação Produção Ervas" da fazenda (.xlsx).

Layout (uma aba por erva e ano):

    linha k-2:   ...                          | Camomila   | Camomila   | ...
    linha k-1:   ...                          | Talhão 01  | Talhão 02  | ...
    linha k:     Mês | Dia da Semana | Semana | Total | (área do talhão) ...
    linhas k+1…: 02/12/2026 | Quarta | W49 | 841 | 600 |  | ...
    última:          |      | TOTAL  | ...

- Cada célula preenchida de um talhão é a previsão (kg) daquele talhão no dia.
- A coluna "Dia da Semana" é ignorada: o dia vem da data (a planilha tem
  rótulos trocados em algumas semanas).
- Semana e Total Semana são calculados pela planilha e também são ignorados.

Só lê; quem decide o que criar, alterar ou remover é a sincronização.
"""

import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from io import BytesIO

from openpyxl import load_workbook
from openpyxl.utils import get_column_letter

# Até onde procurar o cabeçalho ("Mês") no topo da aba
LINHAS_CABECALHO = 30


class ErroPlanilha(Exception):
    """A aba inteira não pode ser lida (layout desconhecido). Mensagem para o usuário."""


@dataclass(frozen=True)
class ErroCelula:
    linha: int  # como o usuário vê no Excel
    coluna: str  # letra da coluna, ex.: "F"
    mensagem: str


@dataclass(frozen=True)
class PrevisaoLida:
    talhao: str
    data: date
    kg: Decimal
    linha: int
    coluna: str


@dataclass
class AbaLida:
    aba: str
    erva: str | None  # texto acima dos talhões (ex.: "Camomila"), se houver
    talhoes: list[str]
    de: date | None  # primeira e última data da aba
    ate: date | None
    previsoes: list[PrevisaoLida] = field(default_factory=list)
    erros: list[ErroCelula] = field(default_factory=list)


def normalizar(texto: object) -> str:
    """Sem acento, minúsculo e sem espaços nas pontas: 'Mês ' → 'mes'."""
    sem_acento = unicodedata.normalize("NFKD", str(texto)).encode("ascii", "ignore").decode()
    return sem_acento.strip().lower()


def abrir(conteudo: bytes):
    try:
        return load_workbook(BytesIO(conteudo), read_only=True, data_only=True)
    except Exception as erro:  # zip inválido, xls antigo, arquivo corrompido…
        raise ErroPlanilha(
            "Não foi possível abrir o arquivo. Envie a planilha em .xlsx (Excel)."
        ) from erro


def listar_abas(conteudo: bytes) -> list[str]:
    livro = abrir(conteudo)
    try:
        return list(livro.sheetnames)
    finally:
        livro.close()


def _rotulo_talhao(texto: str) -> str:
    """'talhão 1', 'Talhao 01 ' → 'Talhão 01' (mesma chave em toda importação)."""
    numero = re.search(r"\d+", texto)
    return f"Talhão {int(numero.group()):02d}" if numero else texto.strip()[:50]


def _data(valor: object) -> date | None:
    if isinstance(valor, datetime):
        return valor.date()
    if isinstance(valor, date):
        return valor
    if isinstance(valor, str):
        texto = valor.strip()
        for formato in ("%d/%m/%Y", "%d/%m/%y", "%Y-%m-%d"):
            try:
                return datetime.strptime(texto, formato).date()
            except ValueError:
                continue
    raise ValueError


def _kg(valor: object) -> Decimal:
    """Número da célula. Texto aceita o formato brasileiro ('1.234,5')."""
    if isinstance(valor, bool):
        raise ValueError
    if isinstance(valor, (int, float)):
        return Decimal(str(valor))
    texto = str(valor).strip().replace(" ", "")
    if "," in texto:
        texto = texto.replace(".", "").replace(",", ".")
    try:
        return Decimal(texto)
    except InvalidOperation as erro:
        raise ValueError from erro


def ler_aba(conteudo: bytes, aba: str) -> AbaLida:
    livro = abrir(conteudo)
    try:
        if aba not in livro.sheetnames:
            raise ErroPlanilha(f"A aba {aba!r} não existe no arquivo")
        linhas = list(livro[aba].iter_rows(values_only=True))
    finally:
        livro.close()

    # Cabeçalho: a linha com "Mês"; a coluna dele é a das datas
    cabecalho = coluna_data = None
    for i, linha in enumerate(linhas[:LINHAS_CABECALHO]):
        for j, valor in enumerate(linha):
            if valor is not None and normalizar(valor) == "mes":
                cabecalho, coluna_data = i, j
                break
        if cabecalho is not None:
            break
    if cabecalho is None:
        raise ErroPlanilha(
            f"A aba {aba!r} não está no formato da programação: não encontrei a coluna 'Mês'"
        )

    # Talhões: nas linhas logo acima do cabeçalho
    talhoes: dict[int, str] = {}
    linha_talhoes = None
    for i in range(cabecalho - 1, max(cabecalho - 4, -1), -1):
        for j, valor in enumerate(linhas[i]):
            if valor is not None and normalizar(valor).startswith("talhao"):
                talhoes[j] = _rotulo_talhao(str(valor))
        if talhoes:
            linha_talhoes = i
            break
    if not talhoes:
        raise ErroPlanilha(f"A aba {aba!r} não tem as colunas de talhão (ex.: 'Talhão 01')")
    repetidos = sorted({t for t in talhoes.values() if list(talhoes.values()).count(t) > 1})
    if repetidos:
        # Talhão + data é a chave da sincronização: não pode haver duas colunas iguais
        raise ErroPlanilha(f"A aba {aba!r} tem colunas de talhão repetidas: {', '.join(repetidos)}")

    # Erva: o texto acima do primeiro talhão (ex.: "Camomila")
    erva = None
    if linha_talhoes > 0:
        acima = linhas[linha_talhoes - 1]
        primeira = min(talhoes)
        if primeira < len(acima) and acima[primeira] not in (None, ""):
            erva = str(acima[primeira]).strip()

    resultado = AbaLida(aba=aba, erva=erva, talhoes=list(talhoes.values()), de=None, ate=None)
    datas_vistas: dict[date, int] = {}
    for i in range(cabecalho + 1, len(linhas)):
        linha = linhas[i]
        numero = i + 1  # como no Excel
        if any(isinstance(v, str) and normalizar(v) == "total" for v in linha):
            break  # linha de totais: fim dos dados

        celulas = {j: (linha[j] if j < len(linha) else None) for j in talhoes}
        preenchidas = {j: v for j, v in celulas.items() if v not in (None, "")}
        bruto = linha[coluna_data] if coluna_data < len(linha) else None
        if bruto in (None, ""):
            if preenchidas:
                resultado.erros.append(ErroCelula(
                    numero, get_column_letter(coluna_data + 1), "Linha com valores, mas sem data"
                ))
            continue
        try:
            dia = _data(bruto)
        except ValueError:
            resultado.erros.append(ErroCelula(
                numero, get_column_letter(coluna_data + 1), f"Data inválida: {bruto!r}"
            ))
            continue
        if dia in datas_vistas:
            resultado.erros.append(ErroCelula(
                numero,
                get_column_letter(coluna_data + 1),
                f"Data {dia:%d/%m/%Y} repetida (já aparece na linha {datas_vistas[dia]})",
            ))
            continue
        datas_vistas[dia] = numero
        resultado.de = dia if resultado.de is None else min(resultado.de, dia)
        resultado.ate = dia if resultado.ate is None else max(resultado.ate, dia)

        for j, valor in preenchidas.items():
            coluna = get_column_letter(j + 1)
            try:
                kg = _kg(valor)
            except ValueError:
                resultado.erros.append(ErroCelula(numero, coluna, f"Valor não numérico: {valor!r}"))
                continue
            if kg < 0:
                resultado.erros.append(ErroCelula(numero, coluna, f"Quantidade negativa: {kg}"))
            elif kg > 0:  # zero = nada previsto
                resultado.previsoes.append(PrevisaoLida(talhoes[j], dia, kg, numero, coluna))
    return resultado
