import { useState } from 'react';

// Tipagem baseada nos secadores e semanas (W32 a W52)[cite: 14, 25]
interface AlocacaoSemana {
  semana: string;
  scb01: number; // kg alocados
  scb02: number;
  scb03: number;
  excedente: number; // Saldo não alocado[cite: 31]
}

export function MatrizCapacidade() {
  // Dados mockados representando o cruzamento do simulador de capacidade[cite: 16]
  const [matriz] = useState<AlocacaoSemana[]>([
    { semana: 'W32', scb01: 2000, scb02: 1500, scb03: 5600, excedente: 0 },
    { semana: 'W33', scb01: 2000, scb02: 1500, scb03: 5600, excedente: 0 },
    { semana: 'W34', scb01: 2000, scb02: 1500, scb03: 5600, excedente: 1040 }, // Exemplo de conflito[cite: 31]
    { semana: 'W35', scb01: 2000, scb02: 1500, scb03: 5600, excedente: 720 },
  ]);

  return (
    <div style={{ padding: '20px' }}>
      <h2>Matriz de Capacidade dos Secadores</h2>
      <p>Análise de ocupação das semanas W32 a W52 e identificação de excedentes[cite: 25].</p>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px' }}>
        <thead>
          <tr style={{ background: '#e0e0e0', textAlign: 'left' }}>
            <th style={{ padding: '10px', border: '1px solid #ccc' }}>Semana</th>
            <th style={{ padding: '10px', border: '1px solid #ccc' }}>SCB01 (Elétrico)</th>
            <th style={{ padding: '10px', border: '1px solid #ccc' }}>SCB02 (Vapor)</th>
            <th style={{ padding: '10px', border: '1px solid #ccc' }}>SCB03 (GLP)</th>
            <th style={{ padding: '10px', border: '1px solid #ccc' }}>Excedente / Risco</th>
          </tr>
        </thead>
        <tbody>
          {matriz.map((linha) => (
            <tr key={linha.semana}>
              <td style={{ padding: '10px', border: '1px solid #ccc', fontWeight: 'bold' }}>{linha.semana}</td>
              <td style={{ padding: '10px', border: '1px solid #ccc' }}>{linha.scb01} kg</td>
              <td style={{ padding: '10px', border: '1px solid #ccc' }}>{linha.scb02} kg</td>
              <td style={{ padding: '10px', border: '1px solid #ccc' }}>{linha.scb03} kg</td>
              <td style={{ padding: '10px', border: '1px solid #ccc', background: linha.excedente > 0 ? '#ffcdd2' : '#c8e6c9', color: linha.excedente > 0 ? '#b71c1c' : '#1b5e20', fontWeight: 'bold' }}>
                {linha.excedente > 0 ? `${linha.excedente} kg (Sobrecarga)` : 'Capacidade OK'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}