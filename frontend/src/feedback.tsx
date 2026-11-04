import { ReactNode, createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

import { textoDoErro } from './api';
import { Modal, ModalTipo } from './components/ui';

export interface OpcoesConfirmacao {
  titulo: string;
  mensagem?: ReactNode;
  /** Texto do botão que confirma (ex.: "Excluir"). Padrão: "Confirmar". */
  rotuloConfirmar?: string;
  /** Ação destrutiva: botão vermelho e foco começa no Cancelar. */
  perigo?: boolean;
}

interface ContextoFeedback {
  /** Avisa que a operação deu certo. */
  sucesso: (titulo: string, mensagem?: ReactNode) => void;
  /** Avisa que a operação falhou. `causa` pode ser o erro capturado ou um texto. */
  erro: (titulo: string, causa?: unknown) => void;
  /** Pergunta antes de agir; resolve true se o usuário confirmar. */
  confirmar: (opcoes: OpcoesConfirmacao) => Promise<boolean>;
}

interface Pendente {
  id: number;
  tipo: ModalTipo;
  titulo: string;
  mensagem?: ReactNode;
  rotuloConfirmar?: string;
  perigo?: boolean;
  responder: (ok: boolean) => void;
}

const Feedback = createContext<ContextoFeedback | null>(null);

/**
 * Janelas de resultado (sucesso/erro) e de confirmação, no lugar de avisos
 * no topo da página e do window.confirm (cujos botões seguem o idioma do navegador).
 * Se várias chegarem juntas, aparecem uma de cada vez, na ordem.
 */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [fila, setFila] = useState<Pendente[]>([]);
  const proximoId = useRef(0);
  const atual = fila[0];

  const enfileirar = useCallback((item: Omit<Pendente, 'id' | 'responder'>) => {
    return new Promise<boolean>((resolve) => {
      const id = ++proximoId.current;
      setFila((f) => [...f, { ...item, id, responder: resolve }]);
    });
  }, []);

  const fechar = useCallback(
    (ok: boolean) => {
      if (!atual) return;
      atual.responder(ok);
      setFila((f) => f.filter((p) => p.id !== atual.id));
    },
    [atual]
  );
  const aoConfirmar = useCallback(() => fechar(true), [fechar]);
  const aoCancelar = useCallback(() => fechar(false), [fechar]);

  const valor = useMemo<ContextoFeedback>(
    () => ({
      sucesso: (titulo, mensagem) => {
        enfileirar({ tipo: 'sucesso', titulo, mensagem });
      },
      erro: (titulo, causa) => {
        const mensagem = causa === undefined ? undefined : typeof causa === 'string' ? causa : textoDoErro(causa);
        enfileirar({ tipo: 'erro', titulo, mensagem });
      },
      confirmar: ({ titulo, mensagem, rotuloConfirmar = 'Confirmar', perigo }) =>
        enfileirar({ tipo: 'confirmacao', titulo, mensagem, rotuloConfirmar, perigo }),
    }),
    [enfileirar]
  );

  return (
    <Feedback.Provider value={valor}>
      {children}
      {atual && (
        <Modal
          // key: cada janela nova recomeça o foco
          key={atual.id}
          tipo={atual.tipo}
          titulo={atual.titulo}
          mensagem={atual.mensagem}
          rotuloConfirmar={atual.rotuloConfirmar}
          rotuloCancelar={atual.tipo === 'confirmacao' ? 'Cancelar' : undefined}
          perigo={atual.perigo}
          aoConfirmar={aoConfirmar}
          aoCancelar={aoCancelar}
        />
      )}
    </Feedback.Provider>
  );
}

export function useFeedback() {
  const contexto = useContext(Feedback);
  if (!contexto) throw new Error('useFeedback precisa estar dentro de <FeedbackProvider>');
  return contexto;
}
