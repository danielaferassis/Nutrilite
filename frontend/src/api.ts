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

// O FastAPI devolve `detail` como texto (404, 409...) ou como lista de campos (422)
const mensagemDoErro = (corpo: unknown, status: number): string => {
  const detail = (corpo as { detail?: unknown } | null)?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return (detail as DetalheValidacao[])
      .map((d) => {
        const campo = (d.loc ?? []).filter((parte) => parte !== 'body').join('.');
        return campo ? `${campo}: ${d.msg}` : d.msg;
      })
      .join('; ');
  }
  if (status === 403) return 'Você não tem permissão para esta ação.';
  return `Erro ${status} na API`;
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
    throw error;
  }
};

/** Texto do erro para mostrar ao usuário. */
export const textoDoErro = (erro: unknown) =>
  erro instanceof Error ? erro.message : 'Erro inesperado';
