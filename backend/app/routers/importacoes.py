import logging
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session, joinedload

from app.acesso import agora_utc, requer_permissao
from app.database import get_db
from app.importacao import armazenamento
from app.importacao.armazenamento import ArquivoGrandeDemais, ArquivoInvalido
from app.importacao.tipos import TIPOS
from app.models import Importacao, ImportacaoErro, StatusImportacao, Usuario
from app.schemas import ImportacaoErroRead, ImportacaoRead, TipoImportacaoRead

log = logging.getLogger(__name__)

pode_importar = requer_permissao("relatorio.importacao")

router = APIRouter(
    prefix="/importacoes", tags=["importacoes"], dependencies=[Depends(pode_importar)]
)

# Mesmo arquivo de novo só é bloqueado se a importação anterior pode ter gravado dados
STATUS_DUPLICADO = [
    StatusImportacao.PENDENTE,
    StatusImportacao.PROCESSANDO,
    StatusImportacao.CONCLUIDO,
]


def get_importacao_or_404(importacao_id: int, db: Session) -> Importacao:
    importacao = db.get(Importacao, importacao_id)
    if importacao is None:
        log.warning("Importação %s não encontrada", importacao_id)
        raise HTTPException(status_code=404, detail="Importação não encontrada")
    return importacao


@router.get("/tipos", response_model=list[TipoImportacaoRead])
def list_tipos():
    return [
        TipoImportacaoRead(codigo=t.codigo, nome=t.nome, formatos=sorted(t.formatos))
        for t in TIPOS.values()
    ]


@router.post("", response_model=ImportacaoRead, status_code=202)
def create_importacao(
    arquivo: UploadFile = File(...),
    tipo: str = Form(...),
    # Permite enviar de novo um arquivo idêntico a uma importação já feita
    forcar: bool = Form(False),
    usuario: Usuario = Depends(pode_importar),
    db: Session = Depends(get_db),
):
    tipo_importacao = TIPOS.get(tipo)
    if tipo_importacao is None:
        raise HTTPException(status_code=422, detail=f"Tipo de importação desconhecido: {tipo}")

    nome_arquivo = Path(arquivo.filename or "").name[:255]
    formato = Path(nome_arquivo).suffix.lower().lstrip(".")
    if formato not in tipo_importacao.formatos:
        aceitos = ", ".join(f".{f}" for f in sorted(tipo_importacao.formatos))
        raise HTTPException(status_code=422, detail=f"Formato não aceito. Envie: {aceitos}")

    try:
        salvo = armazenamento.salvar(arquivo.file, formato)
    except ArquivoGrandeDemais as erro:
        raise HTTPException(status_code=413, detail=str(erro))
    except ArquivoInvalido as erro:
        raise HTTPException(status_code=422, detail=str(erro))

    try:
        if not forcar:
            anterior = db.scalar(
                select(Importacao.id)
                .where(
                    Importacao.sha256 == salvo.sha256,
                    Importacao.tipo == tipo,
                    Importacao.status.in_(STATUS_DUPLICADO),
                )
                .order_by(Importacao.id.desc())
                .limit(1)
            )
            if anterior is not None:
                raise HTTPException(
                    status_code=409,
                    detail=f"Este arquivo já foi enviado (importação #{anterior}). "
                    "Para importar de novo mesmo assim, envie com forcar=true.",
                )

        importacao = Importacao(
            usuario_id=usuario.id,
            tipo=tipo,
            nome_arquivo=nome_arquivo,
            arquivo=salvo.nome,
            tamanho_bytes=salvo.tamanho_bytes,
            sha256=salvo.sha256,
        )
        db.add(importacao)
        db.commit()
    except BaseException:
        armazenamento.remover(salvo.nome)
        raise

    db.refresh(importacao)
    log.info("Importação %s (%s) enviada pelo usuário %s", importacao.id, tipo, usuario.id)
    return importacao


@router.get("", response_model=list[ImportacaoRead])
def list_importacoes(
    status: StatusImportacao | None = None,
    tipo: str | None = None,
    minhas: bool = False,
    limite: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    usuario: Usuario = Depends(pode_importar),
    db: Session = Depends(get_db),
):
    query = select(Importacao).options(joinedload(Importacao.usuario))
    if status is not None:
        query = query.where(Importacao.status == status)
    if tipo is not None:
        query = query.where(Importacao.tipo == tipo)
    if minhas:
        query = query.where(Importacao.usuario_id == usuario.id)
    return db.scalars(query.order_by(Importacao.id.desc()).limit(limite).offset(offset)).all()


@router.get("/{importacao_id}", response_model=ImportacaoRead)
def get_importacao(importacao_id: int, db: Session = Depends(get_db)):
    return get_importacao_or_404(importacao_id, db)


@router.get("/{importacao_id}/erros", response_model=list[ImportacaoErroRead])
def list_erros(importacao_id: int, db: Session = Depends(get_db)):
    get_importacao_or_404(importacao_id, db)
    return db.scalars(
        select(ImportacaoErro)
        .where(ImportacaoErro.importacao_id == importacao_id)
        .order_by(ImportacaoErro.linha, ImportacaoErro.id)
    ).all()


@router.post("/{importacao_id}/reprocessar", response_model=ImportacaoRead)
def reprocessar_importacao(importacao_id: int, db: Session = Depends(get_db)):
    importacao = get_importacao_or_404(importacao_id, db)
    if importacao.status not in (StatusImportacao.ERRO, StatusImportacao.CANCELADO):
        raise HTTPException(
            status_code=409, detail="Só é possível reprocessar importações com erro ou canceladas"
        )
    if importacao.arquivo is None:
        raise HTTPException(
            status_code=409, detail="O arquivo desta importação já foi apagado. Envie-o de novo."
        )

    db.execute(delete(ImportacaoErro).where(ImportacaoErro.importacao_id == importacao_id))
    importacao.status = StatusImportacao.PENDENTE
    importacao.tentativas = 0
    importacao.linhas_total = None
    importacao.linhas_com_erro = None
    importacao.mensagem_erro = None
    importacao.iniciado_em = None
    importacao.finalizado_em = None
    db.commit()
    db.refresh(importacao)
    log.info("Importação %s voltou para a fila", importacao_id)
    return importacao


@router.post("/{importacao_id}/cancelar", response_model=ImportacaoRead)
def cancelar_importacao(importacao_id: int, db: Session = Depends(get_db)):
    importacao = get_importacao_or_404(importacao_id, db)
    nao_cancelavel = HTTPException(
        status_code=409, detail="Só é possível cancelar importações que ainda estão na fila"
    )
    # Checagem antes do UPDATE: uma importação em processamento está travada pelo
    # worker e o UPDATE ficaria esperando até ela terminar
    if importacao.status != StatusImportacao.PENDENTE:
        raise nao_cancelavel
    # Condicional: o worker pode ter pegado a importação entre a leitura e aqui
    resultado = db.execute(
        update(Importacao)
        .where(Importacao.id == importacao_id, Importacao.status == StatusImportacao.PENDENTE)
        .values(status=StatusImportacao.CANCELADO, finalizado_em=agora_utc())
    )
    if resultado.rowcount == 0:
        db.rollback()
        raise nao_cancelavel
    db.commit()
    db.refresh(importacao)
    log.info("Importação %s cancelada", importacao_id)
    return importacao
