"""Cadastro de demonstração com números FICTÍCIOS (não são dados da Nutrilite).

Serve para ver as telas e a simulação funcionando em desenvolvimento. Datas
são relativas a hoje. De propósito, inclui situações que o PCP precisa ver:
- agrião sem tempo de espera e sem vazão (aparecem como "não informado");
- um lote grande de camomila que não cabe nos secadores (CAPACIDADE_EXCEDIDA);
- uma manutenção no SCB02.

Recusa rodar se já houver erva cadastrada, para nunca misturar com dados reais.
"""

import logging
from datetime import date, datetime, timedelta
from decimal import Decimal as D
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    BloqueioSecador,
    Capacidade,
    Demanda,
    Erva,
    Estagio,
    ModoCapacidade,
    Origem,
    PrevisaoOferta,
    Rendimento,
    Secador,
    Usuario,
)

log = logging.getLogger(__name__)

# O container roda em UTC: depois das 21h de Ubajara, date.today() já seria amanhã
FUSO_FAZENDA = ZoneInfo("America/Fortaleza")


class BancoJaTemCadastro(Exception):
    pass


def carregar(db: Session, usuario: Usuario, hoje: date | None = None) -> None:
    if db.scalar(select(Erva.id).limit(1)) is not None:
        raise BancoJaTemCadastro(
            "Já existem ervas cadastradas: os dados fictícios não foram carregados"
        )
    hoje = hoje or datetime.now(FUSO_FAZENDA).date()

    def dia(n: int) -> date:
        return hoje + timedelta(days=n)

    def erva(codigo: str, nome: str, regime: int, espera: int | None) -> Erva:
        return Erva(codigo=codigo, nome=nome, regime_horas_dia=D(regime), espera_maxima_dias=espera)

    ervas = {
        "CAMOMILA": erva("CAMOMILA", "Camomila", 12, 3),
        "PICAO": erva("PICAO", "Picão-preto", 24, 2),
        "SALSA": erva("SALSA", "Salsa", 24, 2),
        # Espera ausente de propósito: a matriz mostra "não informado"
        "AGRIAO": erva("AGRIAO", "Agrião", 24, None),
    }
    secadores = {
        "SCB01": Secador(codigo="SCB01", nome="Secador elétrico"),
        "SCB02": Secador(codigo="SCB02", nome="Secador a vapor"),
        "SCB03": Secador(codigo="SCB03", nome="Secador a GLP"),
    }
    db.add_all([*ervas.values(), *secadores.values()])
    db.flush()

    def continuo(
        codigo: str, secador: str, kg_h: str | None, prioridade: int | None = None
    ) -> Capacidade:
        return Capacidade(
            erva_id=ervas[codigo].id, secador_id=secadores[secador].id,
            modo=ModoCapacidade.CONTINUO, kg_fresco_por_hora=None if kg_h is None else D(kg_h),
            setup_inicial_h=D(1), setup_final_h=D(1), setup_diario_h=D("0.5"),
            setup_dentro_do_regime=True, prioridade=prioridade,
        )

    def rendimento(codigo: str, fresco: str, desidratado: str) -> Rendimento:
        return Rendimento(
            erva_id=ervas[codigo].id,
            fresco_por_desidratado=D(fresco),
            desidratado_por_moido=D(desidratado),
        )

    db.add_all([
        continuo("CAMOMILA", "SCB01", "40"),
        Capacidade(
            erva_id=ervas["CAMOMILA"].id, secador_id=secadores["SCB03"].id,
            modo=ModoCapacidade.POR_CARGA, kg_por_carga=D(300), horas_por_carga=D(4),
            setup_inicial_h=D(1), setup_final_h=D(1), setup_diario_h=D("0.5"),
            setup_dentro_do_regime=True,
        ),
        continuo("PICAO", "SCB01", "60", prioridade=1),
        continuo("PICAO", "SCB02", "35"),
        continuo("SALSA", "SCB02", "50"),
        continuo("SALSA", "SCB03", "90"),
        continuo("AGRIAO", "SCB03", None),
        rendimento("CAMOMILA", "6", "1.1"),
        rendimento("PICAO", "4", "1.05"),
        rendimento("SALSA", "7", "1.1"),
    ])

    def demanda(codigo: str, kg: str, estagio: Estagio, prazo: int, prioridade: int = 0) -> Demanda:
        return Demanda(
            erva_id=ervas[codigo].id, kg=D(kg), estagio=estagio, prazo=dia(prazo),
            prioridade=prioridade, criado_por_id=usuario.id, observacao="Dado fictício",
        )

    def lote(codigo: str, origem: Origem, chegada: int, kg: str) -> PrevisaoOferta:
        return PrevisaoOferta(
            erva_id=ervas[codigo].id, origem=origem, data_chegada=dia(chegada), kg_fresco=D(kg),
            criado_por_id=usuario.id, observacao="Dado fictício",
        )

    db.add_all([
        demanda("CAMOMILA", "150", Estagio.MOIDO, 6, prioridade=1),
        demanda("PICAO", "200", Estagio.DESIDRATADO, 5),
        demanda("SALSA", "80", Estagio.MOIDO, 10),
        lote("CAMOMILA", Origem.PROCOMPETE, 1, "600"),
        lote("CAMOMILA", Origem.FAZENDA_PROPRIA, 3, "6000"),  # grande demais: vira perda
        lote("PICAO", Origem.FAZENDA_PROPRIA, 1, "500"),
        lote("PICAO", Origem.PD, 4, "400"),
        lote("SALSA", Origem.PROCOMPETE, 2, "400"),
        lote("SALSA", Origem.PROCOMPETE, 8, "300"),
        BloqueioSecador(
            secador_id=secadores["SCB02"].id, inicio=dia(3), fim=dia(3),
            motivo="Manutenção preventiva (fictícia)", criado_por_id=usuario.id,
        ),
    ])
    db.commit()
    log.info("Dados fictícios carregados (4 ervas, 3 secadores, 3 demandas, 6 lotes)")
