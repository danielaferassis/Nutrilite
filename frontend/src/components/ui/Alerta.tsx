import { CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react';
import { ReactNode } from 'react';

export type AlertaTipo = 'erro' | 'aviso' | 'sucesso';

const estilos: Record<AlertaTipo, string> = {
  erro: 'bg-red-50 text-red-800 border-red-200',
  aviso: 'bg-amber-50 text-amber-900 border-amber-200',
  sucesso: 'bg-verde-50 text-verde-700 border-verde-100',
};

const ICONES = { erro: CircleAlert, aviso: TriangleAlert, sucesso: CircleCheck };

export const Alerta = ({ tipo = 'erro', children }: { tipo?: AlertaTipo; children: ReactNode }) => {
  const Icone = ICONES[tipo];
  return (
    <div
      role={tipo === 'erro' ? 'alert' : 'status'}
      className={`flex gap-3 p-3 rounded-lg border text-sm animate-entra ${estilos[tipo]}`}
    >
      <Icone aria-hidden="true" className="size-4 shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
};
