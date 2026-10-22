"""Worker que processa a fila de importações (tabela importacao).

    python -m app.worker

Roda num container próprio (serviço "worker" do docker-compose), separado da
API: parsing pesado não deixa a API lenta e um deploy não perde a fila.

Enquanto processa, o worker mantém a linha da importação travada (FOR UPDATE).
Se ele morrer, o MySQL solta a trava; a manutenção periódica encontra as
importações "processando" sem trava (SKIP LOCKED) e as devolve para a fila.
"""

import logging
import signal
import threading
import time
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from app.acesso import agora_utc
from app.config import settings
from app.database import engine
from app.importacao import armazenamento
from app.importacao.contexto import ContextoImportacao, ErroImportacao
from app.importacao.tipos import TIPOS
from app.logger import setup_logging
from app.models import Importacao, ImportacaoErro, StatusImportacao

log = logging.getLogger(__name__)

INTERVALO_FILA = 2  # segundos entre consultas quando a fila está vazia
INTERVALO_MANUTENCAO = 60  # segundos entre recuperação de órfãs e limpeza de arquivos
MAX_TENTATIVAS = 3
# Folga para não confundir com órfã uma importação recém-reservada, antes de travada
TOLERANCIA_ORFA = timedelta(minutes=1)

# READ COMMITTED evita travas de intervalo (gap locks) que atrasariam inserts da API
SessionWorker = sessionmaker(
    bind=engine.execution_options(isolation_level="READ COMMITTED"), autoflush=False
)

parar = threading.Event()


class _ArquivoComErros(Exception):
    """Usada só para desfazer o savepoint quando o parser registrou erros de linha."""


def reservar_proxima(db: Session) -> int | None:
    importacao = db.scalar(
        select(Importacao)
        .where(Importacao.status == StatusImportacao.PENDENTE)
        .order_by(Importacao.id)
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    if importacao is None:
        db.rollback()
        return None
    importacao.status = StatusImportacao.PROCESSANDO
    importacao.tentativas += 1
    importacao.iniciado_em = agora_utc()
    db.commit()
    return importacao.id


def _finalizar_com_erro(
    db: Session,
    importacao: Importacao,
    mensagem: str,
    ctx: ContextoImportacao | None,
    linhas: int | None,
) -> None:
    importacao.status = StatusImportacao.ERRO
    importacao.mensagem_erro = mensagem
    importacao.linhas_total = linhas
    importacao.linhas_com_erro = ctx.linhas_com_erro if ctx else None
    importacao.finalizado_em = agora_utc()
    if ctx:
        db.add_all(
            ImportacaoErro(
                importacao_id=importacao.id, linha=e.linha, coluna=e.coluna, mensagem=e.mensagem
            )
            for e in ctx.erros
        )
    db.commit()


def processar(importacao_id: int) -> None:
    with SessionWorker() as db:
        # Trava a linha até o commit final: é o sinal de que este worker está vivo
        importacao = db.scalar(
            select(Importacao).where(Importacao.id == importacao_id).with_for_update()
        )
        tipo = TIPOS.get(importacao.tipo)
        log.info("Processando importação %s (%s)", importacao.id, importacao.tipo)

        ctx: ContextoImportacao | None = None
        linhas: int | None = None
        try:
            if tipo is None:
                raise ErroImportacao(f"Tipo de importação desconhecido: {importacao.tipo}")
            if importacao.arquivo is None:
                raise ErroImportacao("O arquivo não está mais disponível. Envie-o de novo.")
            ctx = ContextoImportacao(
                importacao_id=importacao.id,
                usuario_id=importacao.usuario_id,
                nome_arquivo=importacao.nome_arquivo,
                arquivo=armazenamento.caminho_do_arquivo(importacao.arquivo),
                db=db,
            )
            # Tudo que o parser gravar fica no savepoint: com erro, só isso é desfeito
            with db.begin_nested():
                linhas = tipo.processar(ctx)
                if ctx.total_erros:
                    raise _ArquivoComErros
        except _ArquivoComErros:
            mensagem = f"{ctx.linhas_com_erro or ctx.total_erros} linha(s) com erro. Nada foi importado."
        except ErroImportacao as erro:
            mensagem = str(erro)
        except Exception:
            log.exception("Erro inesperado na importação %s", importacao_id)
            mensagem = "Erro inesperado ao processar o arquivo. Nada foi importado."
        else:
            importacao.status = StatusImportacao.CONCLUIDO
            importacao.linhas_total = linhas
            importacao.linhas_com_erro = 0
            importacao.finalizado_em = agora_utc()
            db.commit()  # dados importados e status no mesmo commit
            log.info("Importação %s concluída: %s linhas", importacao_id, linhas)
            return

        try:
            _finalizar_com_erro(db, importacao, mensagem, ctx, linhas)
        except SQLAlchemyError:
            # A transação pode ter sido abortada pelo próprio erro (ex.: deadlock):
            # recomeça numa nova, travando a linha de novo
            db.rollback()
            importacao = db.scalar(
                select(Importacao).where(Importacao.id == importacao_id).with_for_update()
            )
            _finalizar_com_erro(db, importacao, mensagem, ctx, linhas)
        log.warning("Importação %s com erro: %s", importacao_id, mensagem)


def recuperar_orfas(db: Session) -> None:
    """Devolve à fila importações cujo worker morreu no meio do processamento."""
    orfas = db.scalars(
        select(Importacao)
        .where(
            Importacao.status == StatusImportacao.PROCESSANDO,
            Importacao.iniciado_em < agora_utc() - TOLERANCIA_ORFA,
        )
        .with_for_update(skip_locked=True)
    ).all()
    for importacao in orfas:
        if importacao.tentativas >= MAX_TENTATIVAS:
            importacao.status = StatusImportacao.ERRO
            importacao.mensagem_erro = (
                "O processamento foi interrompido várias vezes. Nada foi importado."
            )
            importacao.finalizado_em = agora_utc()
            log.error("Importação %s abandonada após %s tentativas", importacao.id, importacao.tentativas)
        else:
            importacao.status = StatusImportacao.PENDENTE
            log.warning("Importação %s interrompida; voltou para a fila", importacao.id)
    db.commit()


def limpar_arquivos_antigos(db: Session) -> None:
    """Apaga do disco arquivos de importações finalizadas há mais que a retenção."""
    limite = agora_utc() - timedelta(days=settings.importacao_retencao_dias)
    antigas = db.scalars(
        select(Importacao).where(
            Importacao.status.in_(
                [StatusImportacao.CONCLUIDO, StatusImportacao.ERRO, StatusImportacao.CANCELADO]
            ),
            Importacao.finalizado_em < limite,
            Importacao.arquivo.is_not(None),
        )
    ).all()
    for importacao in antigas:
        armazenamento.remover(importacao.arquivo)
        importacao.arquivo = None
    db.commit()
    if antigas:
        log.info("%s arquivo(s) de importação apagados pela retenção", len(antigas))


def executar() -> None:
    proxima_manutencao = 0.0
    while not parar.is_set():
        try:
            if time.monotonic() >= proxima_manutencao:
                with SessionWorker() as db:
                    recuperar_orfas(db)
                    limpar_arquivos_antigos(db)
                proxima_manutencao = time.monotonic() + INTERVALO_MANUTENCAO

            with SessionWorker() as db:
                importacao_id = reservar_proxima(db)
            if importacao_id is None:
                parar.wait(INTERVALO_FILA)
            else:
                processar(importacao_id)
        except Exception:
            # Ex.: banco fora do ar. Espera um pouco e tenta de novo
            log.exception("Erro no worker de importação")
            parar.wait(INTERVALO_FILA * 5)


def main() -> None:
    setup_logging()

    def ao_receber_sinal(numero, _frame):
        # Termina a importação em andamento antes de sair (deploy, Ctrl+C)
        log.info("Sinal %s recebido; encerrando após a importação atual", numero)
        parar.set()

    signal.signal(signal.SIGTERM, ao_receber_sinal)
    signal.signal(signal.SIGINT, ao_receber_sinal)

    log.info("Worker de importação iniciado (%s tipo(s) registrado(s))", len(TIPOS))
    executar()
    log.info("Worker de importação encerrado")


if __name__ == "__main__":
    main()
