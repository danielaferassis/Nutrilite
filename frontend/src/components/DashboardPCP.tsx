import { LayoutDashboard, AlertCircle } from 'lucide-react';

export default function DashboardPCP() {
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-6 border-b pb-4">
        <LayoutDashboard className="text-[#006F44]" />
        <h1 className="text-2xl font-bold text-[#211E16]">Painel de Controle PCP</h1>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-[#006F44]">
          <p className="text-sm text-gray-500">Demanda Total (Semana)</p>
          <p className="text-2xl font-bold">12.500 Kg</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-[#84BD00]">
          <p className="text-sm text-gray-500">Previsão do Campo</p>
          <p className="text-2xl font-bold">11.200 Kg</p>
        </div>
        <div className="bg-red-50 p-4 rounded-lg shadow border-l-4 border-red-500 flex items-center justify-between">
          <div>
            <p className="text-sm text-red-700 font-medium">Déficit Projetado</p>
            <p className="text-2xl font-bold text-red-700">- 1.300 Kg</p>
          </div>
          <AlertCircle className="text-red-500" size={32} />
        </div>
      </div>
      
      <div className="bg-white rounded-lg shadow p-6 h-64 flex items-center justify-center border border-dashed border-gray-300">
        <p className="text-gray-400 text-sm">Área reservada para integração com biblioteca de gráficos (ex: Recharts)</p>
      </div>
    </div>
  );
}