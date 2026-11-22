import { describe, expect, it } from 'vitest';

import { confiabilidadePorOrigem } from './indicadores';
import type { Chegada } from './tipos';

// Dados fictícios
const chegada = (erva: string, previsto: number, recebido: number, data = '2026-12-02'): Chegada => ({
  previsao_id: 1,
  erva: { id: erva === 'Erva A' ? 1 : 2, codigo: erva, nome: erva },
  origem: 'procompete',
  data_prevista: data,
  kg_previsto: String(previsto),
  recebimentos: recebido ? [{ data_recebimento: data } as Chegada['recebimentos'][number]] : [],
  kg_recebido: String(recebido),
  desvio_kg: String(recebido - previsto),
  situacao: recebido ? 'recebida' : 'atrasada',
});

describe('confiabilidadePorOrigem', () => {
  it('separa por erva: kg de ervas diferentes não se somam', () => {
    const linhas = confiabilidadePorOrigem(
      [chegada('Erva A', 100, 100), chegada('Erva B', 900, 0), chegada('Erva A', 100, 50)],
      '2026-12-01',
      '2026-12-05'
    );

    expect(linhas.map((l) => [l.origem, l.erva, l.kgPrevisto, l.kgRecebido, l.aderenciaPct, l.pontualidadePct])).toEqual([
      ['procompete', 'Erva A', 200, 150, 75, 100],
      ['procompete', 'Erva B', 900, 0, 0, 0],
    ]);
  });

  it('previsão futura fica de fora', () => {
    expect(confiabilidadePorOrigem([chegada('Erva A', 100, 0, '2026-12-09')], '2026-12-01', '2026-12-05')).toEqual([]);
  });
});
