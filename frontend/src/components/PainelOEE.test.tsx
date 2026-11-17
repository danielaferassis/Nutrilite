import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { renderizarTela } from '../test/apiFalsa';
import PainelOEE from './PainelOEE';

// Dados fictícios
const indicadores = (extra = {}) => ({
  horas_disponiveis: 24,
  horas_apontadas: 6,
  cargas: 2,
  cargas_sem_padrao: 0,
  disponibilidade_pct: 25,
  performance_pct: 83.3,
  qualidade_pct: null,
  oee_pct: null,
  oee_sem_qualidade_pct: 20.8,
  kg_planejado: 800,
  kg_apontado: 600,
  aderencia_pct: 75,
  ...extra,
});

const RESPOSTA = {
  de: '2026-12-01',
  ate: '2026-12-07',
  total: indicadores(),
  secadores: [
    { secador: { id: 1, codigo: 'SEC-1', nome: 'Secador 1' }, ...indicadores({ cargas_sem_padrao: 1 }) },
    {
      secador: { id: 2, codigo: 'SEC-2', nome: 'Secador 2' },
      ...indicadores({ cargas: 0, disponibilidade_pct: null, performance_pct: null, oee_sem_qualidade_pct: null, aderencia_pct: null }),
    },
  ],
  dias: [{ dia: '2026-12-01', secador_id: 1, ...indicadores() }],
  avisos: ['1 carga(s) sem tempo padrão na Matriz de Capacidade (erva × secador): ficaram fora da performance'],
};

describe('PainelOEE', () => {
  it('mostra os indicadores, qualidade não informada e n/a onde não se aplica', async () => {
    renderizarTela(<PainelOEE />, { 'GET /indicadores/secagem': RESPOSTA }, ['plano.consultar']);

    expect(await screen.findByRole('region', { name: 'Disponibilidade' })).toHaveTextContent('25%');
    expect(screen.getByText('não informada')).toBeInTheDocument();
    expect(screen.getAllByText('20,8%').length).toBeGreaterThan(0);
    expect(screen.getByText(/600 kg de 800 kg planejados/)).toBeInTheDocument();
    expect(screen.getByText(/ficaram fora da performance/)).toBeInTheDocument();
    // Secador sem dados: "n/a", nunca 0%
    const linhaSec2 = screen.getByText('SEC-2').closest('tr')!;
    expect(linhaSec2).toHaveTextContent('n/a');
    expect(linhaSec2).not.toHaveTextContent('0%');
    expect(screen.getByText('2 (1 sem padrão)')).toBeInTheDocument();
  });

  it('busca de novo ao mudar o período', async () => {
    const usuario = userEvent.setup();
    const { chamadas } = renderizarTela(<PainelOEE />, { 'GET /indicadores/secagem': RESPOSTA }, ['plano.consultar']);
    await screen.findByRole('region', { name: 'Disponibilidade' });

    const de = screen.getByLabelText('De');
    await usuario.clear(de);
    await usuario.type(de, '2026-11-01');

    const buscas = chamadas.filter((c) => c.caminho === '/indicadores/secagem');
    expect(buscas.at(-1)!.busca).toContain('de=2026-11-01');
  });
});
