import { useCallback, useEffect, useState } from 'react';

import { apiFetch, textoDoErro } from './api';

/**
 * Busca `endpoint` na API e mantém dados, erro e carregamento.
 * Muda de endpoint (ex.: filtro na query) → busca de novo. `null` não busca.
 */
export function useApi<T>(endpoint: string | null) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  const recarregar = useCallback(async () => {
    if (endpoint === null) return;
    setCarregando(true);
    try {
      setDados(await apiFetch<T>(endpoint));
      setErro('');
    } catch (e) {
      setErro(textoDoErro(e));
    } finally {
      setCarregando(false);
    }
  }, [endpoint]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  return { dados, erro, carregando, recarregar };
}
