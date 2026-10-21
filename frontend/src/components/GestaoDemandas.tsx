import { useState } from 'react';
import { logger } from '../logger';

export function GestaoDemanda() {
  const [cultura, setCultura] = useState('Agrião');
  const [metaSeca, setMetaSeca] = useState<number | ''>('');
  const [reserva, setReserva] = useState<number | ''>('');
  const [necessidadeFresca, setNecessidadeFresca] = useState<number>(0);

  // Fatores de conversão baseados no levantamento (ex: Agrião 23.3:1, Camomila 6:1)[cite: 17]
  const fatoresConversao: Record<string, number> = {
    'Agrião': 23.3,
    'Camomila': 6.0,
    'Picão-preto': 4.5, // Fictício para exemplo
  };

  const calcularNecessidade = () => {
    if (!metaSeca) return;
    const fator = fatoresConversao[cultura];
    const totalSeco = Number(metaSeca) + Number(reserva);
    const calculoFresco = totalSeco * fator;
    setNecessidadeFresca(calculoFresco);
    logger.info(`Cálculo de demanda realizado para ${cultura}: Necessidade de ${calculoFresco.toFixed(2)}kg frescos.`);
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px' }}>
      <h2>Gestão de Demandas (Exportação)</h2>
      <p>Conversão de produto acabado para necessidade de campo[cite: 30].</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', background: '#f9f9f9', padding: '20px', borderRadius: '8px' }}>
        <label>
          Cultura Alvo:
          <select value={cultura} onChange={(e) => setCultura(e.target.value)} style={{ marginLeft: '10px' }}>
            {Object.keys(fatoresConversao).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        
        <label>
          Meta de Produto Seco (kg):
          <input type="number" value={metaSeca} onChange={(e) => setMetaSeca(Number(e.target.value))} />
        </label>

        <label>
          Reserva de Segurança (kg):
          <input type="number" value={reserva} onChange={(e) => setReserva(Number(e.target.value))} />
        </label>

        <button onClick={calcularNecessidade} style={{ padding: '10px', background: '#2e7d32', color: 'white' }}>
          Calcular Necessidade Fresca
        </button>

        {necessidadeFresca > 0 && (
          <div style={{ marginTop: '20px', padding: '15px', background: '#e8f5e9', border: '1px solid #4caf50' }}>
            <h4>Resultado do Planejamento:</h4>
            <p>Para produzir {Number(metaSeca) + Number(reserva)}kg secos de {cultura}, serão necessários <strong>{necessidadeFresca.toFixed(2)} kg de matéria-prima fresca</strong>.</p>
          </div>
        )}
      </div>
    </div>
  );
}