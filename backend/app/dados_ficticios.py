"""Cadastro de demonstração com números FICTÍCIOS (não são dados da Nutrilite).

Serve para ver as telas e a simulação funcionando em desenvolvimento. Datas
são relativas a hoje. A estrutura segue o que o PCP descreveu (21/10): secagem
por carga, setup dentro da campanha. Os NÚMEROS são inventados e diferentes
da tabela real, que não entra no repositório.

De propósito, inclui situações que o PCP precisa ver:
- agrião sem tempo de espera e sem kg por carga (aparecem como "não informado");
- um lote grande de camomila que não cabe nos secadores (CAPACIDADE_EXCEDIDA);
- uma manutenção no SCB02;
- histórico de chegadas: entrega menor que a prevista, uma atrasada, uma que
  não veio e uma não prevista (alimentam a confiabilidade das fontes).

Recusa rodar se já houver erva cadastrada, para nunca misturar com dados reais.
"""

import logging
from datetime import date, timedelta
from decimal import Decimal as D

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import calendario
from app.models import (
    BloqueioSecador,
    Capacidade,
    Demanda,
    Erva,
    Estagio,
    ModoCapacidade,
    Origem,
    PrevisaoOferta,
    Recebimento,
    Rendimento,
    Secador,
    Usuario,
)

log = logging.getLogger(__name__)


class BancoJaTemCadastro(Exception):
    pass


def carregar(db: Session, usuario: Usuario, hoje: date | None = None) -> None:
    if db.scalar(select(Erva.id).limit(1)) is not None:
        raise BancoJaTemCadastro(
            "Já existem ervas cadastradas: os dados fictícios não foram carregados"
        )
    hoje = hoje or calendario.hoje()

    def dia(n: int) -> date:
        return hoje + timedelta(days=n)

    def erva(codigo: str, nome: str, regime: int, espera: int | None) -> Erva:
        return Erva(codigo=codigo, nome=nome, regime_horas_dia=D(regime), espera_maxima_dias=espera)

    ervas = {
        "CAMOMILA": erva("CAMOMILA", "Camomila", 12, 3),
        "PICAO": erva("PICAO", "Picão-preto", 24, 2),
        "SALSA": erva("SALSA", "Salsa", 24, 2),
        "FIBRA": erva("FIBRA", "Fibra de acerola", 24, 5),
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

    def carga(
        codigo: str, secador: str, kg: str | None, horas: str, prioridade: int | None = None
    ) -> Capacidade:
        return Capacidade(
            erva_id=ervas[codigo].id, secador_id=secadores[secador].id,
            modo=ModoCapacidade.POR_CARGA, kg_por_carga=None if kg is None else D(kg),
            horas_por_carga=D(horas), setup_inicial_h=D(2), setup_final_h=D(2),
            setup_diario_h=D(1), setup_dentro_do_regime=True, prioridade=prioridade,
        )

    def rendimento(codigo: str, fresco: str, desidratado: str) -> Rendimento:
        return Rendimento(
            erva_id=ervas[codigo].id,
            fresco_por_desidratado=D(fresco),
            desidratado_por_moido=D(desidratado),
        )

    db.add_all([
        carga("CAMOMILA", "SCB01", "150", "5"),
        carga("CAMOMILA", "SCB03", "200", "4"),
        carga("PICAO", "SCB01", "80", "2", prioridade=1),
        carga("PICAO", "SCB02", "70", "2.5"),
        carga("SALSA", "SCB02", "120", "4"),
        carga("SALSA", "SCB03", "150", "3"),
        carga("FIBRA", "SCB01", "60", "3"),
        carga("FIBRA", "SCB02", "60", "3"),
        carga("FIBRA", "SCB03", "90", "3"),
        carga("AGRIAO", "SCB03", None, "3"),
        rendimento("CAMOMILA", "6", "1.1"),
        rendimento("PICAO", "4", "1.05"),
        rendimento("SALSA", "7", "1.1"),
        rendimento("FIBRA", "3", "1.05"),
    ])

    def demanda(codigo: str, kg: str, estagio: Estagio, prazo: int, prioridade: int = 0) -> Demanda:
        return Demanda(
            erva_id=ervas[codigo].id, kg=D(kg), estagio=estagio, prazo=dia(prazo),
            prioridade=prioridade, criado_por_id=usuario.id, observacao="Dado fictício",
        )

    # Fora do domingo: com a fábrica parada, a manutenção não teria efeito visível
    manutencao = dia(3) if dia(3).weekday() != 6 else dia(4)

    def lote(codigo: str, origem: Origem, chegada: int, kg: str) -> PrevisaoOferta:
        return PrevisaoOferta(
            erva_id=ervas[codigo].id, origem=origem, data_chegada=dia(chegada), kg_fresco=D(kg),
            criado_por_id=usuario.id, observacao="Dado fictício",
        )

    db.add_all([
        demanda("CAMOMILA", "150", Estagio.MOIDO, 6, prioridade=1),
        demanda("PICAO", "200", Estagio.DESIDRATADO, 5),
        demanda("SALSA", "80", Estagio.MOIDO, 10),
        demanda("FIBRA", "30", Estagio.MOIDO, 9),
        lote("CAMOMILA", Origem.PROCOMPETE, 1, "600"),
        lote("CAMOMILA", Origem.FAZENDA_PROPRIA, 3, "6000"),  # grande demais: vira perda
        lote("PICAO", Origem.FAZENDA_PROPRIA, 1, "500"),
        lote("PICAO", Origem.PD, 4, "400"),
        lote("SALSA", Origem.PROCOMPETE, 2, "400"),
        lote("SALSA", Origem.PROCOMPETE, 8, "300"),
        lote("FIBRA", Origem.FAZENDA_PROPRIA, 5, "300"),
        BloqueioSecador(
            secador_id=secadores["SCB02"].id, inicio=manutencao, fim=manutencao,
            motivo="Manutenção preventiva (fictícia)", criado_por_id=usuario.id,
        ),
    ])
    db.flush()

    # Histórico (dias passados): o que foi previsto e o que chegou de fato
    def recebido(previsao: PrevisaoOferta, chegada: int, kg: str) -> Recebimento:
        return Recebimento(
            previsao_id=previsao.id, erva_id=previsao.erva_id, origem=previsao.origem,
            data_recebimento=dia(chegada), kg_fresco=D(kg), registrado_por_id=usuario.id,
            observacao="Dado fictício",
        )

    menor = lote("CAMOMILA", Origem.PROCOMPETE, -10, "500")
    atrasada = lote("PICAO", Origem.FAZENDA_PROPRIA, -8, "300")
    no_prazo = lote("PICAO", Origem.PD, -4, "200")
    nao_veio = lote("SALSA", Origem.PROCOMPETE, -6, "250")
    db.add_all([menor, atrasada, no_prazo, nao_veio])
    db.flush()
    db.add_all([
        recebido(menor, -10, "420"),
        recebido(atrasada, -7, "300"),
        recebido(no_prazo, -4, "210"),
        Recebimento(
            erva_id=ervas["SALSA"].id, origem=Origem.FAZENDA_PROPRIA, data_recebimento=dia(-3),
            kg_fresco=D(80), registrado_por_id=usuario.id,
            observacao="Chegada não prevista (fictícia)",
        ),
    ])
    db.commit()
    log.info("Dados fictícios carregados (5 ervas, 3 secadores, 4 demandas, 11 previsões)")
