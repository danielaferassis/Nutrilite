// Funções de acesso à API. O Vite redireciona /api para o backend (ver vite.config.ts).
import { logger } from './logger'

export interface Item {
  id: number
  name: string
  description: string | null
  created_at: string
}

export type ItemCreate = Pick<Item, 'name'> & { description?: string }

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = options.method ?? 'GET'
  logger.debug(`${method} /api${path}`)

  const response = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!response.ok) {
    logger.error(`${method} /api${path} falhou com status ${response.status}`)
    throw new Error(`Erro ${response.status} em ${path}`)
  }
  return (response.status === 204 ? null : await response.json()) as T
}

export const api = {
  health: () => request<{ status: string }>('/health'),
  listItems: () => request<Item[]>('/items'),
  createItem: (item: ItemCreate) =>
    request<Item>('/items', { method: 'POST', body: JSON.stringify(item) }),
  deleteItem: (id: number) => request<null>(`/items/${id}`, { method: 'DELETE' }),
}
