import { useEffect, useState } from 'react';
import { logger } from '../logger';

// Tipagem baseada nos KPIs definidos na Etapa 2[cite: 32]
interface KpiDashboard {
  ocupacaoPlanejada: number;
  atendimentoPrazo: number;
  saldoNaoAlocado: number;
  aderenciaPlano: number;
}

export function DashboardPCP() {
  const [kpis, setKpis] = useState<KpiDashboard | null>(null);

  useEffect(() => {
    // Simulação de chamada à API para os KPIs
    logger.info('Carregando indicadores de desempenho do PCP...');
    
    // Dados fictícios para o MVP[cite: 37]
    setKpis({
      ocupacaoPlanejada: 85.5,
      atendimentoPrazo: 92.0,
      saldoNaoAlocado: 1428, // kg
      aderenciaPlano: 98.2
    });
  }, []);

  if (!kpis) return <p>Carregando painel...</p>;

  return (
    <div style={{ padding: '20px' }}>
      <h2>Dashboard Gerencial - PCP e Performance</h2>
      <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
        <div style={{ padding: '20px', background: '#f5f5f5', borderRadius: '8px', width: '200px' }}>
          <h3>Ocupação Planejada</h3>
          <p style={{ fontSize: '24px', fontWeight: 'bold' }}>{kpis.ocupacaoPlanejada}%</p>
        </div>
        <div style={{ padding: '20px', background: '#f5f5f5', borderRadius: '8px', width: '200px' }}>
          <h3>Aderência ao Plano</h3>
          <p style={{ fontSize: '24px', fontWeight: 'bold' }}>{kpis.aderenciaPlano}%</p>
        </div>
        <div style={{ padding: '20px', background: '#ffebee', borderRadius: '8px', width: '200px' }}>
          <h3>Saldo Não Alocado</h3>
          <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#c62828' }}>{kpis.saldoNaoAlocado} kg</p>
        </div>
      </div>
    </div>
  );
}