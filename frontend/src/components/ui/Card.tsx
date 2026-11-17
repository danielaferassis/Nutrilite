import { LucideIcon } from 'lucide-react';
import React, { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const Card = ({ children, className = '', ...props }: CardProps) => {
  return (
    <div
      className={`bg-white border border-borda rounded-xl shadow-suave p-4 sm:p-5 transition-shadow duration-300 animate-entra ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

interface CabecalhoCardProps {
  titulo: ReactNode;
  /** Uma frase sobre o que o bloco mostra. */
  descricao?: ReactNode;
  icone?: LucideIcon;
  /** Botões à direita. */
  acoes?: ReactNode;
}

/** Título de um Card: ícone, título, descrição curta e ações. */
export const CabecalhoCard = ({ titulo, descricao, icone: Icone, acoes }: CabecalhoCardProps) => (
  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div className="flex min-w-0 gap-3">
      {Icone && (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-verde-100 text-verde-700">
          <Icone aria-hidden="true" className="size-4" />
        </span>
      )}
      <div className="min-w-0">
        <h2 className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-tinta">{titulo}</h2>
        {descricao && <div className="mt-0.5 text-[13px] text-suave">{descricao}</div>}
      </div>
    </div>
    {acoes && <div className="flex shrink-0 flex-wrap gap-2">{acoes}</div>}
  </div>
);
