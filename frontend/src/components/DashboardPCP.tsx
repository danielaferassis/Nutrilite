import { Card } from './ui';

export default function DashboardPCP() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#211E16]">Dashboard PCP</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <p className="text-sm font-semibold text-[#211E16] mb-1">Capacidade em Uso</p>
          <p className="text-2xl font-bold text-[#006F44]">82%</p>
        </Card>
        <Card>
          <p className="text-sm font-semibold text-[#211E16] mb-1">Demandas Pendentes</p>
          <p className="text-2xl font-bold text-[#211E16]">14</p>
        </Card>
        <Card>
          <p className="text-sm font-semibold text-[#211E16] mb-1">Previsões Semanais</p>
          <p className="text-2xl font-bold text-[#211E16]">28</p>
        </Card>
        <Card className="border-red-200">
          <p className="text-sm font-semibold text-red-800 mb-1">Alertas (Gargalos)</p>
          <p className="text-2xl font-bold text-red-700">2</p>
        </Card>
      </div>
    </div>
  );
}