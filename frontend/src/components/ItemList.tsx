import { ReactNode } from 'react';

interface ItemListProps {
  colunas: string[];
  // Cada linha vira uma <tr>, na ordem das chaves (pode ter botões, etiquetas...)
  dados: Record<string, ReactNode>[];
  vazio?: string;
}

export default function ItemList({ colunas, dados, vazio = 'Nenhum registro.' }: ItemListProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="border-b border-[#C7C8CA] text-xs font-semibold">
          <tr>
            {colunas.map((col, idx) => <th key={idx} className="py-3 px-4">{col}</th>)}
          </tr>
        </thead>
        <tbody>
          {dados.length === 0 && (
            <tr>
              <td colSpan={colunas.length} className="py-6 px-4 text-center text-gray-500">{vazio}</td>
            </tr>
          )}
          {dados.map((linha, idx) => (
            <tr key={idx} className="border-b border-[#C7C8CA]/30 hover:bg-gray-50">
              {Object.values(linha).map((valor, vIdx) => (
                <td key={vIdx} className="py-3 px-4">{valor}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}