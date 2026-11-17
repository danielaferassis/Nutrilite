import { ChevronRight, CircleHelp, X } from 'lucide-react';
import { ReactNode, useState } from 'react';

interface PageHeaderProps {
  titulo: string;
  descricao?: ReactNode;
  /** Onde a tela fica no menu (ex.: "Planejamento"). */
  secao?: string;
  /** Botões à direita do título. No celular ocupam a largura toda. */
  acoes?: ReactNode;
  /** Passo a passo do módulo: fica atrás do botão "Como usar". */
  ajuda?: ReactNode[];
}

/** Cabeçalho padrão das telas: trilha, título, descrição curta, ajuda e ações. */
export const PageHeader = ({ titulo, descricao, secao, acoes, ajuda }: PageHeaderProps) => {
  const [ajudaAberta, setAjudaAberta] = useState(false);
  return (
    <div className="space-y-3 animate-entra">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          {secao && (
            <p className="mb-1 flex items-center gap-1 text-xs font-medium text-suave">
              {secao}
              <ChevronRight aria-hidden="true" className="size-3" />
              <span className="text-texto">{titulo}</span>
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-tinta">{titulo}</h1>
            {ajuda && ajuda.length > 0 && (
              <button
                type="button"
                aria-expanded={ajudaAberta}
                onClick={() => setAjudaAberta(!ajudaAberta)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-all duration-200 ${
                  ajudaAberta
                    ? 'border-verde-700 bg-verde-700 text-white'
                    : 'border-borda bg-white text-suave hover:border-verde-600 hover:text-verde-700'
                }`}
              >
                <CircleHelp aria-hidden="true" className="size-3.5" />
                Como usar
              </button>
            )}
          </div>
          {descricao && <div className="mt-1 max-w-3xl text-sm text-suave">{descricao}</div>}
        </div>
        {acoes && (
          <div className="grid shrink-0 grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-end [&>button]:w-full sm:[&>button]:w-auto">
            {acoes}
          </div>
        )}
      </div>

      {ajudaAberta && ajuda && (
        <div role="region" aria-label={`Como usar: ${titulo}`} className="relative rounded-xl border border-verde-700/20 bg-verde-50 p-4 pr-10 animate-entra">
          <button
            type="button"
            aria-label="Fechar ajuda"
            onClick={() => setAjudaAberta(false)}
            className="absolute right-2 top-2 rounded-md p-1 text-suave transition-colors hover:bg-white hover:text-tinta"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
          <p className="mb-2 text-sm font-semibold text-verde-700">Como usar este módulo</p>
          <ol className="space-y-1.5 text-sm text-texto">
            {ajuda.map((passo, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-verde-700 text-[11px] font-bold text-white">
                  {i + 1}
                </span>
                <span>{passo}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
};
