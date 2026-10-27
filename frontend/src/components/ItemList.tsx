interface Item {
  id: string;
  titulo: string;
  subtitulo: string;
  status: string;
}

export default function ItemList({ itens }: { itens: Item[] }) {
  return (
    <div className="bg-white shadow overflow-hidden sm:rounded-md">
      <ul className="divide-y divide-gray-200">
        {itens.map((item) => (
          <li key={item.id} className="px-4 py-4 sm:px-6 hover:bg-gray-50 cursor-pointer">
            <div className="flex items-center justify-between">
              <div className="truncate text-sm font-medium text-[#006F44]">
                {item.titulo}
              </div>
              <div className="ml-2 flex-shrink-0 flex">
                <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                  {item.status}
                </span>
              </div>
            </div>
            <div className="mt-2 text-sm text-gray-500">
              {item.subtitulo}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}