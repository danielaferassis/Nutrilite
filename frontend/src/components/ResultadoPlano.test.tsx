import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ResultadoSimulacao } from '../tipos';
import ResultadoPlano from './ResultadoPlano';

// Dados fictícios: plano de 01/12 a 07/12
const alocacao = (demanda_id: string | null, kg_fresco: number) => ({
  secador: 'SEC-1',
  erva: 'ERVA-A',
  dia: '2026-12-02',
  kg_fresco,
  horas_secagem: 4,
  horas_setup: 1,
  lote_id: '1',
  demanda_id,
});

const necessidade = (demanda_id: string, kg_fresco: number, prazo: string) => ({
  demanda_id,
  erva: 'ERVA-A',
  kg_meta: kg_fresco / 5,
  estagio_meta: 'desidratado' as const,
  kg_fresco,
  prazo,
});

const RESULTADO: ResultadoSimulacao = {
  inicio: '2026-12-01',
  fim: '2026-12-07',
  viavel: false,
  necessidades: [
    necessidade('1', 500, '2026-12-05'), // coberta
    necessidade('2', 400, '2026-12-06'), // atraso: recebe 100
    necessidade('3', 600, '2026-12-10'), // vence depois do fim: recebe 200
  ],
  alocacoes: [alocacao('1', 500), alocacao('2', 100), alocacao('3', 200), alocacao(null, 50)],
  pendencias: [],
  kpis: { saldo_nao_alocado_kg: { 'ERVA-A': 300 }, a_cobrir_apos_horizonte_kg: { 'ERVA-A': 400 } },
  avisos: [],
};

// Linha da demanda na tabela de necessidades (o "#1" também aparece como lote no detalhe)
const linhaDa = (demanda: string) => {
  const tabela = screen.getByText('Necessidade de erva fresca (cálculo reverso)').closest('div')!;
  return within(tabela).getByText(demanda).closest('tr')!;
};

describe('ResultadoPlano', () => {
  it('mostra quanto cada demanda recebeu e separa atraso de "próximo plano"', () => {
    render(<ResultadoPlano resultado={RESULTADO} />);

    expect(linhaDa('#1')).toHaveTextContent('Coberta');
    expect(linhaDa('#2')).toHaveTextContent('100 kg');
    expect(linhaDa('#2')).toHaveTextContent('300 kg');
    expect(linhaDa('#2')).toHaveTextContent('Atraso');
    expect(linhaDa('#3')).toHaveTextContent('200 kg');
    expect(linhaDa('#3')).toHaveTextContent('Continua no próximo plano');
  });

  it('avisa o que ainda falta para as demandas que vencem depois do fim', () => {
    render(<ResultadoPlano resultado={RESULTADO} />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Demandas que vencem depois de 07/12/2026 já recebem a secagem deste plano. Ainda faltam 400 kg de ERVA-A'
    );
  });

  it('sem demanda futura, não mostra o aviso', () => {
    render(<ResultadoPlano resultado={{ ...RESULTADO, kpis: { a_cobrir_apos_horizonte_kg: {} } }} />);

    expect(screen.queryByText(/vencem depois de/)).not.toBeInTheDocument();
  });
});
