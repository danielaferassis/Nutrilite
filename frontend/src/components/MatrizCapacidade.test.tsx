import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Resposta, escritas, renderizarTela } from '../test/apiFalsa';
import MatrizCapacidade from './MatrizCapacidade';

// Dados fictícios
const ERVA_A = { id: 1, codigo: 'ERVA-A', nome: 'Erva A', ativo: true, regime_horas_dia: '24.00', espera_maxima_dias: 2 };
const ERVA_B = { id: 2, codigo: 'ERVA-B', nome: 'Erva B', ativo: true, regime_horas_dia: null, espera_maxima_dias: null };
const SEC_1 = { id: 1, codigo: 'SEC-1', nome: 'Secador 1', ativo: true };
const SEC_2 = { id: 2, codigo: 'SEC-2', nome: 'Secador 2', ativo: true };

const CAPACIDADE = {
  id: 5,
  erva_id: 1,
  secador_id: 1,
  modo: 'por_carga',
  kg_fresco_por_hora: null,
  kg_por_carga: '100.000',
  horas_por_carga: '4.00',
  setup_inicial_h: '1.00',
  setup_final_h: '2.00',
  setup_diario_h: '1.00',
  setup_dentro_do_regime: true,
  prioridade: null,
};

const rotas = (extra = {}) => ({
  'GET /ervas': [ERVA_A, ERVA_B],
  'GET /secadores': [SEC_1, SEC_2],
  'GET /capacidades': [CAPACIDADE],
  'GET /rendimentos': [{ id: 3, erva_id: 1, fresco_por_desidratado: '5.0000', desidratado_por_moido: null }],
  ...extra,
});

const GERENCIAR = ['cadastro.gerenciar'];

// Célula da matriz: linha da erva × coluna do secador
const celula = (erva: string, coluna: number) =>
  screen.getByText(erva).closest('tr')!.querySelectorAll('td')[coluna];

describe('MatrizCapacidade', () => {
  it('sem cadastro.gerenciar só consulta', async () => {
    renderizarTela(<MatrizCapacidade />, rotas(), []);

    await screen.findByText('Erva B');
    expect(screen.queryByRole('button', { name: 'Nova erva' })).not.toBeInTheDocument();
    expect(screen.queryByText('editar')).not.toBeInTheDocument();
    expect(screen.queryByText('cadastrar')).not.toBeInTheDocument();
  });

  it('mostra parâmetro ausente como "não informado", nunca zero', async () => {
    renderizarTela(<MatrizCapacidade />, rotas(), []);

    const ervaB = (await screen.findByText('Erva B')).closest('td')!;
    expect(within(ervaB).getAllByText('não informado')).toHaveLength(4);
    // Rendimento desidratado/moído da Erva A também falta
    expect(within(celula('Erva A', 0)).getByText('não informado')).toBeInTheDocument();
  });

  it('cadastra capacidade numa célula vazia; campo vazio vai como null', async () => {
    const usuario = userEvent.setup();
    const { chamadas } = renderizarTela(
      <MatrizCapacidade />,
      rotas({ 'POST /capacidades': (corpo: object) => ({ id: 6, ...corpo }) }),
      GERENCIAR
    );

    await screen.findByText('Erva B');
    await usuario.click(within(celula('Erva B', 1)).getByText('cadastrar'));
    expect(screen.getByText('Capacidade: Erva B no SEC-1')).toBeInTheDocument();

    await usuario.selectOptions(screen.getByLabelText('Modo de secagem'), 'por_carga');
    await usuario.type(screen.getByLabelText('Kg de fresco por carga'), '150');
    await usuario.type(screen.getByLabelText('Horas por carga'), '5');
    await usuario.type(screen.getByLabelText('Setup diário / Interv (h)'), '3');
    await usuario.click(screen.getByText('Salvar'));

    await screen.findByText('Capacidade salva');
    expect(escritas(chamadas)).toEqual([
      {
        metodo: 'POST',
        caminho: '/capacidades',
        busca: '',
        corpo: {
          erva_id: 2,
          secador_id: 1,
          modo: 'por_carga',
          kg_fresco_por_hora: null,
          kg_por_carga: '150',
          horas_por_carga: '5',
          setup_inicial_h: null,
          setup_final_h: null,
          setup_diario_h: '3',
          setup_dentro_do_regime: null,
          prioridade: null,
        },
      },
    ]);
  });

  it('limpar um parâmetro manda null no PATCH (vira "não informado")', async () => {
    const usuario = userEvent.setup();
    const { chamadas } = renderizarTela(
      <MatrizCapacidade />,
      rotas({ 'PATCH /capacidades/5': (corpo: object) => ({ ...CAPACIDADE, ...corpo }) }),
      GERENCIAR
    );

    await screen.findByText('Erva A');
    await usuario.click(within(celula('Erva A', 1)).getByText('editar'));
    await usuario.clear(screen.getByLabelText('Setup diário / Interv (h)'));
    await usuario.type(screen.getByLabelText('Prioridade (menor = preferido; vazio = sem preferência)'), '1');
    await usuario.click(screen.getByText('Salvar'));

    await screen.findByText('Capacidade salva');
    expect(escritas(chamadas)).toEqual([
      { metodo: 'PATCH', caminho: '/capacidades/5', busca: '', corpo: { setup_diario_h: null, prioridade: 1 } },
    ]);
  });

  it('remove a capacidade depois de confirmar', async () => {
    const usuario = userEvent.setup();
    const { chamadas } = renderizarTela(<MatrizCapacidade />, rotas({ 'DELETE /capacidades/5': null }), GERENCIAR);

    await screen.findByText('Erva A');
    await usuario.click(within(celula('Erva A', 1)).getByText('editar'));
    await usuario.click(screen.getByText('Remover (não opera)'));
    await usuario.click(await screen.findByRole('button', { name: 'Remover' }));

    await screen.findByText('Capacidade removida');
    expect(escritas(chamadas)).toEqual([{ metodo: 'DELETE', caminho: '/capacidades/5', busca: '', corpo: undefined }]);
  });

  it('cadastra erva nova e o rendimento dela', async () => {
    const usuario = userEvent.setup();
    const { chamadas } = renderizarTela(
      <MatrizCapacidade />,
      rotas({
        'POST /ervas': (corpo: object) => ({ id: 9, ...corpo }),
        'POST /rendimentos': (corpo: object) => ({ id: 4, ...corpo }),
      }),
      GERENCIAR
    );

    await usuario.click(await screen.findByRole('button', { name: 'Nova erva' }));
    await usuario.type(screen.getByLabelText('Código'), 'erva-c');
    await usuario.type(screen.getByLabelText('Nome'), 'Erva C');
    await usuario.type(screen.getByLabelText('Kg de fresco para 1 kg desidratado'), '6.5');
    await usuario.click(screen.getByText('Salvar'));

    await screen.findByText('Erva cadastrada');
    expect(escritas(chamadas)).toEqual([
      {
        metodo: 'POST',
        caminho: '/ervas',
        busca: '',
        corpo: { codigo: 'erva-c', nome: 'Erva C', ativo: true, regime_horas_dia: null, espera_maxima_dias: null },
      },
      {
        metodo: 'POST',
        caminho: '/rendimentos',
        busca: '',
        corpo: { erva_id: 9, fresco_por_desidratado: '6.5', desidratado_por_moido: null },
      },
    ]);
  });

  it('erva salva com rendimento recusado avisa e fecha o formulário', async () => {
    const usuario = userEvent.setup();
    renderizarTela(
      <MatrizCapacidade />,
      rotas({
        'PATCH /ervas/1': (corpo: object) => ({ ...ERVA_A, ...corpo }),
        'PATCH /rendimentos/3': new Resposta(422, { detail: 'Rendimento inválido' }),
      }),
      GERENCIAR
    );

    await screen.findByText('Erva A');
    const editar = within(screen.getByText('Erva A').closest('td')!).getByText('editar');
    await usuario.click(editar);
    await usuario.clear(screen.getByLabelText('Regime (horas por dia)'));
    await usuario.type(screen.getByLabelText('Regime (horas por dia)'), '12');
    await usuario.type(screen.getByLabelText('Kg desidratado para 1 kg moído'), '1.2');
    await usuario.click(screen.getByText('Salvar'));

    expect(await screen.findByText('A erva foi salva, mas o rendimento não')).toBeInTheDocument();
    expect(screen.queryByText('Editar Erva A')).not.toBeInTheDocument();
  });

  it('inativa um secador', async () => {
    const usuario = userEvent.setup();
    const { chamadas } = renderizarTela(
      <MatrizCapacidade />,
      rotas({ 'PATCH /secadores/2': (corpo: object) => ({ ...SEC_2, ...corpo }) }),
      GERENCIAR
    );

    await screen.findByText('Erva A');
    const cabecalho = screen.getByText('SEC-2').closest('th')!;
    await usuario.click(within(cabecalho).getByText('editar'));
    await usuario.selectOptions(screen.getByLabelText('Situação'), 'false');
    await usuario.click(screen.getByText('Salvar'));

    await screen.findByText('Secador atualizado');
    expect(escritas(chamadas)).toEqual([
      { metodo: 'PATCH', caminho: '/secadores/2', busca: '', corpo: { ativo: false } },
    ]);
  });

  it('"Mostrar inativos" busca ervas e secadores inativos também', async () => {
    const usuario = userEvent.setup();
    const { chamadas } = renderizarTela(<MatrizCapacidade />, rotas(), GERENCIAR);

    await usuario.click(await screen.findByLabelText('Mostrar inativos'));

    await screen.findByText('Erva A');
    const buscas = chamadas.filter((c) => c.metodo === 'GET' && c.busca === '?ativos=false').map((c) => c.caminho);
    expect(buscas).toEqual(expect.arrayContaining(['/ervas', '/secadores']));
  });

  it('abre o cadastro em janela e fecha no Cancelar ou no Esc', async () => {
    const usuario = userEvent.setup();
    renderizarTela(<MatrizCapacidade />, rotas(), GERENCIAR);

    await screen.findByText('Erva A');
    await usuario.click(screen.getByRole('button', { name: 'Nova erva' }));
    expect(screen.getByRole('dialog', { name: 'Nova erva' })).toBeInTheDocument();
    // Exemplo no campo é só placeholder: o campo continua vazio
    expect(screen.getByLabelText('Regime (horas por dia)')).toHaveValue(null);
    expect(screen.getByLabelText('Regime (horas por dia)')).toHaveAttribute('placeholder', 'ex.: 12');
    await usuario.click(screen.getByText('Cancelar'));
    expect(screen.queryByRole('heading', { name: 'Nova erva' })).not.toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'Novo secador' }));
    expect(screen.getByRole('dialog', { name: 'Novo secador' })).toBeInTheDocument();
    await usuario.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('filtra ervas, secadores e situação do par', async () => {
    const usuario = userEvent.setup();
    renderizarTela(<MatrizCapacidade />, rotas(), []);

    await screen.findByText('Erva B');
    expect(screen.getByText('2 erva(s) × 2 secador(es)')).toBeInTheDocument();

    // Busca pelo nome: só a Erva B
    await usuario.type(screen.getByLabelText('Buscar erva'), 'erva b');
    expect(screen.queryByText('Erva A')).not.toBeInTheDocument();
    expect(screen.getByText('Erva B')).toBeInTheDocument();
    await usuario.click(screen.getByText('Limpar filtros'));
    expect(screen.getByText('Erva A')).toBeInTheDocument();

    // Um secador: só a coluna dele
    await usuario.selectOptions(screen.getByLabelText('Secador'), '2');
    expect(screen.queryByText('SEC-1')).not.toBeInTheDocument();
    expect(screen.getByText('SEC-2')).toBeInTheDocument();
    await usuario.selectOptions(screen.getByLabelText('Secador'), '');

    // Completas: só a Erva A tem um par completo (SEC-1)
    await usuario.selectOptions(screen.getByLabelText('Situação do par'), 'completa');
    expect(screen.getByText('Erva A')).toBeInTheDocument();
    expect(screen.queryByText('Erva B')).not.toBeInTheDocument();

    // Com parâmetro vazio: a Erva B (regime e rendimento vazios) e a Erva A (rendimento moído vazio)
    await usuario.selectOptions(screen.getByLabelText('Situação do par'), 'incompleta');
    expect(screen.getByText('Erva A')).toBeInTheDocument();
    expect(screen.getByText('Erva B')).toBeInTheDocument();
  });

  it('resume os pares completos, com parâmetro vazio e que não operam', async () => {
    renderizarTela(<MatrizCapacidade />, rotas(), []);

    await screen.findByText('Erva B');
    const card = (titulo: string) => screen.getByText(titulo).closest('div.rounded-xl') as HTMLElement;
    // 2 ervas × 2 secadores: 1 completo, 0 incompletos, 3 não operam
    // O número conta até o valor: espera a contagem terminar
    await waitFor(() => expect(card('Pares completos')).toHaveTextContent('1de 4'));
    await waitFor(() => expect(card('Com parâmetro vazio')).toHaveTextContent('0de 4'));
    await waitFor(() => expect(card('Não operam')).toHaveTextContent('3de 4'));
  });

  describe('inativos e exclusão', () => {
    const ERVA_INATIVA = { id: 3, codigo: 'ERVA-C', nome: 'Erva C', ativo: false, regime_horas_dia: null, espera_maxima_dias: null };

    it('esconde a erva inativa, avisa quantas são e reativa num clique', async () => {
      const usuario = userEvent.setup();
      const { chamadas } = renderizarTela(
        <MatrizCapacidade />,
        rotas({
          'GET /ervas': [ERVA_A, ERVA_B, ERVA_INATIVA],
          'PATCH /ervas/3': (corpo: object) => ({ ...ERVA_INATIVA, ...corpo }),
        }),
        GERENCIAR
      );

      await screen.findByText('Erva A');
      // Fora da matriz, mas com aviso dizendo qual é
      expect(screen.queryByRole('button', { name: 'Reativar' })).not.toBeInTheDocument();
      expect(screen.getByText(/1 erva\(s\) inativa\(s\) fora da matriz: Erva C/)).toBeInTheDocument();

      await usuario.click(screen.getByRole('button', { name: 'Mostrar para reativar ou excluir' }));
      await usuario.click(await screen.findByRole('button', { name: 'Reativar' }));

      await screen.findByText('Erva C reativado');
      expect(escritas(chamadas)).toEqual([
        { metodo: 'PATCH', caminho: '/ervas/3', busca: '', corpo: { ativo: true } },
      ]);
    });

    it('exclui a erva depois de confirmar', async () => {
      const usuario = userEvent.setup();
      const { chamadas } = renderizarTela(<MatrizCapacidade />, rotas({ 'DELETE /ervas/2': null }), GERENCIAR);

      await screen.findByText('Erva B');
      await usuario.click(within(screen.getByText('Erva B').closest('td')!).getByText('editar'));
      await usuario.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Excluir' }));
      await usuario.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir' }));

      await screen.findByText('Erva excluída');
      expect(escritas(chamadas)).toEqual([{ metodo: 'DELETE', caminho: '/ervas/2', busca: '', corpo: undefined }]);
    });

    it('mostra o motivo quando a exclusão é recusada (erva já usada)', async () => {
      const usuario = userEvent.setup();
      const motivo = 'Não dá para excluir a erva Erva A: já tem 1 demanda(s). Deixe inativo para tirar do planejamento sem perder o histórico.';
      renderizarTela(<MatrizCapacidade />, rotas({ 'DELETE /ervas/1': new Resposta(409, { detail: motivo }) }), GERENCIAR);

      await screen.findByText('Erva A');
      await usuario.click(within(screen.getByText('Erva A').closest('td')!).getByText('editar'));
      await usuario.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Excluir' }));
      await usuario.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir' }));

      expect(await screen.findByText('Não foi possível excluir a erva')).toBeInTheDocument();
      expect(screen.getByText(motivo)).toBeInTheDocument();
    });
  });
});
