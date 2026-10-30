from __future__ import annotations

import argparse
import csv
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable, Sequence

from app.importacao.contexto import ContextoImportacao, ErroImportacao


def normalizar_texto(valor: Any) -> str:
    if valor is None:
        return ""
    return str(valor).strip().replace("\ufeff", "").lower()


def normalizar_numero(valor: Any) -> float | None:
    if valor is None:
        return None
    texto = str(valor).strip().replace(".", "").replace(",", ".")
    if texto in {"", "-", "--", "nan", "null", "none"}:
        return None
    try:
        return float(texto)
    except ValueError:
        return None


def extrair_coluna(registro: dict[str, Any], aliases: Sequence[str]) -> Any:
    for alias in aliases:
        if alias in registro:
            return registro.get(alias)
        chave = alias.lower().strip()
        for nome_campo in registro:
            if normalizar_texto(nome_campo) == chave:
                return registro[nome_campo]
    return None


def carregar_csv_infinity(caminho: str | Path) -> list[dict[str, str]]:
    """Lê o CSV do Infinity e retorna registros em dicionário.

    A função é tolerante a colunas com espaços, acentos e variações de capitalização.
    """
    arquivo = Path(caminho)
    if not arquivo.exists():
        raise FileNotFoundError(f"Arquivo não encontrado: {arquivo}")

    with arquivo.open("r", encoding="utf-8-sig", newline="") as handle:
        leitor = csv.DictReader(handle)
        if leitor.fieldnames is None:
            return []

        colunas = [campo.strip() for campo in leitor.fieldnames if campo is not None]
        leitor.fieldnames = colunas

        linhas: list[dict[str, str]] = []
        for linha in leitor:
            if not any((valor or "").strip() for valor in linha.values()):
                continue
            linhas.append({str(chave).strip(): valor for chave, valor in linha.items()})
    return linhas


def deduplicar_registros(
    registros: Iterable[dict[str, Any]],
    campos_chave: Sequence[str],
    *,
    manter: str = "primeiro",
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Remove registros duplicados usando uma chave normalizada.

    `manter` pode ser "primeiro" ou "ultimo".
    """
    if manter not in {"primeiro", "ultimo"}:
        raise ValueError("manter deve ser 'primeiro' ou 'ultimo'")

    registros = list(registros)
    vistos: dict[tuple[str, ...], dict[str, Any]] = {}
    duplicados: list[dict[str, Any]] = []
    resultado: list[dict[str, Any]] = []

    for indice, registro in enumerate(registros, start=1):
        chave = []
        for campo in campos_chave:
            valor = extrair_coluna(registro, [campo])
            chave.append(normalizar_texto(valor))

        if not any(chave):
            chave = (f"__sem_chave__{indice}",)
        else:
            chave = tuple(chave)

        if chave in vistos:
            duplicados.append(
                {
                    "indice_original": indice,
                    "chave": chave,
                    "registro": registro,
                    "registro_ja_visto": vistos[chave],
                }
            )
            if manter == "ultimo":
                vistos[chave] = registro
            continue

        vistos[chave] = registro
        resultado.append(registro)

    estatisticas = {
        "total_entrada": len(registros),
        "total_saida": len(resultado),
        "duplicados_removidos": len(duplicados),
        "duplicados": duplicados,
    }
    return resultado, estatisticas


def _obter_valor(registro: dict[str, Any], aliases: Sequence[str], *, converter: type | None = None) -> Any:
    valor = extrair_coluna(registro, aliases)
    if valor is None:
        return None
    if converter is None:
        return valor
    return converter(valor)


def calcular_oee(
    registro: dict[str, Any],
    *,
    aliases_tempo_planejado: Sequence[str] = ("tempo_planejado_min", "tempo_planejado", "planejado_min"),
    aliases_tempo_ativo: Sequence[str] = ("tempo_ativo_min", "tempo_ativo", "ativo_min"),
    aliases_tempo_ciclo: Sequence[str] = ("tempo_ciclo_min", "tempo_ciclo", "ciclo_min"),
    aliases_qtde_total: Sequence[str] = ("quantidade_total", "total_produzido", "pecas_total", "qtd_total"),
    aliases_qtde_boas: Sequence[str] = ("quantidade_boas", "pecas_boas", "good_parts", "qtd_boas"),
) -> dict[str, Any]:
    """Calcula OEE clássico = disponibilidade × performance × qualidade.

    Observação importante: a fórmula local da planta pode sofrer ajuste conforme a
    operação real. Se algum dado essencial estiver ausente, o retorno sinaliza isso
    em vez de inventar valor.
    """

    tempo_planejado = _obter_valor(registro, aliases_tempo_planejado, converter=normalizar_numero)
    tempo_ativo = _obter_valor(registro, aliases_tempo_ativo, converter=normalizar_numero)
    tempo_ciclo = _obter_valor(registro, aliases_tempo_ciclo, converter=normalizar_numero)
    quantidade_total = _obter_valor(registro, aliases_qtde_total, converter=normalizar_numero)
    quantidade_boas = _obter_valor(registro, aliases_qtde_boas, converter=normalizar_numero)

    if tempo_planejado in (None, 0):
        return {"oee": None, "disponibilidade": None, "performance": None, "qualidade": None, "motivo": "tempo_planejado ausente ou zero"}
    if tempo_ativo is None:
        return {"oee": None, "disponibilidade": None, "performance": None, "qualidade": None, "motivo": "tempo_ativo ausente"}
    if tempo_ciclo is None:
        return {"oee": None, "disponibilidade": None, "performance": None, "qualidade": None, "motivo": "tempo_ciclo ausente"}
    if quantidade_total is None:
        return {"oee": None, "disponibilidade": None, "performance": None, "qualidade": None, "motivo": "quantidade_total ausente"}

    disponibilidade = tempo_ativo / tempo_planejado if tempo_planejado > 0 else None

    if quantidade_boas is None:
        qualidade = None
    else:
        qualidade = quantidade_boas / quantidade_total if quantidade_total > 0 else None

    performance = (quantidade_total * tempo_ciclo) / tempo_ativo if tempo_ativo > 0 else None
    performance = performance if performance is not None and performance > 0 else None

    oee = None
    if disponibilidade is not None and performance is not None and qualidade is not None:
        oee = disponibilidade * performance * qualidade

    return {
        "oee": oee,
        "disponibilidade": disponibilidade,
        "performance": performance,
        "qualidade": qualidade,
        "motivo": None if oee is not None else "faltam campos para OEE completo",
    }


def transformar_para_oee(
    registros: Iterable[dict[str, Any]],
    *,
    campos_duplicidade: Sequence[str] = ("data", "linha", "maquina", "produto"),
    **kwargs: Any,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    registros_limpios, estatisticas = deduplicar_registros(registros, campos_duplicidade)

    for registro in registros_limpios:
        registro["oee"] = calcular_oee(registro, **kwargs)

    estatisticas["resultado"] = registros_limpios
    return registros_limpios, estatisticas


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Parser de CSV do Infinity com duplicidade e OEE")
    parser.add_argument("arquivo", type=str, help="Caminho do CSV do Infinity")
    parser.add_argument(
        "--chave",
        nargs="+",
        default=["data", "linha", "maquina", "produto"],
        help="Campos usados para detectar duplicidade",
    )
    parser.add_argument(
        "--saida",
        type=str,
        default=None,
        help="Opcional: arquivo CSV de saída com OEE calculado",
    )
    return parser


def _main() -> None:
    parser = _build_parser()
    args = parser.parse_args()

    registros = carregar_csv_infinity(args.arquivo)
    registros_limpos, estatisticas = deduplicar_registros(registros, args.chave)

    for registro in registros_limpos:
        registro["oee"] = calcular_oee(registro)

    print(f"Registros lidos: {estatisticas['total_entrada']}")
    print(f"Registros deduplicados: {estatisticas['duplicados_removidos']}")
    print(f"Registros válidos: {len(registros_limpos)}")

    for registro in registros_limpos[:5]:
        print(registro.get("oee"))

    if args.saida:
        with open(args.saida, "w", encoding="utf-8", newline="") as handle:
            campo_base = list(registros_limpos[0].keys()) if registros_limpos else []
            writer = csv.DictWriter(handle, fieldnames=[*campo_base, "oee"])
            writer.writeheader()
            for registro in registros_limpos:
                writer.writerow({**registro, "oee": str(registro.get("oee"))})
        print(f"Arquivo exportado para {args.saida}")


def importar_infinity_csv(ctx: ContextoImportacao) -> int:
    """Processa um CSV do Infinity conforme o contrato de importação do backend.

    - valida cabeçalho e leitura do arquivo
    - detecta duplicidade por chave de negócio
    - calcula OEE para cada linha quando os campos necessários existem
    - registra linhas inválidas em `ctx.erro_linha()`, permitindo que o worker
      desfaz tudo em caso de falha
    """
    if ctx.formato != "csv":
        raise ErroImportacao("Este tipo de importação aceita somente arquivos CSV.")

    caminho = ctx.arquivo
    if not caminho.exists():
        raise ErroImportacao(f"Arquivo não encontrado: {caminho}")

    total_linhas = 0
    chaves_vistas: set[tuple[str, ...]] = set()

    with caminho.open("r", encoding="utf-8-sig", newline="") as handle:
        leitor = csv.DictReader(handle)
        if leitor.fieldnames is None:
            raise ErroImportacao("O arquivo CSV está vazio ou sem cabeçalho.")

        campos = [campo.strip() for campo in leitor.fieldnames if campo is not None]
        if not campos:
            raise ErroImportacao("O arquivo CSV não contém colunas válidas no cabeçalho.")
        leitor.fieldnames = campos

        for numero_linha, registro in enumerate(leitor, start=2):
            if registro is None:
                continue
            if not any((valor or "").strip() for valor in registro.values()):
                continue

            total_linhas += 1
            chave = tuple(
                normalizar_texto(registro.get(campo)) for campo in ("data", "linha", "maquina", "produto")
            )
            if chave and any(chave):
                if chave in chaves_vistas:
                    ctx.erro_linha(
                        numero_linha,
                        "Registro duplicado no CSV do Infinity para a chave (data, linha, máquina, produto).",
                        coluna="duplicidade",
                    )
                    continue
                chaves_vistas.add(chave)

            oee = calcular_oee(registro)
            if oee["motivo"] is not None:
                # O campo pode estar ausente em algumas linhas; como esta importação
                # representa desempenho de produção, o registro fica inválido para
                # não mascarar dados incompletos.
                ctx.erro_linha(numero_linha, f"Dados de OEE incompletos: {oee['motivo']}.", coluna="oee")

    if total_linhas == 0:
        raise ErroImportacao("Não foi encontrada nenhuma linha com dados válidos no CSV.")

    return total_linhas


if __name__ == "__main__":
    _main()
