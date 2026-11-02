import { ReactNode } from 'react';

export type AlertaTipo = 'erro' | 'aviso' | 'sucesso';

const estilos: Record<AlertaTipo, string> = {
  erro: 'bg-red-50 text-red-700 border-red-200',
  aviso: 'bg-amber-50 text-amber-800 border-amber-200',
  sucesso: 'bg-green-50 text-[#006F44] border-green-200',
};

export const Alerta = ({ tipo = 'erro', children }: { tipo?: AlertaTipo; children: ReactNode }) => (
  <div role={tipo === 'erro' ? 'alert' : 'status'} className={`p-3 rounded border text-sm ${estilos[tipo]}`}>
    {children}
  </div>
);
