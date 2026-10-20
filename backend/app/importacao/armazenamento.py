"""Arquivos enviados, guardados em disco (settings.uploads_dir), não no banco."""

import hashlib
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO

from app.config import settings

TAMANHO_BLOCO = 1024 * 1024

# Assinatura (primeiros bytes) de cada formato: não confiamos só na extensão
ASSINATURAS = {
    "xlsx": b"PK\x03\x04",  # zip
    "xls": b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1",  # OLE2 (Excel 97-2003)
}


class ArquivoInvalido(Exception):
    pass


class ArquivoGrandeDemais(ArquivoInvalido):
    pass


@dataclass
class ArquivoSalvo:
    nome: str
    tamanho_bytes: int
    sha256: str


def diretorio() -> Path:
    caminho = Path(settings.uploads_dir)
    caminho.mkdir(parents=True, exist_ok=True)
    return caminho


def caminho_do_arquivo(nome: str) -> Path:
    return diretorio() / nome


def _confere_conteudo(formato: str, inicio: bytes) -> None:
    if not inicio:
        raise ArquivoInvalido("Arquivo vazio")
    assinatura = ASSINATURAS.get(formato)
    if assinatura is not None and not inicio.startswith(assinatura):
        raise ArquivoInvalido(f"O conteúdo não é de um arquivo .{formato}")
    if formato == "csv" and b"\x00" in inicio:
        raise ArquivoInvalido("O conteúdo não é de um arquivo .csv (texto)")


def salvar(origem: BinaryIO, formato: str) -> ArquivoSalvo:
    """Copia o upload para o diretório em blocos, conferindo formato e tamanho."""
    limite = settings.upload_max_mb * 1024 * 1024
    nome = f"{uuid.uuid4().hex}.{formato}"
    destino = caminho_do_arquivo(nome)
    sha256 = hashlib.sha256()
    tamanho = 0
    try:
        with destino.open("wb") as saida:
            while bloco := origem.read(TAMANHO_BLOCO):
                if tamanho == 0:
                    _confere_conteudo(formato, bloco)
                tamanho += len(bloco)
                if tamanho > limite:
                    raise ArquivoGrandeDemais(f"Arquivo maior que {settings.upload_max_mb} MB")
                sha256.update(bloco)
                saida.write(bloco)
        if tamanho == 0:
            raise ArquivoInvalido("Arquivo vazio")
    except BaseException:
        destino.unlink(missing_ok=True)
        raise
    return ArquivoSalvo(nome=nome, tamanho_bytes=tamanho, sha256=sha256.hexdigest())


def remover(nome: str) -> None:
    caminho_do_arquivo(nome).unlink(missing_ok=True)
