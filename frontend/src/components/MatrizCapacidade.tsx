import { Settings, Save, Zap } from 'lucide-react';

export default function MatrizCapacidade() {
  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6 animate-in fade-in duration-300">
      <header className="flex items-center gap-3 border-b border-gray-200 pb-4">
        <div className="bg-[#006F44] p-2 rounded-lg shadow-sm">
          <Settings className="text-white" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Matriz de Capacidade e Regras</h1>
          <p className="text-sm text-gray-500">Configure os parâmetros operacionais dos secadores e rendimento das ervas.</p>
        </div>
      </header>
      
      <div className="bg-white rounded-xl shadow-md border border-gray-100 p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Erva / Cultura</label>
            <select className="block w-full py-2.5 px-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#84BD00] focus:border-[#84BD00] bg-gray-50 text-gray-900 transition-colors">
              <option>Acerola</option>
              <option>Picão Preto</option>
              <option>Alecrim</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Equipamento (Secador)</label>
            <select className="block w-full py-2.5 px-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#84BD00] focus:border-[#84BD00] bg-gray-50 text-gray-900 transition-colors">
              <option>Secador A (Esteira)</option>
              <option>Secador B (Rotativo)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Capacidade (kg/h)</label>
            <div className="relative">
              <input type="number" className="block w-full py-2.5 pl-3 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#84BD00] focus:border-[#84BD00] bg-gray-50 transition-colors" placeholder="Ex: 500" />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <span className="text-gray-400 text-sm">kg/h</span>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Rendimento Esperado</label>
            <div className="relative">
              <input type="number" className="block w-full py-2.5 pl-3 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#84BD00] focus:border-[#84BD00] bg-gray-50 transition-colors" placeholder="Ex: 12" />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <span className="text-gray-400 text-sm">%</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="mt-8 flex justify-end border-t border-gray-100 pt-6">
          <button className="flex items-center gap-2 bg-[#006F44] text-white px-6 py-2.5 rounded-lg font-medium hover:bg-green-800 focus:ring-4 focus:ring-green-100 transition-all active:scale-[0.98] shadow-sm">
            <Save size={18} />
            Salvar Parâmetros
          </button>
        </div>
      </div>
    </div>
  );
}