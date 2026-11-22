/**
 * API falsa para os testes de tela: troca o `fetch` global por respostas fixas
 * e guarda as chamadas feitas, para conferir o que a tela mandou ao backend.
 * Dados sempre fictícios.
 */
import { render } from '@testing-library/react';
import { ReactElement } from 'react';
import { vi } from 'vitest';

import { FeedbackProvider } from '../feedback';
import { SessaoProvider } from '../sessao';

export interface Chamada {
  metodo: string;
  /** Caminho sem o /api e sem a query string (ex.: /demandas/3). */
  caminho: string;
  busca: string;
  corpo: any;
}

/** Resposta com status diferente de 200 (ex.: erro de validação). */
export class Resposta {
  constructor(
    public status: number,
    public corpo: unknown = null
  ) {}
}

/** Chave "MÉTODO /caminho" → dados devolvidos com 200, uma Resposta ou uma função do corpo enviado (pode ser async). */
export type Rotas = Record<string, unknown | ((corpo: any) => unknown)>;

export function instalarApiFalsa(rotas: Rotas) {
  const chamadas: Chamada[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (entrada: string, init?: RequestInit) => {
      const url = new URL(entrada, 'http://localhost');
      const metodo = init?.method ?? 'GET';
      const caminho = url.pathname.replace(/^\/api/, '');
      // JSON vira objeto; envio de arquivo (FormData) vira { campo: valor }, com o File no campo
      const corpo =
        typeof init?.body === 'string'
          ? JSON.parse(init.body)
          : init?.body instanceof FormData
            ? Object.fromEntries(init.body.entries())
            : undefined;
      chamadas.push({ metodo, caminho, busca: url.search, corpo });

      const chave = `${metodo} ${caminho}`;
      if (!(chave in rotas)) {
        return new Response(JSON.stringify({ detail: `Rota não prevista no teste: ${chave}` }), { status: 404 });
      }
      const rota = rotas[chave];
      let resposta = typeof rota === 'function' ? await rota(corpo) : rota;
      if (!(resposta instanceof Resposta)) resposta = new Resposta(metodo === 'DELETE' ? 204 : 200, resposta);
      const { status, corpo: dados } = resposta as Resposta;
      return new Response(status === 204 ? null : JSON.stringify(dados), { status });
    })
  );
  return chamadas;
}

export const USUARIO_TESTE = {
  id: 1,
  nome: 'Usuária Teste',
  email: 'teste@exemplo.com',
  ativo: true,
  ultimo_login: null,
  criado_em: '2026-11-01T00:00:00Z',
  atualizado_em: '2026-11-01T00:00:00Z',
  grupos: [],
};

/** Renderiza a tela com sessão (as `permissoes` dadas) e janelas de feedback. */
export function renderizarTela(tela: ReactElement, rotas: Rotas, permissoes: string[]) {
  const chamadas = instalarApiFalsa({
    'GET /auth/me': { usuario: USUARIO_TESTE, permissoes },
    ...rotas,
  });
  const resultado = render(
    <SessaoProvider>
      <FeedbackProvider>{tela}</FeedbackProvider>
    </SessaoProvider>
  );
  return { ...resultado, chamadas };
}

/** Só as chamadas que alteram dados (POST, PATCH, DELETE). */
export const escritas = (chamadas: Chamada[]) => chamadas.filter((c) => c.metodo !== 'GET');

/**
 * Resposta que só chega quando o teste chamar `responder`: deixa a tela no meio
 * do envio, para conferir o que acontece com um segundo clique (ex.: duplo clique).
 */
export function respostaPendente(dados: unknown = null) {
  let responder!: () => void;
  const pronta = new Promise<unknown>((resolve) => {
    responder = () => resolve(dados);
  });
  return { rota: () => pronta, responder };
}
