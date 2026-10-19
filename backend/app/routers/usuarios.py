import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.acesso import encerrar_sessoes, get_sessao_atual, requer_permissao
from app.database import get_db
from app.models import Grupo, Sessao, Usuario
from app.schemas import UsuarioCreate, UsuarioRead, UsuarioUpdate
from app.security import hash_senha

log = logging.getLogger(__name__)

router = APIRouter(prefix="/usuarios", tags=["usuarios"])

pode_gerenciar = requer_permissao("usuario.gerenciar")


def get_usuario_or_404(usuario_id: int, db: Session) -> Usuario:
    usuario = db.get(Usuario, usuario_id)
    if usuario is None:
        log.warning("Usuário %s não encontrado", usuario_id)
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return usuario


def ensure_email_disponivel(email: str, db: Session, ignorar_id: int | None = None) -> None:
    existente = db.scalar(select(Usuario.id).where(Usuario.email == email))
    if existente is not None and existente != ignorar_id:
        raise HTTPException(status_code=409, detail="Já existe um usuário com esse e-mail")


def load_grupos(ids: list[int], db: Session) -> list[Grupo]:
    ids = set(ids)
    grupos = db.scalars(select(Grupo).where(Grupo.id.in_(ids))).all()
    faltando = ids - {g.id for g in grupos}
    if faltando:
        raise HTTPException(status_code=422, detail=f"Grupos inexistentes: {sorted(faltando)}")
    return list(grupos)


@router.get("", response_model=list[UsuarioRead], dependencies=[Depends(pode_gerenciar)])
def list_usuarios(db: Session = Depends(get_db)):
    usuarios = db.scalars(
        select(Usuario).options(selectinload(Usuario.grupos)).order_by(Usuario.nome)
    ).all()
    log.debug("Listando %s usuários", len(usuarios))
    return usuarios


@router.post("", response_model=UsuarioRead, status_code=201, dependencies=[Depends(pode_gerenciar)])
def create_usuario(data: UsuarioCreate, db: Session = Depends(get_db)):
    ensure_email_disponivel(data.email, db)
    usuario = Usuario(
        **data.model_dump(exclude={"senha", "grupo_ids"}),
        senha_hash=hash_senha(data.senha),
    )
    usuario.grupos = load_grupos(data.grupo_ids, db)
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    log.info("Usuário %s criado", usuario.id)
    return usuario


@router.get("/{usuario_id}", response_model=UsuarioRead, dependencies=[Depends(pode_gerenciar)])
def get_usuario(usuario_id: int, db: Session = Depends(get_db)):
    return get_usuario_or_404(usuario_id, db)


@router.patch("/{usuario_id}", response_model=UsuarioRead)
def update_usuario(
    usuario_id: int,
    data: UsuarioUpdate,
    atual: Usuario = Depends(pode_gerenciar),
    sessao: Sessao = Depends(get_sessao_atual),
    db: Session = Depends(get_db),
):
    usuario = get_usuario_or_404(usuario_id, db)
    if usuario.id == atual.id and data.ativo is False:
        raise HTTPException(status_code=400, detail="Você não pode desativar o próprio usuário")
    campos = data.model_dump(exclude_unset=True, exclude={"senha", "grupo_ids"})
    if "email" in campos:
        ensure_email_disponivel(campos["email"], db, ignorar_id=usuario.id)
    for campo, valor in campos.items():
        setattr(usuario, campo, valor)
    if data.senha is not None:
        usuario.senha_hash = hash_senha(data.senha)
    if data.grupo_ids is not None:
        usuario.grupos = load_grupos(data.grupo_ids, db)
    if data.senha is not None or data.ativo is False:
        # Quem estava logado com a senha antiga (ou foi desativado) cai na hora;
        # se for o próprio usuário trocando a senha, a sessão atual é mantida
        encerrar_sessoes(db, usuario.id, exceto_id=sessao.id)
    db.commit()
    db.refresh(usuario)
    log.info("Usuário %s atualizado", usuario.id)
    return usuario


@router.delete("/{usuario_id}", status_code=204)
def delete_usuario(
    usuario_id: int, atual: Usuario = Depends(pode_gerenciar), db: Session = Depends(get_db)
):
    usuario = get_usuario_or_404(usuario_id, db)
    if usuario.id == atual.id:
        raise HTTPException(status_code=400, detail="Você não pode excluir o próprio usuário")
    db.delete(usuario)
    db.commit()
    log.info("Usuário %s removido", usuario_id)
