import { Card } from './ui';

export default function MatrizCapacidade() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#211E16]">Matriz de Capacidade</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <h3 className="font-bold text-[#006F44]">Secador Spray Dryer (SEC-01)</h3>
          <div className="mt-4 flex justify-between text-sm">
            <span>Ocupação:</span>
            <span className="font-semibold text-[#84BD00]">85%</span>
          </div>
        </Card>
      </div>
    </div>
  );
}