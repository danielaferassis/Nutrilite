import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Resposta, escritas, renderizarTela } from '../test/apiFalsa';
import Bloqueios from './Bloqueios';

// Dados fictícios
const SECADORES = [
  { id: 1, codigo: 'SCB01', nome: 'Secador elétrico', ativo: true },
  { id: 2, codigo: 'SCB02', nome: 'Secador a vapor', ativo: true },
];

const BLOQUEIO = {
  id: 4,
  secador: { id: 1, codigo: 'SCB01', nome: 'Secador elétrico' },
  inicio: '2026-12-07',
  fim: '2026-12-08',
  motivo: 'Manutenção preventiva',
  criado_por: { id: 1, nome: 'Usuária Teste' },
};

const rotas = (extra = {}) => ({ 'GET /bloqueios': [BLOQUEIO], 'GET /secadores': SECADORES, ...extra });

describe('Bloqueios', () => {
  it('edita o fim do bloqueio com PATCH', async () => {
    const usuario = userEvent.setup();
    const { chamadas } = renderizarTela(
      <Bloqueios />,
      rotas({ 'PATCH /bloqueios/4': (corpo: object) => ({ ...BLOQUEIO, ...corpo }) }),
      ['bloqueio.gerenciar']
    );

    await usuario.click(await screen.findByText('Editar'));
    expect(screen.getByText('Editar bloqueio de SCB01 (07/12/2026 a 08/12/2026)')).toBeInTheDocument();
    expect(screen.getByLabelText('Motivo')).toHaveValue('Manutenção preventiva');

    const fim = screen.getByLabelText('Fim (inclusive)');
    await usuario.clear(fim);
    await usuario.type(fim, '2026-12-09');
    await usuario.click(screen.getByText('Salvar'));

    await screen.findByText('Bloqueio atualizado');
    expect(escritas(chamadas)).toEqual([
      { metodo: 'PATCH', caminho: '/bloqueios/4', busca: '', corpo: { fim: '2026-12-09' } },
    ]);
    expect(screen.getByText('Bloquear')).toBeInTheDocument();
  });

  it('mostra a recusa do backend (fim antes do início)', async () => {
    const usuario = userEvent.setup();
    renderizarTela(
      <Bloqueios />,
      rotas({ 'PATCH /bloqueios/4': new Resposta(422, { detail: 'fim não pode ser anterior ao início' }) }),
      ['bloqueio.gerenciar']
    );

    await usuario.click(await screen.findByText('Editar'));
    const fim = screen.getByLabelText('Fim (inclusive)');
    await usuario.clear(fim);
    await usuario.type(fim, '2026-12-01');
    await usuario.click(screen.getByText('Salvar'));

    expect(await screen.findByText('Não foi possível atualizar o bloqueio')).toBeInTheDocument();
    expect(screen.getByText('fim não pode ser anterior ao início')).toBeInTheDocument();
  });

  it('quem só consulta não vê o formulário nem os botões', async () => {
    renderizarTela(<Bloqueios />, rotas(), ['bloqueio.consultar']);

    await screen.findByText('Manutenção preventiva');
    expect(screen.queryByText('Bloquear')).not.toBeInTheDocument();
    expect(screen.queryByText('Editar')).not.toBeInTheDocument();
  });
});
