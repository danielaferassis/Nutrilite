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

// Tipagem adicionada para atender ao ItemList.tsx
export interface Item {
  id: number
  name: string
  created_at: string
}

// --- 2. FUNÇÃO BASE DE REQUEST ---

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = options.method ?? 'GET'
  logger.debug(`${method} /api${path}`)

  // Omitimos o Content-Type automático se o body for um FormData (usado para envio de arquivos CSV/Excel)
  const isFormData = options.body instanceof FormData;
  
  const headers = new Headers(options.headers);
  if (!isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
    // FUNDAMENTAL: Garante o envio do cookie HttpOnly de sessão em todas as chamadas
    credentials: 'same-origin', 
  })
  
  if (!response.ok) {
    logger.error(`${method} /api${path} falhou com status ${response.status}`)
    throw new Error(`Erro ${response.status} em ${path}`)
  }
  
  return (response.status === 204 ? null : await response.json()) as T
}

// --- 3. MAPEAMENTO DOS ENDPOINTS REAIS ---

export const api = {
  // Infraestrutura
  health: () => request<{ status: string }>('/health'),
  
  // Autenticação e Controle de Acesso
  login: (credenciais: Credenciais) => 
    request<void>('/auth/login', { method: 'POST', body: JSON.stringify(credenciais) }),
  
  logout: () => 
    request<void>('/auth/logout', { method: 'POST' }),
  
  getMe: () => 
    request<Usuario>('/auth/me'),

  // Lançamento de Previsões (Fazenda Própria, Procompete, P&D)
  enviarPrevisao: (previsao: Previsao) => 
    request<Previsao>('/previsoes', { method: 'POST', body: JSON.stringify(previsao) }),
    
  // Módulo de Importações (Processamento de planilhas)
  // Note que o backend aceita multipart/form-data com o campo 'arquivo', 'tipo' e 'forcar'
  enviarImportacao: (formData: FormData) => 
    request<void>('/importacoes', { method: 'POST', body: formData }),

  // --- Endpoints de Itens (Vinculados ao ItemList.tsx) ---
  // A rota /api/items exige que o usuário esteja logado
  listarItens: () => 
    request<Item[]>('/items'),
    
  removerItem: (id: number) => 
    request<void>(`/items/${id}`, { method: 'DELETE' }),
}