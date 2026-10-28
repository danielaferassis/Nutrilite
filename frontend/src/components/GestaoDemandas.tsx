import { Card, Button, Input } from './ui';
import ItemList from './ItemList';

export default function GestaoDemandas() {
  const colunas = ['ID', 'Matéria Prima', 'Quantidade', 'Prazo', 'Status'];
  const dados = [
    { id: 'DM-001', materia: 'Acerola', qtde: '1000 kg', prazo: '01/06/2026', status: 'Concluído' },
    { id: 'DM-002', materia: 'Picão Preto', qtde: '500 kg', prazo: '05/06/2026', status: 'Pendente' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-[#211E16]">Gestão de Demandas</h1>
          <p className="text-sm text-gray-500">Converta e monitore necessidades de produção.</p>
        </div>
        <Button variant="primary">+ Nova Demanda</Button>
      </div>

      <Card>
        <div className="flex gap-4 mb-6">
          <Input placeholder="Buscar lote ou matéria prima..." className="flex-1" />
          <Button variant="secondary">Filtrar</Button>
        </div>
        <ItemList colunas={colunas} dados={dados} />
      </Card>
    </div>
  );
}