import { Check, X } from 'lucide-react';
import { ReactNode, useEffect } from 'react';

export interface ToastItem {
  id: number;
  titulo: string;
  mensagem?: ReactNode;
}

// Tempo na tela; o usuário pode fechar antes
const DURACAO_MS = 5000;

function Toast({ item, aoFechar }: { item: ToastItem; aoFechar: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => aoFechar(item.id), DURACAO_MS);
    return () => clearTimeout(timer);
  }, [item.id, aoFechar]);

  return (
    <div className="pointer-events-auto flex w-full max-w-sm gap-3 rounded-xl bg-tinta p-4 text-white shadow-2xl animate-entra">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-lima-500 text-verde-900">
        <Check aria-hidden="true" className="size-4" strokeWidth={3} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{item.titulo}</p>
        {item.mensagem && <div className="mt-0.5 whitespace-pre-line text-sm text-white/75">{item.mensagem}</div>}
      </div>
      <button
        type="button"
        aria-label="Fechar aviso"
        onClick={() => aoFechar(item.id)}
        className="h-fit rounded-md p-1 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}

/** Avisos de sucesso no canto da tela: não bloqueiam o trabalho e somem sozinhos. */
export function Toasts({ itens, aoFechar }: { itens: ToastItem[]; aoFechar: (id: number) => void }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-6 right-6 z-50 flex w-[calc(100%-3rem)] max-w-sm flex-col gap-3"
    >
      {itens.map((item) => (
        <div key={item.id} role="status">
          <Toast item={item} aoFechar={aoFechar} />
        </div>
      ))}
    </div>
  );
}
