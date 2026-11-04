import { logger } from './logger';

const API_BASE = '/api';

/** Erro devolvido pela API, com a mensagem do backend pronta para mostrar na tela. */
export class ErroApi extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ErroApi';
    this.status = status;
  }
}

interface DetalheValidacao {
  loc?: (string | number)[];
  msg: string;
}

export const ERRO_CONEXAO =
  'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.';
export const ERRO_INESPERADO = 'Ocorreu um erro inesperado. Tente novamente.';

// Usadas quando a resposta não traz mensagem (ex.: proxy fora do ar, erro não tratado)
const MENSAGENS_STATUS: Record<number, string> = {
  401: 'Sua sessão terminou. Entre novamente.',
  403: 'Você não tem permissão para esta ação.',
  404: 'Registro não encontrado. Ele pode ter sido removido.',
  413: 'O arquivo enviado é grande demais.',
  429: 'Muitas tentativas. Tente novamente em alguns minutos.',
};

// O backend devolve `detail` como texto (404, 409...) ou como lista de campos (422).
// As mensagens já vêm em português e citando o campo (backend/app/erros.py).
const mensagemDoErro = (corpo: unknown, status: number): string => {
  const detail = (corpo as { detail?: unknown } | null)?.detail;
  if (typeof detail === 'string' && detail) return detail;
  if (Array.isArray(detail) && detail.length) {
    // Mesma mensagem para vários campos aparece uma vez só
    return [...new Set((detail as DetalheValidacao[]).map((d) => d.msg))].join(' ');
  }
  if (MENSAGENS_STATUS[status]) return MENSAGENS_STATUS[status];
  if (status >= 500) return 'O servidor teve um problema ao processar o pedido. Tente novamente em instantes.';
  return ERRO_INESPERADO;
};

/** Monta a query string ignorando filtros vazios. */
export const query = (params: Record<string, string | number | boolean | null | undefined>) => {
  const busca = new URLSearchParams();
  Object.entries(params).forEach(([chave, valor]) => {
    if (valor !== null && valor !== undefined && valor !== '') busca.set(chave, String(valor));
  });
  const texto = busca.toString();
  return texto ? `?${texto}` : '';
};

export const apiFetch = async <T = any>(endpoint: string, options?: RequestInit): Promise<T> => {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers || {})
      },
    });

    if (!response.ok) {
      // No próprio login o 401 é senha errada: redirecionar apagaria a mensagem
      if (response.status === 401 && endpoint !== '/auth/login') {
        window.location.href = '/login';
      }
      const corpo = await response.json().catch(() => null);
      throw new ErroApi(response.status, mensagemDoErro(corpo, response.status));
    }

    return response.status !== 204 ? await response.json() : (null as T);
  } catch (error) {
    logger.error(`Falha na requisição para ${endpoint}`, error);
    if (error instanceof ErroApi) throw error;
    // O fetch só lança TypeError ("Failed to fetch") quando não chega ao servidor;
    // o resto (ex.: resposta que não é JSON) também não deve aparecer em inglês na tela
    throw new ErroApi(0, error instanceof TypeError ? ERRO_CONEXAO : ERRO_INESPERADO);
  }
};

/** Texto do erro para mostrar ao usuário (sempre em português). */
export const textoDoErro = (erro: unknown) =>
  erro instanceof ErroApi ? erro.message : ERRO_INESPERADO;
