import { useState } from 'react';
import { Calculator, Target, ArrowRight } from 'lucide-react';

export default function GestaoDemandas() {
  const [demandaSeca, setDemandaSeca] = useState<number>(1000);
  const rendimento = 0.12; 
  const materiaPrimaFresca = demandaSeca / rendimento;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6 animate-in fade-in duration-300">
      <header className="flex items-center gap-3 border-b border-gray-200 pb-4">
        <div className="bg-[#006F44] p-2 rounded-lg shadow-sm">
          <Target className="text-white" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Gestão de Demandas</h1>
          <p className="text-sm text-gray-500">Conversão da meta de produto seco para a necessidade de matéria-prima fresca.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-stretch">
        
        {/* Painel de Entrada */}
        <div className="lg:col-span-3 bg-white rounded-xl shadow-md border border-gray-100 p-8">
          <h2 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
            1. Cadastro de Meta Líquida
          </h2>
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Demanda (Kg Produto Seco)</label>
              <input 
                type="number" 
                value={demandaSeca}
                onChange={(e) => setDemandaSeca(Number(e.target.value))}
                className="block w-full py-3 px-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#006F44] bg-gray-50 transition-colors text-lg font-medium" 
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Prazo / Prioridade</label>
              <select className="block w-full py-3 px-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#006F44] bg-gray-50 transition-colors">
                <option>Alta (Semana Atual)</option>
                <option>Média (Próxima Semana)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Painel de Resultado (Destaque Visual) */}
        <div className="lg:col-span-2 bg-[#211E16] text-white rounded-xl shadow-xl p-8 flex flex-col justify-center relative overflow-hidden">
          {/* Elemento de background abstrato */}
          <div className="absolute -right-10 -top-10 opacity-10">
            <Calculator size={180} />
          </div>
          
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4 text-[#84BD00]">
              <Calculator size={24} />
              <h3 className="font-bold text-lg">Conversão Automática</h3>
            </div>
            <p className="text-gray-400 text-sm mb-6">Baseado no rendimento atual aprovado (12%). Parâmetro sujeito a regras de governança.</p>
            
            <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
              <span className="block text-sm text-gray-300 font-medium mb-1">Necessidade de Campo (Fresca)</span>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black text-[#84BD00]">
                  {materiaPrimaFresca.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                </span>
                <span className="text-lg font-medium text-gray-300">Kg</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}