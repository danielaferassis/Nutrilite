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
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from io import BytesIO

from openpyxl import load_workbook
from openpyxl.utils import get_column_letter

from app.texto import normalizar

# Até onde procurar o cabeçalho ("Mês") no topo da aba
LINHAS_CABECALHO = 30

# Uma aba cobre no máximo uma campanha (~1 ano). Data mais longe que isto da
# mediana das datas da aba é erro de digitação (ex.: 2028 no lugar de 2026):
# se passasse, esticaria o período sincronizado e apagaria previsões de fora.
DIAS_MAXIMOS_DA_MEDIANA = 200
# A primeira e a última data definem o período: separadas da vizinha por mais
# que isto (a planilha tem uma linha por dia), também são tratadas como erro.
DIAS_MAXIMOS_NA_PONTA = 31

# Precisão e teto da coluna kg_fresco (Numeric(12, 3))
KG_PRECISAO = Decimal("0.001")
KG_MAXIMO = Decimal("999999999.999")


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
        numero = Decimal(texto)
    except InvalidOperation as erro:
        raise ValueError from erro
    if not numero.is_finite():  # 'NaN', 'Infinity', float('inf')
        raise ValueError
    return numero


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

    # 1ª passada: datas de cada linha (a validação do período precisa de todas)
    linhas_com_data: list[tuple[int, date, dict[int, object]]] = []
    coluna_datas = get_column_letter(coluna_data + 1)
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
                resultado.erros.append(ErroCelula(numero, coluna_datas, "Linha com valores, mas sem data"))
            continue
        try:
            dia = _data(bruto)
        except ValueError:
            resultado.erros.append(ErroCelula(numero, coluna_datas, f"Data inválida: {bruto!r}"))
            continue
        if dia in datas_vistas:
            resultado.erros.append(ErroCelula(
                numero,
                coluna_datas,
                f"Data {dia:%d/%m/%Y} repetida (já aparece na linha {datas_vistas[dia]})",
            ))
            continue
        datas_vistas[dia] = numero
        linhas_com_data.append((numero, dia, preenchidas))

    suspeitas = _datas_suspeitas([dia for _, dia, _ in linhas_com_data])

    # 2ª passada: período e quantidades, só com as datas plausíveis
    for k, (numero, dia, preenchidas) in enumerate(linhas_com_data):
        if k in suspeitas:
            resultado.erros.append(ErroCelula(numero, coluna_datas, suspeitas[k]))
            continue
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
                continue
            if kg == 0:
                continue  # zero = nada previsto
            arredondado = kg.quantize(KG_PRECISAO)  # faixa conferida depois de arredondar
            if arredondado == 0:
                resultado.erros.append(ErroCelula(
                    numero, coluna, f"Quantidade menor que 0,001 kg: {valor!r}"
                ))
            elif arredondado > KG_MAXIMO:
                resultado.erros.append(ErroCelula(numero, coluna, f"Quantidade grande demais: {valor!r}"))
            else:
                resultado.previsoes.append(PrevisaoLida(talhoes[j], dia, arredondado, numero, coluna))
    resultado.erros.sort(key=lambda e: (e.linha, len(e.coluna), e.coluna))  # ordem do Excel
    return resultado


def _datas_suspeitas(datas: list[date]) -> dict[int, str]:
    """Índice → motivo, para as datas que parecem digitadas errado.

    A planilha vem em ordem cronológica. Duas regras, ambas explicáveis:
    - longe demais da mediana das datas da aba (ano trocado);
    - fora da ordem: depois da próxima linha e antes da anterior não bate
      (mês ou dia trocado no meio de uma sequência);
    - na primeira e na última linha, que definem o período: fora de ordem ou
      longe demais da vizinha.
    """
    if not datas:
        return {}
    ordenadas = sorted(datas)
    mediana = ordenadas[len(ordenadas) // 2]
    suspeitas: dict[int, str] = {}
    for k, dia in enumerate(datas):
        if abs((dia - mediana).days) > DIAS_MAXIMOS_DA_MEDIANA:
            suspeitas[k] = (
                f"Data {dia:%d/%m/%Y} fora do período da aba (as demais estão perto de "
                f"{mediana:%m/%Y}); confira o ano"
            )
    restantes = [k for k in range(len(datas)) if k not in suspeitas]
    for antes, k, depois in zip(restantes, restantes[1:], restantes[2:]):
        anterior, proxima = datas[antes], datas[depois]
        if anterior < proxima and not anterior < datas[k] < proxima:
            suspeitas[k] = (
                f"Data {datas[k]:%d/%m/%Y} fora da ordem (fica entre {anterior:%d/%m/%Y} "
                f"e {proxima:%d/%m/%Y}); confira dia e mês"
            )
    restantes = [k for k in restantes if k not in suspeitas]
    if len(restantes) >= 2:
        for ponta, vizinha in ((restantes[0], restantes[1]), (restantes[-1], restantes[-2])):
            primeira = ponta == restantes[0]
            fora_de_ordem = datas[ponta] >= datas[vizinha] if primeira else datas[ponta] <= datas[vizinha]
            distancia = abs((datas[ponta] - datas[vizinha]).days)
            if fora_de_ordem or distancia > DIAS_MAXIMOS_NA_PONTA:
                suspeitas[ponta] = (
                    f"Data {datas[ponta]:%d/%m/%Y} não segue a sequência da aba "
                    f"(a {'próxima' if primeira else 'anterior'} é {datas[vizinha]:%d/%m/%Y}); "
                    "confira a data"
                )
    return suspeitas
