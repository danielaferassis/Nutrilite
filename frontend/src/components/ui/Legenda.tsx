import { ChevronDown, Info } from 'lucide-react';
import { ReactNode } from 'react';

export interface ItemLegenda {
  /** Amostra visual: uma classe de cor (ex.: "bg-verde-700") ou um elemento pronto. */
  amostra: string | ReactNode;
  rotulo: string;
  /** O que significa, em uma frase curta. */
  descricao?: string;
}

/**
 * "Como ler": explica cores e marcas de uma tabela ou gráfico. Fica recolhido
 * num botão pequeno, para a tela não encher de texto; abre com um clique.
 */
export const Legenda = ({ itens, titulo = 'Como ler' }: { itens: ItemLegenda[]; titulo?: string }) => (
  <details className="group mt-3 text-xs">
    <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full border border-borda bg-white px-2.5 py-1 font-semibold text-suave transition-colors hover:border-verde-600 hover:text-verde-700 group-open:border-verde-600 group-open:bg-verde-50 group-open:text-verde-700 [&::-webkit-details-marker]:hidden">
      <Info aria-hidden="true" className="size-3.5" />
      {titulo}
      <ChevronDown aria-hidden="true" className="size-3.5 transition-transform duration-200 group-open:rotate-180" />
    </summary>
    <ul className="mt-2 grid gap-x-5 gap-y-1.5 rounded-lg border border-borda bg-fundo/70 px-3 py-2.5 animate-entra sm:grid-cols-2 lg:grid-cols-3">
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
  </details>
);
