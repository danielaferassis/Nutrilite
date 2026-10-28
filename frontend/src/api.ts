import { logger } from './logger';

const API_BASE = '/api';

export const apiFetch = async (endpoint: string, options?: RequestInit) => {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers || {})
      },
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        window.location.href = '/login';
      }
      throw new Error(`Erro na API: ${response.statusText}`);
    }
    
    return response.status !== 204 ? await response.json() : null;
  } catch (error) {
    logger.error(`Falha na requisição para ${endpoint}`, error);
    throw error;
  }
};