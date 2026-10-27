import { Calendar, Sprout } from 'lucide-react';

export default function EntradaPrevisoes() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-6 border-b pb-4">
        <Sprout className="text-[#84BD00]" />
        <h1 className="text-2xl font-bold text-[#211E16]">Entrada do Campo (Previsões)</h1>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <form className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Cultura</label>
              <select className="mt-1 w-full border-gray-300 rounded-md p-2 border">
                <option>Acerola Verde</option>
                <option>Acerola Madura</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Volume Previsto (Kg)</label>
              <input type="number" className="mt-1 w-full border-gray-300 rounded-md p-2 border" placeholder="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Semana de Entrega</label>
              <div className="mt-1 relative">
                <Calendar className="absolute inset-y-0 left-0 pl-3 h-full w-8 text-gray-400 pointer-events-none" />
                <input type="week" className="pl-10 w-full border-gray-300 rounded-md p-2 border" />
              </div>
            </div>
          </div>
          <button className="mt-4 bg-[#84BD00] text-[#211E16] font-medium px-4 py-2 rounded-md hover:bg-opacity-90">
            Registrar Estimativa
          </button>
        </form>
      </div>
    </div>
  );
}