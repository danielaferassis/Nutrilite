import { ReactNode } from 'react';

interface ItemListProps {
  colunas: string[];
  // Cada linha vira uma <tr>, na ordem das chaves (pode ter botões, etiquetas...)
  dados: Record<string, ReactNode>[];
  vazio?: string;
}

export default function ItemList({ colunas, dados, vazio = 'Nenhum registro.' }: ItemListProps) {
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full text-sm text-left tabular-nums">
        <thead className="text-xs font-semibold text-suave">
          <tr className="border-b border-borda">
            {colunas.map((col, idx) => (
              <th key={idx} className="py-2.5 px-4 whitespace-nowrap">{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dados.length === 0 && (
            <tr>
              <td colSpan={colunas.length} className="py-10 px-4 text-center text-suave">{vazio}</td>
            </tr>
          )}
          {dados.map((linha, idx) => (
            <tr key={idx} className="border-b border-borda last:border-b-0 transition-colors hover:bg-verde-50">
              {Object.values(linha).map((valor, vIdx) => (
                <td key={vIdx} className="py-3 px-4 text-texto">{valor}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
