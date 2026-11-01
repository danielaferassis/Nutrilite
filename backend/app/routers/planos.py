"""Planos salvos: simular e gravar (rascunho), consultar, aprovar e descartar.

Escopo por permissão:
- plano.simular: salva rascunhos e remove rascunhos; vê todos os planos.
- plano.aprovar: aprova um rascunho; vê todos os planos.
- plano.consultar: vê só planos aprovados e substituídos (não vê rascunhos).

O servidor sempre roda a simulação ao salvar: o plano gravado é exatamente
o que o motor calculou sobre o cadastro daquele momento.
"""

import logging
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.acesso import Permissoes, agora_utc, requer_alguma_permissao, requer_permissao
from app.database import get_db
from app.models import Plano, PlanoAlocacao, PlanoPendencia, StatusPlano, Usuario
from app.planner.types import ResultadoPlano, TipoPendencia
from app.schemas import PlanoCreate, PlanoRead, PlanoResumo
from app.simulacao import executar, para_json

log = logging.getLogger(__name__)

router = APIRouter(prefix="/planos", tags=["planos"])

pode_ver = requer_alguma_permissao("plano.consultar", "plano.simular", "plano.aprovar")
pode_simular = requer_permissao("plano.simular")
pode_aprovar = requer_permissao("plano.aprovar")


def ve_rascunhos(permissoes: Permissoes) -> bool:
    return permissoes.tem("plano.simular") or permissoes.tem("plano.aprovar")


def get_plano_or_404(plano_id: int, db: Session, permissoes: Permissoes | None = None) -> Plano:
    plano = db.get(Plano, plano_id)
    escondido = (
        plano is not None
        and permissoes is not None
        and plano.status == StatusPlano.RASCUNHO
        and not ve_rascunhos(permissoes)
    )
    if plano is None or escondido:
        log.warning("Plano %s não encontrado", plano_id)
        raise HTTPException(status_code=404, detail="Plano não encontrado")
    return plano


def _decimal(valor: float | None, casas: int) -> Decimal | None:
    # Arredonda como a coluna Numeric, para o valor lido de volta ser o mesmo
    return None if valor is None else round(Decimal(str(valor)), casas)


def _linhas_do_resultado(resultado: ResultadoPlano) -> tuple[list, list]:
    alocacoes = [
        PlanoAlocacao(
            secador=a.secador,
            erva=a.erva,
            dia=a.dia,
            kg_fresco=_decimal(a.kg_fresco, 3),
            horas_secagem=_decimal(a.horas_secagem, 2),
            horas_setup=_decimal(a.horas_setup, 2),
            lote_id=a.lote_id,
            demanda_id=a.demanda_id,
        )
        for a in resultado.alocacoes
    ]
    pendencias = [
        PlanoPendencia(
            tipo=p.tipo.value,
            mensagem=p.mensagem[:500],
            erva=p.erva,
            secador=p.secador,
            lote_id=p.lote_id,
            demanda_id=p.demanda_id,
            kg=_decimal(p.kg, 3),
        )
        for p in resultado.pendencias
    ]
    return alocacoes, pendencias


@router.post("", response_model=PlanoRead, status_code=201)
def create_plano(
    data: PlanoCreate,
    usuario: Usuario = Depends(pode_simular),
    db: Session = Depends(get_db),
):
    dias = None if data.dias_operacao is None else frozenset(data.dias_operacao)
    entrada, resultado, avisos = executar(db, data.inicio, data.fim, dias)
    ultima_versao = db.scalar(
        select(func.max(Plano.versao)).where(Plano.inicio == data.inicio, Plano.fim == data.fim)
    )
    alocacoes, pendencias = _linhas_do_resultado(resultado)
    plano = Plano(
        versao=(ultima_versao or 0) + 1,
        status=StatusPlano.RASCUNHO,
        inicio=data.inicio,
        fim=data.fim,
        viavel=resultado.viavel,
        parametros=para_json(entrada),
        necessidades=para_json(resultado.necessidades),
        kpis=para_json(resultado.kpis),
        avisos=avisos,
        observacao=data.observacao,
        criado_por_id=usuario.id,
        alocacoes=alocacoes,
        pendencias=pendencias,
    )
    db.add(plano)
    try:
        db.commit()
    except IntegrityError:
        # Dois salvamentos simultâneos do mesmo horizonte calcularam a mesma versão
        db.rollback()
        raise HTTPException(
            status_code=409, detail="Outro plano foi salvo ao mesmo tempo. Tente de novo."
        )
    db.refresh(plano)
    log.info(
        "Plano %s (v%s de %s a %s) salvo por %s",
        plano.id, plano.versao, plano.inicio, plano.fim, usuario.id,
    )
    return plano


@router.get("", response_model=list[PlanoResumo])
def list_planos(
    status: StatusPlano | None = None,
    # Planos cujo horizonte contém este dia (ex.: o aprovado vigente hoje)
    dia: date | None = None,
    permissoes: Permissoes = Depends(pode_ver),
    db: Session = Depends(get_db),
):
    query = select(Plano).options(joinedload(Plano.criado_por), joinedload(Plano.aprovado_por))
    if not ve_rascunhos(permissoes):
        query = query.where(Plano.status != StatusPlano.RASCUNHO)
    if status is not None:
        query = query.where(Plano.status == status)
    if dia is not None:
        query = query.where(Plano.inicio <= dia, Plano.fim >= dia)
    planos = db.scalars(query.order_by(Plano.criado_em.desc(), Plano.id.desc())).all()
    log.debug("Listando %s planos", len(planos))
    return planos


@router.get("/{plano_id}", response_model=PlanoRead)
def get_plano(
    plano_id: int,
    permissoes: Permissoes = Depends(pode_ver),
    db: Session = Depends(get_db),
):
    return get_plano_or_404(plano_id, db, permissoes)


@router.post("/{plano_id}/aprovar", response_model=PlanoRead)
def aprovar_plano(
    plano_id: int,
    usuario: Usuario = Depends(pode_aprovar),
    db: Session = Depends(get_db),
):
    # Trava a linha: duas aprovações simultâneas do mesmo plano não passam juntas
    plano = db.scalar(select(Plano).where(Plano.id == plano_id).with_for_update())
    if plano is None:
        raise HTTPException(status_code=404, detail="Plano não encontrado")
    if plano.status != StatusPlano.RASCUNHO:
        raise HTTPException(status_code=409, detail=f"Plano já está {plano.status.value}")
    if any(p.tipo == TipoPendencia.PARAM_AUSENTE.value for p in plano.pendencias):
        raise HTTPException(
            status_code=409,
            detail=(
                "Plano com parâmetros ausentes não pode ser aprovado: "
                "complete o cadastro e simule de novo"
            ),
        )

    # O aprovado mais recente vale para o horizonte: os anteriores sobrepostos saem de vigor
    anteriores = db.scalars(
        select(Plano).where(
            Plano.status == StatusPlano.APROVADO,
            Plano.inicio <= plano.fim,
            Plano.fim >= plano.inicio,
        )
    ).all()
    for anterior in anteriores:
        anterior.status = StatusPlano.SUBSTITUIDO
        log.info("Plano %s substituído pelo plano %s", anterior.id, plano.id)

    plano.status = StatusPlano.APROVADO
    plano.aprovado_por_id = usuario.id
    plano.aprovado_em = agora_utc()
    db.commit()
    db.refresh(plano)
    log.info("Plano %s aprovado por %s", plano.id, usuario.id)
    return plano


@router.delete("/{plano_id}", status_code=204)
def delete_plano(
    plano_id: int,
    usuario: Usuario = Depends(pode_simular),
    db: Session = Depends(get_db),
):
    plano = get_plano_or_404(plano_id, db)
    if plano.status != StatusPlano.RASCUNHO:
        # Aprovado e substituído são histórico: não se apagam
        raise HTTPException(status_code=409, detail="Só rascunhos podem ser removidos")
    db.delete(plano)
    db.commit()
    log.info("Plano %s removido por %s", plano_id, usuario.id)
