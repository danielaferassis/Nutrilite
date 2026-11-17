import { LucideIcon, X } from 'lucide-react';
import { ReactNode, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

interface JanelaProps {
  titulo: string;
  descricao?: ReactNode;
  icone?: LucideIcon;
  aoFechar: () => void;
  children: ReactNode;
  /** Largura máxima: formulários curtos (md) ou com várias colunas (lg, xl). */
  largura?: 'md' | 'lg' | 'xl';
}

const LARGURAS = { md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

/**
 * Janela (popup) com formulário. Fecha no X ou no Esc; clicar fora não fecha,
 * para não perder o que já foi digitado.
 */
export const Janela = ({ titulo, descricao, icone: Icone, aoFechar, children, largura = 'lg' }: JanelaProps) => {
  const tituloId = useId();
  const caixa = useRef<HTMLDivElement>(null);
  // Sempre a função mais recente, sem refazer o efeito a cada renderização da tela
  const fechar = useRef(aoFechar);
  fechar.current = aoFechar;

  // Só ao abrir: refazer a cada tecla devolveria o foco ao primeiro campo
  useEffect(() => {
    // Foco no primeiro campo; a página de trás não rola enquanto a janela está aberta
    caixa.current?.querySelector<HTMLElement>('input, select, textarea')?.focus();
    const rolagem = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && fechar.current();
    document.addEventListener('keydown', tecla);
    return () => {
      document.body.style.overflow = rolagem;
      document.removeEventListener('keydown', tecla);
    };
  }, []);

  // Portal no <body>: a tela entra com animação de transform, e um ancestral com
  // transform vira a referência do `fixed` (a janela ficaria presa e deslocada no conteúdo)
  return createPortal(
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-tinta/40 p-0 backdrop-blur-[2px] animate-entra sm:items-center sm:p-4">
      <div
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        className={`flex max-h-[92vh] w-full ${LARGURAS[largura]} flex-col rounded-t-2xl border border-borda bg-white shadow-2xl animate-surge sm:rounded-2xl`}
      >
        <div className="flex items-start gap-3 border-b border-borda px-5 py-4 sm:px-6">
          {Icone && (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-verde-100 text-verde-700">
              <Icone aria-hidden="true" className="size-[18px]" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 id={tituloId} className="text-lg font-semibold text-tinta">{titulo}</h2>
            {descricao && <div className="mt-0.5 text-sm text-suave">{descricao}</div>}
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={aoFechar}
            className="rounded-md p-1.5 text-suave transition-colors hover:bg-fundo hover:text-tinta"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
      </div>
    </div>,
    document.body
  );
};
