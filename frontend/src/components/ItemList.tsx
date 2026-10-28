interface ItemListProps {
  colunas: string[];
  dados: Record<string, string | number>[];
}

export default function ItemList({ colunas, dados }: ItemListProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="border-b border-[#C7C8CA] text-xs font-semibold">
          <tr>
            {colunas.map((col, idx) => <th key={idx} className="py-3 px-4">{col}</th>)}
          </tr>
        </thead>
        <tbody>
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