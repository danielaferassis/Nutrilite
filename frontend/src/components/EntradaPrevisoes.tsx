import { Calendar, Sprout, Send } from 'lucide-react';

export default function EntradaPrevisoes() {
  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6 animate-in fade-in duration-300">
      <header className="flex items-center gap-3 border-b border-gray-200 pb-4">
        <div className="bg-[#84BD00] p-2 rounded-lg shadow-sm">
          <Sprout className="text-[#211E16]" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Entrada do Campo (Previsões)</h1>
          <p className="text-sm text-gray-500">Módulo exclusivo para as fontes fornecedoras registrarem estimativas semanais.</p>
        </div>
      </header>

      <div className="bg-white rounded-xl shadow-md border border-gray-100 p-8">
        <form className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Cultura</label>
              <select className="block w-full py-2.5 px-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#84BD00] bg-gray-50 transition-colors">
                <option>Acerola Verde</option>
                <option>Acerola Madura</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Volume Previsto</label>
              <div className="relative">
                <input type="number" className="block w-full py-2.5 pl-3 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#84BD00] bg-gray-50 transition-colors" placeholder="Ex: 1500" />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <span className="text-gray-400 text-sm">Kg</span>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Semana de Entrega</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Calendar size={18} className="text-gray-400" />
                </div>
                <input type="week" className="block w-full py-2.5 pl-10 pr-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#84BD00] bg-gray-50 transition-colors" />
              </div>
            </div>
          </div>
          
          <div className="flex justify-end pt-4">
            <button className="flex items-center gap-2 bg-[#84BD00] text-[#211E16] px-6 py-2.5 rounded-lg font-bold hover:bg-opacity-90 focus:ring-4 focus:ring-green-100 transition-all active:scale-[0.98] shadow-sm">
              <Send size={18} />
              Registrar Estimativa
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}