import { ReactNode } from 'react';

export type EtiquetaCor = 'verde' | 'cinza' | 'vermelho' | 'amarelo' | 'azul';

const cores: Record<EtiquetaCor, string> = {
  verde: 'bg-verde-100 text-verde-700',
  cinza: 'bg-fundo text-suave ring-1 ring-inset ring-borda',
  vermelho: 'bg-red-100 text-red-700',
  amarelo: 'bg-amber-100 text-amber-800',
  azul: 'bg-blue-100 text-blue-800',
};

/** Situação curta (pílula com bolinha da mesma cor). */
export const Etiqueta = ({ cor = 'cinza', children }: { cor?: EtiquetaCor; children: ReactNode }) => (
  <span
    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${cores[cor]}`}
  >
    <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
    {children}
  </span>
);
