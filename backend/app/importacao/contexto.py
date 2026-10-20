from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.orm import Session

# Arquivos muito ruins podem ter milhares de erros: guardamos só os primeiros
# para exibir, mas contamos todos
MAX_ERROS_GUARDADOS = 1000


class ErroImportacao(Exception):
    """Lance quando o arquivo inteiro não pode ser importado.

    Ex.: falta uma coluna obrigatória, planilha vazia, layout desconhecido.
    A mensagem aparece para o usuário, então escreva em português claro.
    """


@dataclass
class ErroLinha:
    linha: int | None
    coluna: str | None
    mensagem: str


class ContextoImportacao:
    """O que a função de um tipo de importação recebe do worker.

    A importação é tudo-ou-nada: tudo que for gravado em `db` só é confirmado
    se a função terminar sem exceção e sem nenhum `erro_linha`. Caso contrário
    o worker desfaz tudo e marca a importação como "erro".

    NÃO chame db.commit() nem db.rollback(): quem controla a transação é o worker.
    """

    def __init__(
        self,
        *,
        importacao_id: int,
        usuario_id: int | None,
        nome_arquivo: str,
        arquivo: Path,
        db: Session,
    ):
        self.importacao_id = importacao_id  # grave nas linhas importadas (rastreio/desfazer)
        self.usuario_id = usuario_id  # quem enviou; None se o usuário foi excluído
        self.nome_arquivo = nome_arquivo  # nome original, como o usuário enviou
        self.arquivo = arquivo  # caminho do arquivo salvo, para abrir/ler
        self.formato = arquivo.suffix.lstrip(".")  # "csv", "xlsx" ou "xls"
        self.db = db

        self.erros: list[ErroLinha] = []
        self.total_erros = 0
        self._linhas_com_erro: set[int] = set()

    def erro_linha(self, linha: int | None, mensagem: str, coluna: str | None = None) -> None:
        """Registra um problema e segue lendo, para o usuário ver todos de uma vez.

        `linha` é o número da linha como o usuário vê na planilha (contando o cabeçalho).
        """
        self.total_erros += 1
        if linha is not None:
            self._linhas_com_erro.add(linha)
        if len(self.erros) < MAX_ERROS_GUARDADOS:
            self.erros.append(ErroLinha(linha, coluna and coluna[:100], mensagem[:500]))

    @property
    def linhas_com_erro(self) -> int:
        return len(self._linhas_com_erro)
