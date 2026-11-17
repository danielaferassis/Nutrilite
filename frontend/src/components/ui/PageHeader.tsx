import { ReactNode } from 'react';

interface PageHeaderProps {
  titulo: string;
  descricao?: ReactNode;
  /** Onde a tela fica no menu (ex.: "Planejamento"). */
  secao?: string;
  /** Botões à direita do título. */
  acoes?: ReactNode;
}

/** Cabeçalho padrão das telas: seção, título, descrição e ações. */
export const PageHeader = ({ titulo, descricao, secao, acoes }: PageHeaderProps) => (
  <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
    <div className="min-w-0">
      {secao && <p className="mb-1 text-xs font-medium text-suave">{secao}</p>}
      <h1 className="text-2xl font-bold tracking-tight text-tinta">{titulo}</h1>
      {descricao && <div className="mt-1 max-w-3xl text-sm text-suave">{descricao}</div>}
    </div>
    {acoes && <div className="flex shrink-0 flex-wrap gap-2">{acoes}</div>}
  </div>
);
