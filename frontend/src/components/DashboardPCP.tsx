import { LayoutDashboard, TrendingDown, TrendingUp, AlertTriangle } from 'lucide-react';

export default function DashboardPCP() {
  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8 animate-in fade-in duration-300">
      <header className="flex items-center gap-3 border-b border-gray-200 pb-4">
        <div className="bg-[#006F44] p-2 rounded-lg shadow-sm">
          <LayoutDashboard className="text-white" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Painel de Controle PCP</h1>
          <p className="text-sm text-gray-500">Visão macro de planejamento e controle de produção industrial.</p>
        </div>
      </header>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* KPI 1 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-[#006F44]"></div>
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Demanda Total</p>
              <h3 className="text-3xl font-bold text-gray-900 mt-1">12.500 <span className="text-base font-normal text-gray-500">Kg</span></h3>
            </div>
            <div className="p-2 bg-green-50 rounded-lg text-[#006F44]">
              <TrendingUp size={24} />
            </div>
          </div>
          <p className="text-sm text-gray-600 font-medium">Meta para a semana atual</p>
        </div>

        {/* KPI 2 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-[#84BD00]"></div>
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Previsão Campo</p>
              <h3 className="text-3xl font-bold text-gray-900 mt-1">11.200 <span className="text-base font-normal text-gray-500">Kg</span></h3>
            </div>
            <div className="p-2 bg-[#84BD00]/10 rounded-lg text-[#006F44]">
              <TrendingDown size={24} />
            </div>
          </div>
          <p className="text-sm text-gray-600 font-medium">Estimativa reportada pelos fornecedores</p>
        </div>

        {/* KPI 3 (Alerta) */}
        <div className="bg-red-50 rounded-xl shadow-sm border border-red-200 p-6 hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-red-800 uppercase tracking-wider">Déficit Projetado</p>
              <h3 className="text-3xl font-bold text-red-900 mt-1">- 1.300 <span className="text-base font-normal text-red-700">Kg</span></h3>
            </div>
            <div className="p-2 bg-red-100 rounded-lg text-red-600 animate-pulse">
              <AlertTriangle size={24} />
            </div>
          </div>
          <p className="text-sm text-red-700 font-medium">Risco de ociosidade nos secadores</p>
        </div>
      </div>
      
      {/* Área Reservada para Gráfico */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 h-80 flex flex-col items-center justify-center border-dashed border-2">
        <p className="text-gray-500 font-medium mb-2">Módulo de Business Intelligence</p>
        <p className="text-sm text-gray-400 text-center max-w-md">
          Área reservada para a integração com biblioteca de gráficos (Recharts) que consumirá os endpoints analíticos do backend (FastAPI).
        </p>
      </div>
    </div>
  );
}