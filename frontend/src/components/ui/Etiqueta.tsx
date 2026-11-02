import { ReactNode } from 'react';

export type EtiquetaCor = 'verde' | 'cinza' | 'vermelho' | 'amarelo' | 'azul';

const cores: Record<EtiquetaCor, string> = {
  verde: 'bg-green-100 text-[#006F44]',
  cinza: 'bg-gray-100 text-gray-700',
  vermelho: 'bg-red-100 text-red-700',
  amarelo: 'bg-amber-100 text-amber-800',
  azul: 'bg-blue-100 text-blue-800',
};

export const Etiqueta = ({ cor = 'cinza', children }: { cor?: EtiquetaCor; children: ReactNode }) => (
  <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${cores[cor]}`}>
    {children}
  </span>
);
