import { ChevronRight } from 'lucide-react';
import { ReactNode } from 'react';

interface PageHeaderProps {
  titulo: string;
  descricao?: ReactNode;
  /** Onde a tela fica no menu (ex.: "Planejamento"). */
  secao?: string;
  /** Botões à direita do título. No celular ocupam a largura toda. */
  acoes?: ReactNode;
}

/** Cabeçalho padrão das telas: trilha, título, descrição curta e ações. */
export const PageHeader = ({ titulo, descricao, secao, acoes }: PageHeaderProps) => (
  <div className="flex flex-col gap-4 animate-entra md:flex-row md:items-end md:justify-between">
    <div className="min-w-0">
      {secao && (
        <p className="mb-1 flex items-center gap-1 text-xs font-medium text-suave">
          {secao}
          <ChevronRight aria-hidden="true" className="size-3" />
          <span className="text-texto">{titulo}</span>
        </p>
      )}
      <h1 className="text-2xl font-bold tracking-tight text-tinta">{titulo}</h1>
      {descricao && <div className="mt-1 max-w-3xl text-sm text-suave">{descricao}</div>}
    </div>
    {acoes && (
      <div className="grid shrink-0 grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-end [&>button]:w-full sm:[&>button]:w-auto">
        {acoes}
      </div>
    )}
  </div>
);
