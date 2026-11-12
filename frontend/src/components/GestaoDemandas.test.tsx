import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Resposta, escritas, renderizarTela } from '../test/apiFalsa';
import GestaoDemandas from './GestaoDemandas';

// Dados fictícios
const ERVAS = [
  { id: 1, codigo: 'ERVA-A', nome: 'Erva A', ativo: true, regime_horas_dia: '24', espera_maxima_dias: 2 },
  { id: 2, codigo: 'ERVA-B', nome: 'Erva B', ativo: true, regime_horas_dia: '12', espera_maxima_dias: 1 },
];

const DEMANDA = {
  id: 7,
  erva: { id: 1, codigo: 'ERVA-A', nome: 'Erva A' },
  kg: '120.000',
  estagio: 'moido',
  prazo: '2026-12-10',
  reserva_kg: '0.000',
  prioridade: 1,
  observacao: null,
  criado_por: { id: 1, nome: 'Usuária Teste' },
};

const rotas = (extra = {}) => ({ 'GET /demandas': [DEMANDA], 'GET /ervas': ERVAS, ...extra });

describe('GestaoDemandas', () => {
  it('lista as demandas', async () => {
    renderizarTela(<GestaoDemandas />, rotas(), ['demanda.gerenciar']);

    expect(await screen.findByText('#7')).toBeInTheDocument();
    expect(screen.getByText('120 kg (moído)')).toBeInTheDocument();
    expect(screen.getByText('10/12/2026')).toBeInTheDocument();
  });

  it('sem demanda.gerenciar não mostra cadastrar, editar nem excluir', async () => {
    renderizarTela(<GestaoDemandas />, rotas(), ['demanda.consultar']);

    await screen.findByText('#7');
    expect(screen.queryByText('+ Nova Demanda')).not.toBeInTheDocument();
    expect(screen.queryByText('Editar')).not.toBeInTheDocument();
    expect(screen.queryByText('Excluir')).not.toBeInTheDocument();
  });

  it('edita a demanda mandando só o campo alterado', async () => {
    const usuario = userEvent.setup();
    const { chamadas } = renderizarTela(
      <GestaoDemandas />,
      rotas({ 'PATCH /demandas/7': (corpo: object) => ({ ...DEMANDA, ...corpo }) }),
      ['demanda.gerenciar']
    );

    await usuario.click(await screen.findByText('Editar'));
    expect(screen.getByText('Editar demanda #7')).toBeInTheDocument();

    const kg = screen.getByLabelText('Quantidade líquida (kg)');
    expect(kg).toHaveValue(120);
    await usuario.clear(kg);
    await usuario.type(kg, '150');
    await usuario.click(screen.getByText('Salvar alterações'));

    await screen.findByText('Demanda #7 atualizada');
    expect(escritas(chamadas)).toEqual([
      { metodo: 'PATCH', caminho: '/demandas/7', busca: '', corpo: { kg: '150' } },
    ]);
    // Depois de salvar, o formulário fecha
    expect(screen.queryByText('Editar demanda #7')).not.toBeInTheDocument();
  });

  it('mostra a erva inativa da demanda em edição', async () => {
    const usuario = userEvent.setup();
    const ativas = ERVAS.filter((e) => e.id !== 1);
    renderizarTela(<GestaoDemandas />, rotas({ 'GET /ervas': ativas }), ['demanda.gerenciar']);

    await usuario.click(await screen.findByText('Editar'));

    expect(screen.getByRole('option', { name: 'Erva A (inativa)' })).toBeInTheDocument();
  });

  it('cadastra uma demanda nova com POST', async () => {
    const usuario = userEvent.setup();
    const { chamadas } = renderizarTela(
      <GestaoDemandas />,
      rotas({ 'POST /demandas': (corpo: object) => ({ ...DEMANDA, id: 8, ...corpo }) }),
      ['demanda.gerenciar']
    );

    await usuario.click(await screen.findByText('+ Nova Demanda'));
    const form = screen.getByText('Nova demanda').closest('div')!;
    await usuario.selectOptions(within(form).getAllByRole('combobox')[0], '2');
    await usuario.type(screen.getByLabelText('Quantidade líquida (kg)'), '50');
    await usuario.type(screen.getByLabelText('Prazo'), '2026-12-20');
    await usuario.click(screen.getByText('Salvar demanda'));

    await screen.findByText('Demanda cadastrada');
    const [post] = escritas(chamadas);
    expect(post.metodo).toBe('POST');
    expect(post.corpo).toMatchObject({ erva_id: 2, kg: '50', prazo: '2026-12-20', estagio: 'moido', observacao: null });
  });

  it('mostra o erro do backend e mantém o formulário aberto', async () => {
    const usuario = userEvent.setup();
    renderizarTela(
      <GestaoDemandas />,
      rotas({ 'PATCH /demandas/7': new Resposta(404, { detail: 'Demanda não encontrada' }) }),
      ['demanda.gerenciar']
    );

    await usuario.click(await screen.findByText('Editar'));
    await usuario.clear(screen.getByLabelText('Prioridade (maior = mais urgente)'));
    await usuario.type(screen.getByLabelText('Prioridade (maior = mais urgente)'), '3');
    await usuario.click(screen.getByText('Salvar alterações'));

    expect(await screen.findByText('Não foi possível atualizar a demanda')).toBeInTheDocument();
    expect(screen.getByText('Demanda não encontrada')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Editar demanda #7')).toBeInTheDocument());
  });
});
