import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Resposta, escritas, renderizarTela } from '../test/apiFalsa';
import EntradaPrevisoes from './EntradaPrevisoes';
import ImportacaoPrevisoes from './ImportacaoPrevisoes';

// Dados fictícios
const ERVAS = [
  { id: 1, codigo: 'ERVA-A', nome: 'Erva A', ativo: true, regime_horas_dia: '24', espera_maxima_dias: 2 },
  { id: 2, codigo: 'ERVA-B', nome: 'Erva B', ativo: true, regime_horas_dia: '12', espera_maxima_dias: 2 },
];

const PREVIA = {
  aplicada: false,
  abas: ['Erva A 2026', 'Resumo'],
  aba: 'Erva A 2026',
  erva_na_planilha: 'Erva A',
  erva_sugerida_id: 1,
  erva_id: 1,
  origem: 'fazenda_propria',
  talhoes: ['Talhão 01', 'Talhão 02'],
  de: '2026-12-01',
  ate: '2026-12-05',
  total_kg: '1500.000',
  criar: [{ talhao: 'Talhão 01', data_chegada: '2026-12-01', kg_fresco: '600.000', kg_atual: null, previsao_id: null }],
  alterar: [{ talhao: 'Talhão 02', data_chegada: '2026-12-02', kg_fresco: '900.000', kg_atual: '800.000', previsao_id: 7 }],
  remover: [],
  avisos: [],
  erros: [],
};

const ARQUIVO = new File(['planilha'], 'programacao.xlsx');

const enviarArquivo = async (usuario: ReturnType<typeof userEvent.setup>) =>
  usuario.upload(await screen.findByLabelText('Arquivo'), ARQUIVO);

describe('ImportacaoPrevisoes', () => {
  it('mostra a prévia, refaz com a erva escolhida e confirma com aba, erva e origem', async () => {
    const usuario = userEvent.setup();
    const aoImportar = vi.fn();
    const { chamadas } = renderizarTela(
      <ImportacaoPrevisoes ervas={ERVAS} aoImportar={aoImportar} />,
      {
        'POST /previsoes/importacao/previa': (corpo: Record<string, unknown>) => ({
          ...PREVIA,
          erva_id: corpo.erva_id ? Number(corpo.erva_id) : PREVIA.erva_id,
        }),
        'POST /previsoes/importacao': { ...PREVIA, aplicada: true },
      },
      ['previsao.gerenciar']
    );

    await enviarArquivo(usuario);

    expect(await screen.findByText('Criar: 1')).toBeInTheDocument();
    expect(screen.getByText('Alterar: 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Erva')).toHaveValue('1');
    // A primeira prévia vai só com o arquivo e a origem: o servidor sugere aba e erva
    const primeira = escritas(chamadas)[0].corpo;
    expect(primeira.arquivo).toBeInstanceOf(File);
    expect(primeira.aba).toBeUndefined();

    await usuario.selectOptions(screen.getByLabelText('Erva'), '2');
    await waitFor(() => expect(escritas(chamadas)).toHaveLength(2));
    expect(escritas(chamadas)[1].corpo).toMatchObject({ aba: 'Erva A 2026', erva_id: '2', origem: 'fazenda_propria' });

    await usuario.click(await screen.findByRole('button', { name: 'Confirmar importação' }));
    await usuario.click(await screen.findByRole('button', { name: 'Importar' }));

    await waitFor(() => expect(aoImportar).toHaveBeenCalled());
    const aplicar = escritas(chamadas).at(-1)!;
    expect(aplicar.caminho).toBe('/previsoes/importacao');
    expect(aplicar.corpo).toMatchObject({ aba: 'Erva A 2026', erva_id: '2', origem: 'fazenda_propria' });
    expect(await screen.findByText('Previsões importadas')).toBeInTheDocument();
  });

  it('com erro na planilha lista os erros e não deixa confirmar', async () => {
    const usuario = userEvent.setup();
    renderizarTela(
      <ImportacaoPrevisoes ervas={ERVAS} aoImportar={vi.fn()} />,
      {
        'POST /previsoes/importacao/previa': {
          ...PREVIA,
          erros: [{ linha: 5, coluna: 'G', mensagem: "Valor não numérico: 'abc'" }],
        },
      },
      ['previsao.gerenciar']
    );

    await enviarArquivo(usuario);

    expect(await screen.findByText("G5: Valor não numérico: 'abc'")).toBeInTheDocument();
    expect(screen.queryByText('Criar: 1')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar importação' })).toBeDisabled();
  });

  it('arquivo fora do layout mostra a mensagem do servidor', async () => {
    const usuario = userEvent.setup();
    renderizarTela(
      <ImportacaoPrevisoes ervas={ERVAS} aoImportar={vi.fn()} />,
      {
        'POST /previsoes/importacao/previa': new Resposta(422, {
          detail: "A aba 'Resumo' não está no formato da programação: não encontrei a coluna 'Mês'",
        }),
      },
      ['previsao.gerenciar']
    );

    await enviarArquivo(usuario);

    expect(await screen.findByText(/não encontrei a coluna 'Mês'/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar importação' })).not.toBeInTheDocument();
  });

  it('na tela de previsões, só quem gerencia todas vê a importação', async () => {
    renderizarTela(
      <EntradaPrevisoes />,
      { 'GET /previsoes': [], 'GET /ervas': ERVAS },
      ['previsao.propria']
    );

    expect(await screen.findByText('A importação da planilha é feita pelo PCP.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Arquivo')).not.toBeInTheDocument();
  });
});
