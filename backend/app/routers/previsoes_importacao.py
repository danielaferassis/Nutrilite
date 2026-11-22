"""Importação das previsões da planilha "Programação Produção Ervas".

Fluxo em dois passos, com o mesmo arquivo:
1. POST /previsoes/importacao/previa: lê a aba e mostra o que seria criado,
   alterado e removido. Não grava nada.
2. POST /previsoes/importacao: recalcula e aplica, tudo numa transação.

Sincronização (por erva + origem, no período de datas da aba):
- chave = talhão + data;
- linha nova na planilha → cria; kg diferente → altera; previsão com talhão que
  sumiu da planilha → remove;
- previsão já recebida nunca é alterada nem removida (vira aviso);
- previsão sem talhão (cadastrada à mão) não entra na comparação.
Com qualquer erro de célula, nada é gravado.
"""

import logging
from collections import defaultdict
from decimal import Decimal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.acesso import requer_permissao
from app.database import get_db
from app.importacao.programacao_ervas import AbaLida, ErroPlanilha, ler_aba, listar_abas
from app.models import Erva, Origem, PrevisaoOferta, Usuario
from app.schemas import ImportacaoErroRead, ImportacaoPrevisoesRead, LinhaImportacaoPrevisao
from app.texto import normalizar

log = logging.getLogger(__name__)

pode_importar = requer_permissao("previsao.gerenciar")

router = APIRouter(prefix="/previsoes/importacao", tags=["previsoes"])

TAMANHO_MAXIMO = 20 * 1024 * 1024  # 20 MB, o mesmo das importações do Infinity


async def _ler_arquivo(arquivo: UploadFile) -> bytes:
    if not (arquivo.filename or "").lower().endswith(".xlsx"):
        raise HTTPException(status_code=422, detail="Envie a planilha em .xlsx (Excel)")
    conteudo = await arquivo.read(TAMANHO_MAXIMO + 1)
    if len(conteudo) > TAMANHO_MAXIMO:
        raise HTTPException(status_code=413, detail="Arquivo maior que 20 MB")
    return conteudo


def _sugerir_erva(lida: AbaLida, db: Session) -> int | None:
    """Erva ativa cujo nome ou código bate com o texto acima dos talhões ou com o nome da aba."""
    ervas = db.scalars(select(Erva).where(Erva.ativo.is_(True))).all()
    if lida.erva:
        texto = normalizar(lida.erva)
        for erva in ervas:
            if texto in (normalizar(erva.nome), normalizar(erva.codigo)):
                return erva.id
    aba = normalizar(lida.aba)
    candidatas = [e for e in ervas if normalizar(e.nome) in aba or normalizar(e.codigo) in aba]
    return candidatas[0].id if len(candidatas) == 1 else None


def _comparar(
    lida: AbaLida, erva_id: int, origem: Origem, db: Session
) -> tuple[list, list, list, list[str], list[PrevisaoOferta]]:
    """O que criar, alterar e remover. Devolve também as previsões a remover (models)."""
    existentes = db.scalars(
        select(PrevisaoOferta)
        .options(selectinload(PrevisaoOferta.recebimentos))
        .where(
            PrevisaoOferta.erva_id == erva_id,
            PrevisaoOferta.origem == origem,
            PrevisaoOferta.talhao.is_not(None),
            PrevisaoOferta.data_chegada >= lida.de,
            PrevisaoOferta.data_chegada <= lida.ate,
        )
        .order_by(PrevisaoOferta.data_chegada, PrevisaoOferta.id)
    ).all()
    por_chave: dict[tuple, list[PrevisaoOferta]] = defaultdict(list)
    for previsao in existentes:
        por_chave[(previsao.talhao, previsao.data_chegada)].append(previsao)

    criar, alterar, remover, avisos = [], [], [], []
    a_remover: list[PrevisaoOferta] = []
    vistas: set[int] = set()
    for nova in lida.previsoes:
        kg = nova.kg  # já arredondado para a precisão da coluna na leitura
        iguais = por_chave.get((nova.talhao, nova.data), [])
        if not iguais:
            criar.append(LinhaImportacaoPrevisao(talhao=nova.talhao, data_chegada=nova.data, kg_fresco=kg))
            continue
        atual = iguais[0]
        vistas.add(atual.id)
        if atual.kg_fresco == kg:
            continue
        if atual.recebida:
            avisos.append(
                f"{nova.talhao} em {nova.data:%d/%m/%Y}: a planilha diz {kg} kg, mas a previsão "
                f"{atual.id} ({atual.kg_fresco} kg) já foi recebida e não será alterada"
            )
            continue
        alterar.append(LinhaImportacaoPrevisao(
            talhao=nova.talhao, data_chegada=nova.data, kg_fresco=kg,
            kg_atual=atual.kg_fresco, previsao_id=atual.id,
        ))

    for previsao in existentes:
        if previsao.id in vistas:
            continue
        if previsao.recebida:
            avisos.append(
                f"{previsao.talhao} em {previsao.data_chegada:%d/%m/%Y}: saiu da planilha, mas a "
                f"previsão {previsao.id} já foi recebida e será mantida"
            )
            continue
        remover.append(LinhaImportacaoPrevisao(
            talhao=previsao.talhao, data_chegada=previsao.data_chegada, kg_fresco=None,
            kg_atual=previsao.kg_fresco, previsao_id=previsao.id,
        ))
        a_remover.append(previsao)
    return criar, alterar, remover, avisos, a_remover


def _processar(
    conteudo: bytes, aba: str | None, erva_id: int | None, origem: Origem, db: Session
) -> tuple[ImportacaoPrevisoesRead, list[PrevisaoOferta]]:
    try:
        abas = listar_abas(conteudo)
        lida = ler_aba(conteudo, aba or abas[0])
    except ErroPlanilha as erro:
        raise HTTPException(status_code=422, detail=str(erro))

    sugerida = _sugerir_erva(lida, db)
    if erva_id is not None:
        erva = db.get(Erva, erva_id)
        if erva is None or not erva.ativo:
            raise HTTPException(status_code=422, detail="Erva inexistente ou inativa")
    usada = erva_id if erva_id is not None else sugerida

    criar, alterar, remover, avisos, a_remover = [], [], [], [], []
    if usada is None:
        avisos.append("Escolha a erva desta aba para ver o que muda")
    elif lida.de is not None:
        criar, alterar, remover, avisos, a_remover = _comparar(lida, usada, origem, db)

    resposta = ImportacaoPrevisoesRead(
        aplicada=False,
        abas=abas,
        aba=lida.aba,
        erva_na_planilha=lida.erva,
        erva_sugerida_id=sugerida,
        erva_id=usada,
        origem=origem,
        talhoes=lida.talhoes,
        de=lida.de,
        ate=lida.ate,
        total_kg=sum((p.kg for p in lida.previsoes), Decimal(0)),
        criar=criar,
        alterar=alterar,
        remover=remover,
        avisos=avisos,
        erros=[
            ImportacaoErroRead(linha=e.linha, coluna=e.coluna, mensagem=e.mensagem)
            for e in lida.erros
        ],
    )
    return resposta, a_remover


@router.post("/previa", response_model=ImportacaoPrevisoesRead)
async def previa_importacao(
    arquivo: UploadFile = File(...),
    aba: str | None = Form(None),
    erva_id: int | None = Form(None),
    origem: Origem = Form(Origem.FAZENDA_PROPRIA),
    usuario: Usuario = Depends(pode_importar),
    db: Session = Depends(get_db),
):
    conteudo = await _ler_arquivo(arquivo)
    resposta, _ = _processar(conteudo, aba, erva_id, origem, db)
    log.info(
        "Prévia da importação de %r (aba %r) por %s: %d criar, %d alterar, %d remover, %d erros",
        arquivo.filename, resposta.aba, usuario.id,
        len(resposta.criar), len(resposta.alterar), len(resposta.remover), len(resposta.erros),
    )
    return resposta


@router.post("", response_model=ImportacaoPrevisoesRead)
async def aplicar_importacao(
    arquivo: UploadFile = File(...),
    aba: str = Form(...),
    erva_id: int = Form(...),
    origem: Origem = Form(Origem.FAZENDA_PROPRIA),
    usuario: Usuario = Depends(pode_importar),
    db: Session = Depends(get_db),
):
    conteudo = await _ler_arquivo(arquivo)
    resposta, a_remover = _processar(conteudo, aba, erva_id, origem, db)
    if resposta.erros:
        raise HTTPException(
            status_code=422,
            detail=f"A planilha tem {len(resposta.erros)} erro(s). Corrija e envie de novo; nada foi gravado.",
        )

    observacao = f"Importada da planilha (aba {resposta.aba})"[:500]
    for linha in resposta.criar:
        db.add(PrevisaoOferta(
            erva_id=erva_id, origem=origem, data_chegada=linha.data_chegada,
            kg_fresco=linha.kg_fresco, talhao=linha.talhao, observacao=observacao,
            criado_por_id=usuario.id,
        ))
    for linha in resposta.alterar:
        db.get(PrevisaoOferta, linha.previsao_id).kg_fresco = linha.kg_fresco
    for previsao in a_remover:
        db.delete(previsao)
    db.commit()

    log.info(
        "Importação de %r (aba %r) por %s: %d criadas, %d alteradas, %d removidas",
        arquivo.filename, resposta.aba, usuario.id,
        len(resposta.criar), len(resposta.alterar), len(resposta.remover),
    )
    return resposta.model_copy(update={"aplicada": True})
