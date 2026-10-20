"""Tipos de arquivo que podem ser importados.

Para adicionar um tipo:

1. Crie a função em app/importacao/parsers/<tipo>.py:

       def importar_colheitas(ctx: ContextoImportacao) -> int:
           # abre ctx.arquivo conforme ctx.formato ("csv", "xlsx" ou "xls")
           # para cada linha válida: ctx.db.add(Colheita(..., importacao_id=ctx.importacao_id))
           # para cada linha inválida: ctx.erro_linha(numero, "mensagem", coluna="data")
           # se o arquivo todo for inválido: raise ErroImportacao("mensagem")
           return total_de_linhas_lidas

2. Registre abaixo em TIPOS. O código vira o campo `tipo` do upload e o
   frontend lista os disponíveis em GET /api/importacoes/tipos.
"""

from collections.abc import Callable
from dataclasses import dataclass, field

from app.importacao.contexto import ContextoImportacao

FORMATOS = frozenset({"csv", "xlsx", "xls"})


@dataclass(frozen=True)
class TipoImportacao:
    codigo: str  # até 50 caracteres, ex.: "colheita"
    nome: str  # exibido para o usuário, ex.: "Colheitas de erva fresca"
    processar: Callable[[ContextoImportacao], int]
    formatos: frozenset[str] = field(default=FORMATOS)  # restrinja se o parser só lê alguns


TIPOS: dict[str, TipoImportacao] = {
    tipo.codigo: tipo
    for tipo in [
        # TipoImportacao("colheita", "Colheitas de erva fresca", importar_colheitas),
    ]
}
