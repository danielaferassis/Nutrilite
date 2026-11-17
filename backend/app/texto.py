"""Comparação de textos digitados por pessoas (cabeçalhos de planilha, códigos, nomes)."""

import unicodedata


def normalizar(texto: object) -> str:
    """Sem acento, minúsculo e sem espaços nas pontas: 'Mês ' → 'mes'."""
    sem_acento = unicodedata.normalize("NFKD", str(texto)).encode("ascii", "ignore").decode()
    return sem_acento.strip().lower()
