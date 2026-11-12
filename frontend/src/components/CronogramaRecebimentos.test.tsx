import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { escritas, renderizarTela } from '../test/apiFalsa';
import CronogramaRecebimentos from './CronogramaRecebimentos';

// Dados fictícios
const ERVA = { id: 1, codigo: 'ERVA-A', nome: 'Erva A' };

const RECEBIMENTO = {
  id: 3,
  previsao_id: 1,
  erva: ERVA,
  origem: 'procompete',
  data_recebimento: '2026-12-02',
  kg_fresco: '500.000',
  observacao: null,
  registrado_por: { id: 1, nome: 'Usuária Teste' },
};

const CRONOGRAMA = {
  de: '2026-12-01',
  ate: '2026-12-07',
  hoje: '2026-12-05',
  planos: [],
  alocacoes: [],
  chegadas: [
    {
      previsao_id: 1,
      erva: ERVA,
      origem: 'procompete',
      data_prevista: '2026-12-01',
      kg_previsto: '800.000',
      recebimentos: [RECEBIMENTO],
      kg_recebido: '500.000',
      desvio_kg: '-300.000',
      situacao: 'recebida',
    },
  ],
};

const rotas = (extra = {}) => ({ 'GET /cronograma': CRONOGRAMA, 'GET /ervas': [], ...extra });

describe('CronogramaRecebimentos', () => {
  it('corrige o kg do recebimento com PATCH, sem mexer em erva e origem', async () => {
    const usuario = userEvent.setup();
    const { chamadas } = renderizarTela(
      <CronogramaRecebimentos />,
      rotas({ 'PATCH /recebimentos/3': (corpo: object) => ({ ...RECEBIMENTO, ...corpo }) }),
      ['recebimento.registrar']
    );

    await usuario.click(await screen.findByText('corrigir'));
    expect(screen.getByText('Corrigir recebimento de Erva A (Procompete)')).toBeInTheDocument();
    // Correção não troca a erva nem a origem
    expect(screen.queryByLabelText('Origem')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Data da chegada')).toHaveValue('2026-12-02');

    const kg = screen.getByLabelText('Kg de erva fresca recebidos');
    await usuario.clear(kg);
    await usuario.type(kg, '520');
    await usuario.click(screen.getByText('Salvar correção'));

    await screen.findByText('Recebimento corrigido');
    expect(escritas(chamadas)).toEqual([
      { metodo: 'PATCH', caminho: '/recebimentos/3', busca: '', corpo: { kg_fresco: '520' } },
    ]);
  });

  it('quem só consulta não vê corrigir nem remover', async () => {
    renderizarTela(<CronogramaRecebimentos />, rotas(), ['cronograma.consultar']);

    await screen.findByText('Chegadas de erva fresca');
    expect(screen.queryByText('corrigir')).not.toBeInTheDocument();
    expect(screen.queryByText('remover')).not.toBeInTheDocument();
  });
});
