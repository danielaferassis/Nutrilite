"""Previsões de oferta (lotes de erva fresca previstos).

Escopo por permissão:
- previsao.consultar: vê todas.
- previsao.gerenciar: vê, cadastra e altera todas (PCP).
- previsao.propria: vê, cadastra e altera só as que cadastrou (Fonte fornecedora).
"""

import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.acesso import Permissoes, requer_alguma_permissao
from app.database import get_db
from app.models import Origem, PrevisaoOferta
from app.routers.demandas import ensure_erva_ativa
from app.schemas import PrevisaoCreate, PrevisaoRead, PrevisaoUpdate

log = logging.getLogger(__name__)

router = APIRouter(prefix="/previsoes", tags=["previsoes"])

# Todas as rotas leem as três permissões: o escopo depende da combinação delas
pode_acessar = requer_alguma_permissao(
    "previsao.consultar", "previsao.gerenciar", "previsao.propria"
)


def ve_todas(permissoes: Permissoes) -> bool:
    return permissoes.tem("previsao.consultar") or permissoes.tem("previsao.gerenciar")


def ensure_nao_recebida(previsao: PrevisaoOferta) -> None:
    # O recebimento aponta para a previsão: mudá-la apagaria a origem do registro
    if previsao.recebimentos:
        raise HTTPException(
            status_code=409, detail="Previsão já recebida não pode ser alterada nem removida"
        )


def ensure_pode_alterar(permissoes: Permissoes) -> None:
    if not (permissoes.tem("previsao.gerenciar") or permissoes.tem("previsao.propria")):
        log.warning("Usuário %s só consulta previsões", permissoes.usuario.id)
        raise HTTPException(status_code=403, detail="Sem permissão")


def get_previsao_visivel_or_404(
    previsao_id: int, permissoes: Permissoes, db: Session
) -> PrevisaoOferta:
    previsao = db.get(PrevisaoOferta, previsao_id)
    # Previsão de outra fonte responde 404, para não revelar que ela existe
    if previsao is None or (
        not ve_todas(permissoes) and previsao.criado_por_id != permissoes.usuario.id
    ):
        log.warning("Previsão %s não encontrada para %s", previsao_id, permissoes.usuario.id)
        raise HTTPException(status_code=404, detail="Previsão não encontrada")
    return previsao


def get_previsao_alteravel_or_404(
    previsao_id: int, permissoes: Permissoes, db: Session
) -> PrevisaoOferta:
    ensure_pode_alterar(permissoes)
    previsao = get_previsao_visivel_or_404(previsao_id, permissoes, db)
    if not permissoes.tem("previsao.gerenciar") and previsao.criado_por_id != permissoes.usuario.id:
        # Quem só consulta vê a previsão de outra fonte, mas não pode alterá-la
        log.warning("Usuário %s tentou alterar a previsão %s", permissoes.usuario.id, previsao_id)
        raise HTTPException(status_code=403, detail="Só é possível alterar as próprias previsões")
    return previsao


@router.get("", response_model=list[PrevisaoRead])
def list_previsoes(
    erva_id: int | None = None,
    origem: Origem | None = None,
    chegada_de: date | None = None,
    chegada_ate: date | None = None,
    permissoes: Permissoes = Depends(pode_acessar),
    db: Session = Depends(get_db),
):
    query = select(PrevisaoOferta).options(
        joinedload(PrevisaoOferta.erva),
        joinedload(PrevisaoOferta.criado_por),
        selectinload(PrevisaoOferta.recebimentos),  # para `recebida`, sem uma consulta por linha
    )
    if not ve_todas(permissoes):
        query = query.where(PrevisaoOferta.criado_por_id == permissoes.usuario.id)
    if erva_id is not None:
        query = query.where(PrevisaoOferta.erva_id == erva_id)
    if origem is not None:
        query = query.where(PrevisaoOferta.origem == origem)
    if chegada_de is not None:
        query = query.where(PrevisaoOferta.data_chegada >= chegada_de)
    if chegada_ate is not None:
        query = query.where(PrevisaoOferta.data_chegada <= chegada_ate)
    previsoes = db.scalars(
        query.order_by(PrevisaoOferta.data_chegada, PrevisaoOferta.id)
    ).all()
    log.debug("Listando %s previsões", len(previsoes))
    return previsoes


@router.post("", response_model=PrevisaoRead, status_code=201)
def create_previsao(
    data: PrevisaoCreate,
    permissoes: Permissoes = Depends(pode_acessar),
    db: Session = Depends(get_db),
):
    ensure_pode_alterar(permissoes)
    ensure_erva_ativa(data.erva_id, db)
    previsao = PrevisaoOferta(**data.model_dump(), criado_por_id=permissoes.usuario.id)
    db.add(previsao)
    db.commit()
    db.refresh(previsao)
    log.info("Previsão %s criada por %s", previsao.id, permissoes.usuario.id)
    return previsao


@router.get("/{previsao_id}", response_model=PrevisaoRead)
def get_previsao(
    previsao_id: int,
    permissoes: Permissoes = Depends(pode_acessar),
    db: Session = Depends(get_db),
):
    return get_previsao_visivel_or_404(previsao_id, permissoes, db)


@router.patch("/{previsao_id}", response_model=PrevisaoRead)
def update_previsao(
    previsao_id: int,
    data: PrevisaoUpdate,
    permissoes: Permissoes = Depends(pode_acessar),
    db: Session = Depends(get_db),
):
    previsao = get_previsao_alteravel_or_404(previsao_id, permissoes, db)
    ensure_nao_recebida(previsao)
    campos = data.model_dump(exclude_unset=True)
    if "erva_id" in campos:
        ensure_erva_ativa(campos["erva_id"], db)
    for campo, valor in campos.items():
        setattr(previsao, campo, valor)
    db.commit()
    db.refresh(previsao)
    log.info("Previsão %s atualizada por %s", previsao.id, permissoes.usuario.id)
    return previsao


@router.delete("/{previsao_id}", status_code=204)
def delete_previsao(
    previsao_id: int,
    permissoes: Permissoes = Depends(pode_acessar),
    db: Session = Depends(get_db),
):
    previsao = get_previsao_alteravel_or_404(previsao_id, permissoes, db)
    ensure_nao_recebida(previsao)
    db.delete(previsao)
    db.commit()
    log.info("Previsão %s removida por %s", previsao_id, permissoes.usuario.id)
