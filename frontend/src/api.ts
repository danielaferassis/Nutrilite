// Funções de acesso à API. O Vite redireciona /api para o backend (ver vite.config.ts).
import { logger } from './logger'

// --- 1. TIPAGENS DO DOMÍNIO DA NUTRILITE ---

export interface Usuario {
  id: number
  email: string
  nome: string
  // O backend valida funcionalidades como 'relatorio.importacao' via cookie
}

export interface Credenciais {
  email: string
  senha: string
}

export interface Previsao {
  cultura: string
  volume_kg: number
  semana: string
}

export interface Item {
  id: number
  name: string
  created_at: string
}

// Tipagens do Módulo de Importação Assíncrona
export interface ImportacaoStatus {
  id: number
  status: 'pendente' | 'processando' | 'concluido' | 'erro' | 'cancelado'
  arquivo_nome: string
  tipo: string
  criado_em: string
}

export interface ImportacaoErro {
  linha: number
  detalhe: string
}

// --- 2. FUNÇÃO BASE DE REQUEST (SEGURA E COMPLIANT) ---

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = options.method ?? 'GET'
  logger.debug(`${method} /api${path}`)

  // Omitimos o Content-Type automático se o body for um FormData (usado para envio de ficheiros CSV/Excel)
  const isFormData = options.body instanceof FormData;
  
  const headers = new Headers(options.headers);
  if (!isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  try {
    const response = await fetch(`/api${path}`, {
      ...options,
      headers,
      // FUNDAMENTAL: Garante o envio do cookie HttpOnly de sessão em todas as chamadas
      credentials: 'same-origin', 
    })
    
    if (!response.ok) {
      // Regista apenas o código de erro HTTP, sem expor stack traces nativas.
      logger.warn(`Falha na operação: ${method} /api${path} retornou ${response.status}`);
      throw new Error(`Erro do servidor (Código: ${response.status}). Operação não concluída.`);
    }
    
    return (response.status === 204 ? null : await response.json()) as T;
  } catch (error) {
    // Tratamento genérico para falhas de rede CORS ou interrupções de ligação.
    // Em conformidade com a LGPD e regras de segurança, omitimos os detalhes internos do erro.
    logger.error(`Ocorreu uma falha de comunicação ao tentar aceder a ${path}.`);
    
    if (error instanceof Error) throw error;
    throw new Error("Não foi possível comunicar com o sistema. Verifique a sua ligação.");
  }
}

// --- 3. MAPEAMENTO DOS ENDPOINTS REAIS ---

export const api = {
  // Infraestrutura
  health: () => request<{ status: string }>('/health'),
  
  // Autenticação e Controlo de Acesso
  login: (credenciais: Credenciais) => 
    request<void>('/auth/login', { method: 'POST', body: JSON.stringify(credenciais) }),
  
  logout: () => 
    request<void>('/auth/logout', { method: 'POST' }),
  
  getMe: () => 
    request<Usuario>('/auth/me'),

  // Lançamento de Previsões
  enviarPrevisao: (previsao: Previsao) => 
    request<Previsao>('/previsoes', { method: 'POST', body: JSON.stringify(previsao) }),
    
  // --- Módulo de Importações (Processamento de planilhas via Worker) ---
  // A rota aceita multipart/form-data com o campo 'arquivo', 'tipo' e 'forcar'
  enviarImportacao: (formData: FormData) => 
    request<void>('/importacoes', { method: 'POST', body: formData }),

  // Endpoints necessários para o polling e gestão da fila no frontend
  listarTiposImportacao: () =>
    request<string[]>('/importacoes/tipos'),

  consultarStatusImportacao: (id: number) =>
    request<ImportacaoStatus>(`/importacoes/${id}`),

  consultarErrosImportacao: (id: number) =>
    request<ImportacaoErro[]>(`/importacoes/${id}/erros`),

  reprocessarImportacao: (id: number) =>
    request<void>(`/importacoes/${id}/reprocessar`, { method: 'POST' }),

  cancelarImportacao: (id: number) =>
    request<void>(`/importacoes/${id}/cancelar`, { method: 'POST' }),

  // --- Endpoints de Itens ---
  listarItens: () => 
    request<Item[]>('/items'),
    
  removerItem: (id: number) => 
    request<void>(`/items/${id}`, { method: 'DELETE' }),
}