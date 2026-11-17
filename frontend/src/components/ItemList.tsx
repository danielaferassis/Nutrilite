import { Inbox } from 'lucide-react';
import { ReactNode } from 'react';

import { SkeletonTabela } from './ui';

interface ItemListProps {
  colunas: string[];
  // Cada linha vira uma <tr>, na ordem das chaves (pode ter botões, etiquetas...)
  dados: Record<string, ReactNode>[];
  vazio?: string;
  /** Primeira carga: mostra o esqueleto no lugar da tabela vazia. */
  carregando?: boolean;
}

/**
 * Tabela simples, sem filtro nem ordenação. Para listas com filtro por coluna,
 * use <Tabela> de ./ui. Mesmo visual das duas.
 */
export default function ItemList({ colunas, dados, vazio = 'Nenhum registro.', carregando = false }: ItemListProps) {
  // Recarregar com dados já na tela não pisca: o esqueleto é só para a primeira carga
  if (carregando && dados.length === 0) return <SkeletonTabela />;
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full border-separate border-spacing-0 text-left text-sm tabular-nums">
        <thead>
          <tr>
            {colunas.map((col, idx) => (
              <th
                key={idx}
                className="sticky top-0 whitespace-nowrap border-b border-borda bg-white px-3 py-2.5 text-xs font-semibold text-suave"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dados.length === 0 && (
            <tr>
              <td colSpan={colunas.length} className="px-4 py-10 text-center text-suave">
                <Inbox aria-hidden="true" className="mx-auto mb-2 size-8 text-cinza" />
                {vazio}
              </td>
            </tr>
          )}
          {dados.map((linha, idx) => (
            <tr key={idx} className="group/linha transition-colors hover:bg-verde-50">
              {Object.values(linha).map((valor, vIdx) => (
                <td key={vIdx} className="border-b border-borda px-3 py-3 text-texto group-last/linha:border-b-0">
                  {valor}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
