import { useState } from 'react';
import { Calculator, Target } from 'lucide-react';

export default function GestaoDemandas() {
  const [demandaSeca, setDemandaSeca] = useState(1000);
  const rendimento = 0.12; // 12% simulado do backend
  const materiaPrimaFresca = demandaSeca / rendimento;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-6 border-b pb-4">
        <Target className="text-[#006F44]" />
        <h1 className="text-2xl font-bold text-[#211E16]">Gestão de Demandas</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-medium mb-4">Cadastro de Meta Líquida</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Demanda (Kg Produto Seco)</label>
              <input 
                type="number" 
                value={demandaSeca}
                onChange={(e) => setDemandaSeca(Number(e.target.value))}
                className="mt-1 w-full border-gray-300 rounded-md p-2 border" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Prazo / Prioridade</label>
              <select className="mt-1 w-full border-gray-300 rounded-md p-2 border">
                <option>Alta (Semana Atual)</option>
                <option>Média (Próxima Semana)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-[#f4f4f5] rounded-lg border border-[#C7C8CA] p-6 flex flex-col justify-center">
          <div className="flex items-center gap-2 mb-2 text-gray-600">
            <Calculator size={20} />
            <h3 className="font-medium">Conversão Automática</h3>
          </div>
          <p className="text-sm text-gray-500 mb-4">Baseado no rendimento atual aprovado (12%)</p>
          <div className="bg-white p-4 rounded text-center shadow-sm">
            <span className="block text-sm text-gray-500">Necessidade de Campo (Fresca)</span>
            <span className="block text-3xl font-bold text-[#006F44]">
              {materiaPrimaFresca.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} Kg
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}