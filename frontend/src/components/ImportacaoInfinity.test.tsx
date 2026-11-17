import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Resposta, escritas, renderizarTela } from '../test/apiFalsa';
import ImportacaoInfinity from './ImportacaoInfinity';

// Dados fictícios
const importacao = (id: number, extra = {}) => ({
  id,
  tipo: 'infinity_csv',
  nome_arquivo: `export-${id}.csv`,
  tamanho_bytes: 100,
  status: 'concluido',
  tentativas: 1,
  linhas_total: 4,
  linhas_com_erro: 0,
  linhas_ignoradas: 1,
  mensagem_erro: null,
  arquivo_disponivel: true,
  usuario: { id: 1, nome: 'Usuária Teste' },
  criado_em: '2026-12-07T10:00:00Z',
  finalizado_em: '2026-12-07T10:00:05Z',
  ...extra,
});

const ARQUIVO = new File(['Processo;Data'], 'export.csv');

describe('ImportacaoInfinity', () => {
  it('lista as importações com gravadas e duplicadas ignoradas', async () => {
    renderizarTela(<ImportacaoInfinity />, { 'GET /importacoes': [importacao(1)] }, ['relatorio.importacao']);

    expect(await screen.findByText('3 apontamento(s) gravado(s), 1 duplicado(s) ignorado(s)')).toBeInTheDocument();
    expect(screen.getByText('Concluída')).toBeInTheDocument();
  });

  it('envia o arquivo com o tipo do Infinity', async () => {
    const usuario = userEvent.setup();
    const { chamadas } = renderizarTela(
      <ImportacaoInfinity />,
      { 'GET /importacoes': [], 'POST /importacoes': importacao(2, { status: 'pendente' }) },
      ['relatorio.importacao']
    );

    await usuario.upload(await screen.findByLabelText('Export do Infinity (.csv ou .xlsx)'), ARQUIVO);
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByText('Arquivo enviado')).toBeInTheDocument();
    const envio = escritas(chamadas)[0];
    expect(envio.corpo.tipo).toBe('infinity_csv');
    expect(envio.corpo.arquivo).toBeInstanceOf(File);
    expect(envio.corpo.forcar).toBeUndefined();
  });

  it('arquivo repetido: pergunta e reenvia com forcar', async () => {
    const usuario = userEvent.setup();
    const { chamadas } = renderizarTela(
      <ImportacaoInfinity />,
      {
        'GET /importacoes': [],
        'POST /importacoes': (corpo: Record<string, unknown>) =>
          corpo.forcar
            ? importacao(3, { status: 'pendente' })
            : new Resposta(409, { detail: 'Este arquivo já foi enviado (importação #1).' }),
      },
      ['relatorio.importacao']
    );

    await usuario.upload(await screen.findByLabelText('Export do Infinity (.csv ou .xlsx)'), ARQUIVO);
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }));
    await usuario.click(await screen.findByRole('button', { name: 'Enviar de novo' }));

    await waitFor(() => expect(escritas(chamadas)).toHaveLength(2));
    expect(escritas(chamadas)[1].corpo.forcar).toBe('true');
  });

  it('importação com erro mostra os erros por linha', async () => {
    const usuario = userEvent.setup();
    renderizarTela(
      <ImportacaoInfinity />,
      {
        'GET /importacoes': [importacao(4, { status: 'erro', mensagem_erro: '1 linha(s) com erro. Nada foi importado.' })],
        'GET /importacoes/4/erros': [
          { linha: 3, coluna: 'Processo', mensagem: "Processo 'SEC-99' não está ligado a nenhum secador" },
        ],
      },
      ['relatorio.importacao']
    );

    await usuario.click(await screen.findByRole('button', { name: 'Ver erros' }));

    expect(await screen.findByText(/Linha 3 \(Processo\):/)).toBeInTheDocument();
    expect(screen.getByText('1 linha(s) com erro. Nada foi importado.')).toBeInTheDocument();
  });

  it('sem permissão não busca nada', async () => {
    const { chamadas } = renderizarTela(<ImportacaoInfinity />, {}, ['plano.consultar']);

    expect(await screen.findByText('Seu perfil não tem acesso à importação do Infinity.')).toBeInTheDocument();
    expect(chamadas.filter((c) => c.caminho.startsWith('/importacoes'))).toHaveLength(0);
  });
});
