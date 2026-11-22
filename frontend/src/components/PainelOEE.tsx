import { Activity, CalendarRange, CircleCheckBig, Gauge, ShieldQuestion, Sprout, Target, Timer } from 'lucide-react';
import { useState } from 'react';

import { query } from '../api';
import { formatarData, formatarHoras, formatarKg, formatarPct, hojeIso } from '../formatar';
import { useApi } from '../hooks';
import { IndicadoresSecagem } from '../tipos';
import { Alerta, Barra, CabecalhoCard, Card, Input, KpiCard, Legenda, TEXTO_TOM, Tabela, tomPorFaixa } from './ui';

// Período padrão: os últimos 30 dias até hoje
const JANELA_DIAS = 30;

/** Percentual com mini barra colorida pela faixa (null = "n/a", barra vazia). */
function CelulaPct({ pct }: { pct: number | null }) {
  const tom = tomPorFaixa(pct);
  return (
    <div className="min-w-24">
      <span className={`font-semibold ${TEXTO_TOM[tom]}`}>{formatarPct(pct)}</span>
      <div className="mt-1">
        <Barra valor={pct} tom={tom} />
      </div>
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
      <CabecalhoCard
        icone={Gauge}
        titulo="Indicadores de OEE e aderência ao plano"
        descricao="OEE sem qualidade: o Infinity não informa refugo."
        acoes={
          <div className="grid w-full grid-cols-2 gap-3 sm:w-80">
            <Input id="oee-de" label="De" type="date" value={periodo.de} onChange={(e) => setPeriodo({ ...periodo, de: e.target.value })} />
            <Input id="oee-ate" label="Até" type="date" value={periodo.ate} onChange={(e) => setPeriodo({ ...periodo, ate: e.target.value })} />
          </div>
        }
      />

      {!valido && <Alerta>Escolha um período válido.</Alerta>}
      {indicadores.erro && <Alerta>{indicadores.erro}</Alerta>}
      {dados && dados.avisos.length > 0 && (
        <div className="mb-4 space-y-2">
          {dados.avisos.map((aviso) => <Alerta key={aviso} tipo="aviso">{aviso}</Alerta>)}
        </div>
      )}

      {dados && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <section aria-label="Disponibilidade">
              <KpiCard
                icone={Timer}
                titulo="Disponibilidade"
                valor={formatarPct(dados.total.disponibilidade_pct)}
                progresso={dados.total.disponibilidade_pct ?? 0}
                tom={tomPorFaixa(dados.total.disponibilidade_pct)}
                detalhe={`${formatarHoras(dados.total.horas_apontadas)} de ${formatarHoras(dados.total.horas_disponiveis)}`}
              />
            </section>
            <section aria-label="Performance">
              <KpiCard
                icone={Activity}
                titulo="Performance"
                valor={formatarPct(dados.total.performance_pct)}
                progresso={dados.total.performance_pct ?? 0}
                tom={tomPorFaixa(dados.total.performance_pct)}
                detalhe="tempo padrão ÷ tempo real"
              />
            </section>
            <section aria-label="Qualidade">
              <KpiCard
                icone={ShieldQuestion}
                titulo="Qualidade"
                valor={<span className="text-base text-suave">não informada</span>}
                tom="neutro"
                detalhe="o Infinity não traz refugo"
              />
            </section>
            <section aria-label="OEE (sem qualidade)">
              <KpiCard
                icone={Gauge}
                titulo="OEE (sem qualidade)"
                valor={formatarPct(dados.total.oee_sem_qualidade_pct)}
                progresso={dados.total.oee_sem_qualidade_pct ?? 0}
                tom={tomPorFaixa(dados.total.oee_sem_qualidade_pct)}
                detalhe="disponibilidade × performance"
              />
            </section>
            <section aria-label="Aderência ao plano">
              <KpiCard
                icone={Target}
                titulo="Aderência ao plano"
                valor={formatarPct(dados.total.aderencia_pct)}
                progresso={dados.total.aderencia_pct ?? 0}
                tom={tomPorFaixa(dados.total.aderencia_pct)}
                detalhe={`${formatarHoras(dados.total.horas_cumpridas)} cumpridas de ${formatarHoras(dados.total.horas_planejadas)} planejadas`}
              />
            </section>
          </div>

          <div>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-tinta">
              <CircleCheckBig aria-hidden="true" className="size-4 text-verde-700" />
              Por secador
            </h3>
            <Tabela
              linhas={dados.secadores}
              chave={(s) => s.secador.id}
              filtravel={false}
              vazio="Nenhum secador ativo."
              colunas={[
                { titulo: 'Secador', valor: (s) => <span className="font-semibold text-tinta">{s.secador.codigo}</span> },
                {
                  titulo: 'Cargas',
                  valor: (s) => (s.cargas_sem_padrao ? `${s.cargas} (${s.cargas_sem_padrao} sem padrão)` : String(s.cargas)),
                },
                { titulo: 'Disponibilidade', valor: (s) => <CelulaPct pct={s.disponibilidade_pct} /> },
                { titulo: 'Performance', valor: (s) => <CelulaPct pct={s.performance_pct} /> },
                { titulo: 'OEE (sem qualidade)', valor: (s) => <CelulaPct pct={s.oee_sem_qualidade_pct} /> },
                { titulo: 'Horas cumpridas / planejadas', valor: (s) => `${formatarHoras(s.horas_cumpridas)} / ${formatarHoras(s.horas_planejadas)}` },
                { titulo: 'Aderência', valor: (s) => <CelulaPct pct={s.aderencia_pct} /> },
              ]}
            />
          </div>

          {(dados.total.por_erva ?? []).length > 0 && (
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-tinta">
                <Sprout aria-hidden="true" className="size-4 text-verde-700" />
                Aderência por erva
              </h3>
              <Tabela
                linhas={dados.total.por_erva ?? []}
                chave={(e) => e.erva}
                filtravel={false}
                colunas={[
                  { titulo: 'Erva', valor: (e) => <span className="font-semibold text-tinta">{e.erva}</span> },
                  { titulo: 'Seco (apontado)', valor: (e) => formatarKg(e.kg_apontado) },
                  { titulo: 'Planejado', valor: (e) => formatarKg(e.kg_planejado) },
                  { titulo: 'Aderência', valor: (e) => <CelulaPct pct={e.aderencia_pct} /> },
                ]}
              />
              <p className="mt-2 text-xs text-suave">
                Cada erva só cumpre o próprio plano, até 100% por secador e dia: secar outra erva no lugar não conta, e
                secar a mais num dia não compensa outro. A aderência geral pesa cada erva pelas horas planejadas.
              </p>
            </div>
          )}

          {dados.dias.length > 0 && (
            <details className="group rounded-lg border border-borda">
              <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-semibold text-tinta hover:bg-fundo">
                <CalendarRange aria-hidden="true" className="size-4 text-verde-700" />
                Dia a dia ({dados.dias.length})
              </summary>
              <div className="border-t border-borda p-3">
                <Tabela
                  linhas={dados.dias}
                  chave={(d) => `${d.dia}-${d.secador_id}`}
                  colunas={[
                    { titulo: 'Dia', valor: (d) => formatarData(d.dia), texto: (d) => formatarData(d.dia), ordenar: (d) => d.dia },
                    { titulo: 'Secador', valor: (d) => codigoDo(d.secador_id), texto: (d) => codigoDo(d.secador_id), filtro: 'opcoes' },
                    { titulo: 'Cargas', valor: (d) => String(d.cargas), ordenar: (d) => d.cargas },
                    { titulo: 'Horas', valor: (d) => formatarHoras(d.horas_apontadas), ordenar: (d) => d.horas_apontadas },
                    { titulo: 'Disponibilidade', valor: (d) => <CelulaPct pct={d.disponibilidade_pct} /> },
                    { titulo: 'Performance', valor: (d) => <CelulaPct pct={d.performance_pct} /> },
                    { titulo: 'Ervas', valor: (d) => (d.por_erva ?? []).map((e) => `${e.erva}: ${formatarKg(e.kg_apontado)} / ${formatarKg(e.kg_planejado)}`).join(' · ') || '—' },
                    { titulo: 'Aderência', valor: (d) => <CelulaPct pct={d.aderencia_pct} /> },
                  ]}
                />
              </div>
            </details>
          )}

          <Legenda
            itens={[
              { amostra: 'bg-verde-600', rotulo: '90% ou mais', descricao: 'perto do ideal (100%)' },
              { amostra: 'bg-amber-500', rotulo: '70% a 90%', descricao: 'atenção' },
              { amostra: 'bg-red-600', rotulo: 'abaixo de 70%', descricao: 'crítico' },
              { amostra: 'bg-cinza', rotulo: 'n/a', descricao: 'sem dado no período (nunca vira 0%)' },
              {
                amostra: 'bg-gradient-to-r from-verde-700 to-lima-500',
                rotulo: 'Faixas visuais',
                descricao: 'meta oficial de OEE a validar com a empresa',
              },
            ]}
          />
        </div>
      )}
    </Card>
  );
}
