import { useState } from 'react';

import { query } from '../api';
import { formatarData, formatarHoras, formatarKg, formatarPct, hojeIso } from '../formatar';
import { useApi } from '../hooks';
import { IndicadoresSecagem } from '../tipos';
import ItemList from './ItemList';
import { Alerta, Card, Input } from './ui';

// Período padrão: os últimos 30 dias até hoje
const JANELA_DIAS = 30;

function Indicador({ titulo, valor, detalhe }: { titulo: string; valor: string; detalhe: string }) {
  return (
    <div className="rounded-lg border border-[#C7C8CA] bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{titulo}</p>
      <p className="text-2xl font-bold text-[#006F44]">{valor}</p>
      <p className="text-xs text-gray-500">{detalhe}</p>
    </div>
  );
}

/**
 * OEE e aderência ao plano, calculados com os apontamentos do Infinity.
 * A qualidade fica "não informada" (o Infinity não traz refugo) e o OEE mostrado
 * é disponibilidade × performance.
 */
export default function PainelOEE() {
  const [periodo, setPeriodo] = useState({ de: hojeIso(-JANELA_DIAS), ate: hojeIso() });
  const valido = periodo.de && periodo.ate && periodo.de <= periodo.ate;
  const indicadores = useApi<IndicadoresSecagem>(valido ? `/indicadores/secagem${query(periodo)}` : null);
  const dados = indicadores.dados;

  const codigoDo = (id: number) => dados?.secadores.find((s) => s.secador.id === id)?.secador.codigo ?? `#${id}`;

  return (
    <Card>
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-4">
        <div>
          <h2 className="font-semibold">Indicadores de OEE e aderência ao plano</h2>
          <p className="text-sm text-gray-500">
            Com os apontamentos importados. A qualidade não é informada pelo Infinity: o OEE mostrado é
            disponibilidade × performance.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 md:w-80">
          <Input id="oee-de" label="De" type="date" value={periodo.de} onChange={(e) => setPeriodo({ ...periodo, de: e.target.value })} />
          <Input id="oee-ate" label="Até" type="date" value={periodo.ate} onChange={(e) => setPeriodo({ ...periodo, ate: e.target.value })} />
        </div>
      </div>

      {!valido && <Alerta>Escolha um período válido.</Alerta>}
      {indicadores.erro && <Alerta>{indicadores.erro}</Alerta>}
      {dados?.avisos.map((aviso) => (
        <p key={aviso} className="text-sm text-amber-700 mb-2">{aviso}</p>
      ))}

      {dados && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Indicador
              titulo="Disponibilidade"
              valor={formatarPct(dados.total.disponibilidade_pct)}
              detalhe={`${formatarHoras(dados.total.horas_apontadas)} de ${formatarHoras(dados.total.horas_disponiveis)}`}
            />
            <Indicador
              titulo="Performance"
              valor={formatarPct(dados.total.performance_pct)}
              detalhe="tempo padrão ÷ tempo real das cargas"
            />
            <Indicador titulo="Qualidade" valor="não informada" detalhe="o Infinity não traz refugo" />
            <Indicador
              titulo="OEE (sem qualidade)"
              valor={formatarPct(dados.total.oee_sem_qualidade_pct)}
              detalhe="disponibilidade × performance"
            />
            <Indicador
              titulo="Aderência ao plano"
              valor={formatarPct(dados.total.aderencia_pct)}
              detalhe={`${formatarKg(dados.total.kg_apontado)} de ${formatarKg(dados.total.kg_planejado)} planejados`}
            />
          </div>

          <div>
            <h3 className="font-medium mb-2">Por secador</h3>
            <ItemList
              colunas={['Secador', 'Cargas', 'Disponibilidade', 'Performance', 'OEE (sem qualidade)', 'Apontado / planejado', 'Aderência']}
              dados={dados.secadores.map((s) => ({
                secador: s.secador.codigo,
                cargas: s.cargas_sem_padrao ? `${s.cargas} (${s.cargas_sem_padrao} sem padrão)` : String(s.cargas),
                disponibilidade: formatarPct(s.disponibilidade_pct),
                performance: formatarPct(s.performance_pct),
                oee: formatarPct(s.oee_sem_qualidade_pct),
                kg: `${formatarKg(s.kg_apontado)} / ${formatarKg(s.kg_planejado)}`,
                aderencia: formatarPct(s.aderencia_pct),
              }))}
              vazio="Nenhum secador ativo."
            />
          </div>

          {dados.dias.length > 0 && (
            <details>
              <summary className="cursor-pointer font-medium">Dia a dia ({dados.dias.length})</summary>
              <div className="mt-2">
                <ItemList
                  colunas={['Dia', 'Secador', 'Cargas', 'Horas', 'Disponibilidade', 'Performance', 'Apontado / planejado', 'Aderência']}
                  dados={dados.dias.map((d) => ({
                    dia: formatarData(d.dia),
                    secador: codigoDo(d.secador_id),
                    cargas: String(d.cargas),
                    horas: formatarHoras(d.horas_apontadas),
                    disponibilidade: formatarPct(d.disponibilidade_pct),
                    performance: formatarPct(d.performance_pct),
                    kg: `${formatarKg(d.kg_apontado)} / ${formatarKg(d.kg_planejado)}`,
                    aderencia: formatarPct(d.aderencia_pct),
                  }))}
                  vazio=""
                />
              </div>
            </details>
          )}
        </div>
      )}
    </Card>
  );
}
