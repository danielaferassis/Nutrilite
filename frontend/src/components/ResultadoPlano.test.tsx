import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ResultadoSimulacao } from '../tipos';
import { capturarDownloads } from '../test/download';
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

  describe('exportação', () => {
    afterEach(() => vi.restoreAllMocks());

    it('baixa o cronograma com o nome do plano e o período', async () => {
      const arquivos = capturarDownloads();
      render(<ResultadoPlano resultado={RESULTADO} nomeArquivo="plano-v3" />);

      await userEvent.click(screen.getByText('Baixar cronograma (Excel)'));

      const [{ nome, blob }] = arquivos;
      expect(nome).toBe('plano-v3_cronograma_2026-12-01_a_2026-12-07.csv');
      // O arquivo começa com o BOM do UTF-8 (o blob.text() o descarta ao decodificar)
      expect([...new Uint8Array(await blob.arrayBuffer()).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
      const linhas = (await blob.text()).split('\r\n');
      expect(linhas[0]).toBe('Dia;Secador;Erva;Kg de fresco;Horas de secagem;Horas de setup;Lote;Demanda');
      expect(linhas[1]).toBe('02/12/2026;SEC-1;ERVA-A;500;4;1;1;1');
      expect(linhas[4]).toBe('02/12/2026;SEC-1;ERVA-A;50;4;1;1;sem demanda');
    });

    it('as necessidades saem com a mesma situação da tela', async () => {
      const arquivos = capturarDownloads();
      render(<ResultadoPlano resultado={RESULTADO} />);

      await userEvent.click(screen.getByText('Baixar necessidades (Excel)'));

      const linhas = (await arquivos[0].blob.text()).split('\r\n');
      expect(arquivos[0].nome).toBe('simulacao_necessidades_2026-12-01_a_2026-12-07.csv');
      expect(linhas[2]).toBe('2;ERVA-A;80;Desidratado;400;06/12/2026;100;300;Atraso');
      expect(linhas[3]).toBe('3;ERVA-A;120;Desidratado;600;10/12/2026;200;400;Continua no próximo plano');
    });
  });
});
