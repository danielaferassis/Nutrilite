import { ReactNode, createContext, useCallback, useContext, useEffect, useState } from 'react';

import { apiFetch, textoDoErro } from './api';
import { SessaoAtual } from './tipos';

interface ContextoSessao {
  sessao: SessaoAtual | null;
  /** True se o usuário tem pelo menos uma das funcionalidades. */
  pode: (...codigos: string[]) => boolean;
}

const Sessao = createContext<ContextoSessao>({ sessao: null, pode: () => false });

/**
 * Carrega o usuário logado e as permissões dele (GET /api/auth/me).
 * Esconder botão é só conforto visual: quem garante a permissão é o backend.
 */
export function SessaoProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<SessaoAtual | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    apiFetch<SessaoAtual>('/auth/me').then(setSessao).catch((e) => setErro(textoDoErro(e)));
  }, []);

  const pode = useCallback(
    (...codigos: string[]) => !!sessao && codigos.some((c) => sessao.permissoes.includes(c)),
    [sessao]
  );

  if (erro) return <div className="p-8 text-red-700">Não foi possível carregar a sessão: {erro}</div>;
  if (!sessao) return <div className="p-8 text-gray-500">Carregando…</div>;
  return <Sessao.Provider value={{ sessao, pode }}>{children}</Sessao.Provider>;
}

export const useSessao = () => useContext(Sessao);
