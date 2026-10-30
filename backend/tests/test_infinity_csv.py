from pathlib import Path

from app.importacao.parsers.infinity_csv import calcular_oee, carregar_csv_infinity, deduplicar_registros


def test_deduplicar_registros_remove_duplicatas(tmp_path: Path):
    arquivo = tmp_path / "infinity.csv"
    arquivo.write_text(
        "data,linha,maquina,produto,tempo_planejado_min,tempo_ativo_min,tempo_ciclo_min,quantidade_total,quantidade_boas\n"
        "2026-10-29,01,SCB01,Agrião,480,420,0.5,840,800\n"
        "2026-10-29,01,SCB01,Agrião,480,420,0.5,840,800\n"
        "2026-10-29,02,SCB03,Picão,480,390,0.8,650,610\n",
        encoding="utf-8",
    )

    registros = carregar_csv_infinity(arquivo)
    limpos, stats = deduplicar_registros(registros, ["data", "linha", "maquina", "produto"])

    assert len(limpos) == 2
    assert stats["duplicados_removidos"] == 1


def test_calcular_oee_com_dados_validos():
    registro = {
        "tempo_planejado_min": "480",
        "tempo_ativo_min": "420",
        "tempo_ciclo_min": "0.5",
        "quantidade_total": "840",
        "quantidade_boas": "800",
    }

    resultado = calcular_oee(registro)

    assert resultado["disponibilidade"] == 0.875
    assert resultado["qualidade"] == 0.9523809523809523
    assert resultado["oee"] is not None


def test_calcular_oee_sem_dados_necessarios() -> None:
    registro = {"tempo_planejado_min": "480", "tempo_ativo_min": "420"}

    resultado = calcular_oee(registro)

    assert resultado["oee"] is None
    assert "motivo" in resultado
