import { Info } from 'lucide-react';
import { ReactNode } from 'react';

export interface ItemLegenda {
  /** Amostra visual: uma classe de cor (ex.: "bg-verde-700") ou um elemento pronto. */
  amostra: string | ReactNode;
  rotulo: string;
  /** O que significa, em uma frase curta. */
  descricao?: string;
}

/** "Como ler": explica cores e marcas usadas numa tabela ou gráfico. */
export const Legenda = ({ itens, titulo = 'Como ler' }: { itens: ItemLegenda[]; titulo?: string }) => (
  <div className="mt-4 rounded-lg border border-borda bg-fundo/70 px-3 py-2.5 text-xs">
    <p className="mb-1.5 flex items-center gap-1.5 font-semibold text-tinta">
      <Info aria-hidden="true" className="size-3.5 text-verde-700" />
      {titulo}
    </p>
    <ul className="grid gap-x-5 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
      {itens.map((item) => (
        <li key={item.rotulo} className="flex items-start gap-2 text-suave">
          {typeof item.amostra === 'string' ? (
            <span aria-hidden="true" className={`mt-0.5 size-3 shrink-0 rounded-sm ${item.amostra}`} />
          ) : (
            <span aria-hidden="true" className="mt-0.5 shrink-0">{item.amostra}</span>
          )}
          <span>
            <span className="font-semibold text-texto">{item.rotulo}</span>
            {item.descricao && <> · {item.descricao}</>}
          </span>
        </li>
      ))}
    </ul>
  </div>
);
