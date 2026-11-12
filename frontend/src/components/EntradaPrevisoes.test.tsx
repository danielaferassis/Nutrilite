import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { USUARIO_TESTE, escritas, renderizarTela } from '../test/apiFalsa';
import EntradaPrevisoes from './EntradaPrevisoes';

// Dados fictícios
const ERVAS = [{ id: 1, codigo: 'ERVA-A', nome: 'Erva A', ativo: true, regime_horas_dia: '24', espera_maxima_dias: 2 }];
const OUTRA_FONTE = { id: 9, nome: 'Outra Fonte' };

const previsao = (id: number, extra = {}) => ({
  id,
  erva: { id: 1, codigo: 'ERVA-A', nome: 'Erva A' },
  origem: 'procompete',
  data_chegada: '2026-12-03',
  kg_fresco: '800.000',
  observacao: null,
  recebida: false,
  criado_por: { id: USUARIO_TESTE.id, nome: USUARIO_TESTE.nome },
  ...extra,
});

const linhaDa = (id: number) => screen.getByText(`#${id}`).closest('tr')!;

describe('EntradaPrevisoes', () => {
  it('previsão recebida fica travada: sem editar nem excluir', async () => {
    renderizarTela(
      <EntradaPrevisoes />,
      { 'GET /previsoes': [previsao(1), previsao(2, { recebida: true })], 'GET /ervas': ERVAS },
      ['previsao.gerenciar']
    );

    await screen.findByText('#2');
    expect(linhaDa(1)).toHaveTextContent('Editar');
    expect(linhaDa(2)).toHaveTextContent('Recebida');
    expect(linhaDa(2)).not.toHaveTextContent('Editar');
    expect(linhaDa(2)).not.toHaveTextContent('Excluir');
  });

  it('Fonte fornecedora só altera as próprias previsões', async () => {
    renderizarTela(
      <EntradaPrevisoes />,
      { 'GET /previsoes': [previsao(1), previsao(2, { criado_por: OUTRA_FONTE })], 'GET /ervas': ERVAS },
      ['previsao.propria']
    );

    await screen.findByText('#2');
    expect(linhaDa(1)).toHaveTextContent('Editar');
    expect(linhaDa(2)).not.toHaveTextContent('Editar');
  });

  it('edita a data de chegada com PATCH e volta ao registo manual', async () => {
    const usuario = userEvent.setup();
    const { chamadas } = renderizarTela(
      <EntradaPrevisoes />,
      {
        'GET /previsoes': [previsao(1)],
        'GET /ervas': ERVAS,
        'PATCH /previsoes/1': (corpo: object) => ({ ...previsao(1), ...corpo }),
      },
      ['previsao.gerenciar']
    );

    await usuario.click(await screen.findByText('Editar'));
    expect(screen.getByText('Editar previsão #1')).toBeInTheDocument();

    const data = screen.getByLabelText('Data prevista de chegada');
    await usuario.clear(data);
    await usuario.type(data, '2026-12-04');
    await usuario.click(screen.getByText('Salvar alterações'));

    await screen.findByText('Previsão #1 atualizada');
    expect(escritas(chamadas)).toEqual([
      { metodo: 'PATCH', caminho: '/previsoes/1', busca: '', corpo: { data_chegada: '2026-12-04' } },
    ]);
    expect(screen.getByText('Registo Manual')).toBeInTheDocument();
  });

  it('cancelar a edição limpa o formulário sem chamar a API', async () => {
    const usuario = userEvent.setup();
    const { chamadas } = renderizarTela(
      <EntradaPrevisoes />,
      { 'GET /previsoes': [previsao(1)], 'GET /ervas': ERVAS },
      ['previsao.gerenciar']
    );

    await usuario.click(await screen.findByText('Editar'));
    expect(screen.getByLabelText('Quantidade de erva fresca (kg)')).toHaveValue(800);
    await usuario.click(screen.getByText('Cancelar'));

    expect(screen.getByText('Registo Manual')).toBeInTheDocument();
    expect(screen.getByLabelText('Quantidade de erva fresca (kg)')).toHaveValue(null);
    expect(escritas(chamadas)).toEqual([]);
  });
});
