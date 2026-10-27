import { Settings, Save } from 'lucide-react';

export default function MatrizCapacidade() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-6 border-b pb-4">
        <Settings className="text-[#006F44]" />
        <h1 className="text-2xl font-bold text-[#211E16]">Matriz de Capacidade e Regras</h1>
      </div>
      
      <div className="bg-white rounded-lg shadow p-6 space-y-6">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Erva / Cultura</label>
            <select className="w-full border-gray-300 rounded-md shadow-sm focus:ring-[#84BD00] focus:border-[#84BD00] p-2 border">
              <option>Acerola</option>
              <option>Picão Preto</option>
              <option>Alecrim</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Equipamento (Secador)</label>
            <select className="w-full border-gray-300 rounded-md shadow-sm focus:ring-[#84BD00] focus:border-[#84BD00] p-2 border">
              <option>Secador A (Esteira)</option>
              <option>Secador B (Rotativo)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Capacidade (kg/h)</label>
            <input type="number" className="w-full border-gray-300 rounded-md shadow-sm p-2 border" placeholder="Ex: 500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rendimento Esperado (%)</label>
            <input type="number" className="w-full border-gray-300 rounded-md shadow-sm p-2 border" placeholder="Ex: 12" />
          </div>
        </div>
        
        <div className="flex justify-end pt-4 border-t">
          <button className="flex items-center gap-2 bg-[#006F44] text-white px-4 py-2 rounded-md hover:bg-green-800">
            <Save size={16} /> Salvar Parâmetros
          </button>
        </div>
      </div>
    </div>
  );
}