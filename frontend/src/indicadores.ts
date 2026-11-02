// Indicadores de confiabilidade das fontes, calculados a partir do cronograma.
// Regra do projeto: denominador zero → null ("não aplicável"), nunca 0.

import type { Chegada, Origem } from './tipos';

export interface ConfiabilidadeOrigem {
  origem: Origem;
  /** Previsões com data já vencida (até hoje). */
  previsoes: number;
  kgPrevisto: number;
  kgRecebido: number;
  /** kg recebidos ÷ kg previstos, em %. */
  aderenciaPct: number | null;
  /** Recebidas até a data prevista ÷ previsões vencidas, em %. */
  pontualidadePct: number | null;
}

const pct = (parte: number, total: number) => (total > 0 ? (100 * parte) / total : null);

/**
 * Só previsões com data prevista entre `de` e `hoje`: as futuras ainda não
 * podem ter chegado e distorceriam os números. Chegada não prevista fica fora
 * (não tem previsto para comparar).
 */
export function confiabilidadePorOrigem(chegadas: Chegada[], de: string, hoje: string) {
  const porOrigem = new Map<Origem, ConfiabilidadeOrigem>();
  for (const c of chegadas) {
    if (!c.data_prevista || !c.kg_previsto || c.data_prevista < de || c.data_prevista > hoje) continue;
    const item = porOrigem.get(c.origem) ?? {
      origem: c.origem, previsoes: 0, kgPrevisto: 0, kgRecebido: 0, aderenciaPct: null, pontualidadePct: null,
    };
    item.previsoes += 1;
    item.kgPrevisto += Number(c.kg_previsto);
    item.kgRecebido += Number(c.kg_recebido);
    porOrigem.set(c.origem, item);
  }
  return [...porOrigem.values()].map((item) => {
    const pontuais = chegadas.filter(
      (c) =>
        c.origem === item.origem &&
        c.data_prevista && c.data_prevista >= de && c.data_prevista <= hoje &&
        c.recebimentos.some((r) => r.data_recebimento <= c.data_prevista!)
    ).length;
    return {
      ...item,
      aderenciaPct: pct(item.kgRecebido, item.kgPrevisto),
      pontualidadePct: pct(pontuais, item.previsoes),
    };
  });
}

/** Previsões cuja data já passou sem nenhum recebimento. */
export const naoChegaram = (chegadas: Chegada[]) => chegadas.filter((c) => c.situacao === 'atrasada');
