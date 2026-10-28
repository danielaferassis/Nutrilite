import { Card, Input, Button } from './ui';

export default function EntradaPrevisoes() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#211E16]">Entrada de Previsões (S&OP)</h1>
        <p className="text-sm text-gray-500">Registo manual ou importação em lote para previsão de safra.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <h2 className="text-lg font-semibold mb-4">Registo Manual</h2>
          <form className="space-y-4">
            <Input label="Matéria Prima" placeholder="Ex: Echinacea" />
            <Input label="Quantidade (Kg)" type="number" />
            <Input label="Semana Prevista" type="week" />
            <Button variant="primary" className="w-full">Guardar Previsão</Button>
          </form>
        </Card>

        <Card className="flex flex-col items-center justify-center p-8 text-center bg-gray-50 border-dashed">
          <h3 className="font-medium mb-2">Importação em Lote via Excel/CSV</h3>
          <p className="text-sm text-gray-500 mb-6">Apenas ficheiros S&OP validados (Máx: 20MB)</p>
          <Button variant="secondary">Selecionar Ficheiro</Button>
        </Card>
      </div>
    </div>
  );
}