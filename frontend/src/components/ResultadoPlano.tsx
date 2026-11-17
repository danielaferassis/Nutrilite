import { Fragment } from 'react';

import {
  DIAS_SEMANA,
  ROTULO_ESTAGIO,
  ROTULO_PENDENCIA,
  formatarData,
  formatarHoras,
  formatarKg,
  formatarPct,
} from '../formatar';
import { baixarCsv, dataCsv, gerarCsv, numeroCsv } from '../exportar';
import { Alocacao, Necessidade, ResultadoSimulacao, TipoPendencia } from '../tipos';
import ItemList from './ItemList';
import { Alerta, Button, Card, Etiqueta, EtiquetaCor, KpiCard } from './ui';

// Mesma folga do motor para comparar kg em ponto flutuante
const FOLGA_KG = 1e-6;

const COR_PENDENCIA: Record<TipoPendencia, EtiquetaCor> = {
  param_ausente: 'amarelo',
  capacidade_excedida: 'vermelho',
  atraso: 'vermelho',
  saldo_nao_alocado: 'azul',
};

// Cores das ervas no cronograma: tons escuros o bastante para texto branco,
// na família da marca. A ordem segue o código da erva, para não mudar entre telas.
const CORES_ERVA = ['#0b8355', '#5e8c0a', '#2e6f8e', '#8a6d1e', '#7a4e9c', '#b4532a', '#3f7d6e', '#4a5a1c'];

// Dia da semana de uma data ISO, sem passar pelo fuso do navegador
const diaDaSemana = (iso: string) =>
  DIAS_SEMANA[(new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))).getUTCDay() + 6) % 7];

/**
 * Cronograma em blocos: uma linha por secador, uma coluna por dia. Cada bloco é
 * uma erva no secador naquele dia; a faixa listrada marca que houve setup. Troca
 * de erva no mesmo dia empilha os blocos, na ordem em que entraram.
 */
export function Cronograma({ alocacoes }: { alocacoes: Alocacao[] }) {
  if (alocacoes.length === 0) return <p className="text-sm text-suave">Nenhuma alocação.</p>;

  const secadores = [...new Set(alocacoes.map((a) => a.secador))].sort();
  const dias = [...new Set(alocacoes.map((a) => a.dia))].sort();
  const ervas = [...new Set(alocacoes.map((a) => a.erva))].sort();
  const cor = (erva: string) => CORES_ERVA[ervas.indexOf(erva) % CORES_ERVA.length];

  // Pode haver mais de uma erva no dia, cada uma com várias linhas (lotes/demandas)
  const blocos = (dia: string, secador: string) => {
    const doDia = alocacoes.filter((a) => a.dia === dia && a.secador === secador);
    return [...new Set(doDia.map((a) => a.erva))].map((erva) => {
      const daErva = doDia.filter((a) => a.erva === erva);
      const soma = (campo: 'kg_fresco' | 'horas_secagem' | 'horas_setup') =>
        daErva.reduce((total, a) => total + Number(a[campo]), 0);
      return { erva, kg: soma('kg_fresco'), secagem: soma('horas_secagem'), setup: soma('horas_setup') };
    });
  };

  return (
    <div>
      <div className="overflow-x-auto pb-2">
        <div
          className="grid gap-1.5 text-xs"
          style={{ gridTemplateColumns: `4.5rem repeat(${dias.length}, minmax(6.5rem, 1fr))` }}
        >
          <div />
          {dias.map((dia) => (
            <div key={dia} className="pb-1 text-center font-semibold text-suave">
              {diaDaSemana(dia)}
              <span className="block text-sm text-tinta">{formatarData(dia).slice(0, 5)}</span>
            </div>
          ))}
          {secadores.map((secador) => (
            <Fragment key={secador}>
              <div className="flex items-center font-bold text-tinta">{secador}</div>
              {dias.map((dia) => {
                const doDia = blocos(dia, secador);
                if (doDia.length === 0) {
                  return (
                    <div key={dia} className="flex min-h-14 items-center justify-center rounded-lg border border-dashed border-borda bg-fundo text-suave/70">
                      livre
                    </div>
                  );
                }
                return (
                  <div key={dia} className="flex flex-col gap-1">
                    {doDia.map((b, i) => (
                      <div
                        key={b.erva}
                        title={`${b.erva} no ${secador} em ${formatarData(dia)}: ${formatarKg(b.kg)}, ${formatarHoras(b.secagem)} de secagem e ${formatarHoras(b.setup)} de setup`}
                        className="relative flex min-h-14 flex-1 flex-col justify-between overflow-hidden rounded-lg py-1.5 pr-2 pl-3 text-white shadow-suave transition-transform duration-200 ease-suave hover:z-10 hover:-translate-y-0.5 hover:shadow-elevada"
                        style={{ backgroundColor: cor(b.erva) }}
                      >
                        {b.setup > 0 && (
                          <span
                            aria-hidden="true"
                            className="absolute inset-y-0 left-0 w-1.5 bg-[repeating-linear-gradient(45deg,rgb(255_255_255/0.6)_0_3px,transparent_3px_6px)]"
                          />
                        )}
                        <span className="truncate font-semibold">{i > 0 && '↳ '}{b.erva}</span>
                        <span className="opacity-90">{formatarKg(b.kg)} · {formatarHoras(b.secagem + b.setup)}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-suave">
        {ervas.map((erva) => (
          <span key={erva} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2.5 rounded-sm" style={{ backgroundColor: cor(erva) }} />
            {erva}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-1.5 rounded-sm bg-[repeating-linear-gradient(45deg,#6b6860_0_2px,transparent_2px_4px)]" />
          dia com setup
        </span>
      </div>
    </div>
  );
}

type Situacao = 'coberta' | 'atraso' | 'proximo_plano';

const SITUACAO: Record<Situacao, { rotulo: string; cor: EtiquetaCor }> = {
  coberta: { rotulo: 'Coberta', cor: 'verde' },
  atraso: { rotulo: 'Atraso', cor: 'vermelho' },
  // Prazo depois do fim: o próximo plano ainda pode cobrir, não é atraso
  proximo_plano: { rotulo: 'Continua no próximo plano', cor: 'cinza' },
};

/**
 * @param nomeArquivo base do nome dos CSV exportados (ex.: "plano-v3"); o período é acrescentado.
 */
export default function ResultadoPlano({
  resultado,
  nomeArquivo = 'simulacao',
}: {
  resultado: ResultadoSimulacao;
  nomeArquivo?: string;
}) {
  const { kpis } = resultado;
  const ocupacao = kpis.ocupacao_planejada_pct ?? {};
  const aCobrirDepois = Object.entries(kpis.a_cobrir_apos_horizonte_kg ?? {});

  // Kg secos destinados a cada demanda no plano
  const coberto: Record<string, number> = {};
  resultado.alocacoes.forEach((a) => {
    if (a.demanda_id) coberto[a.demanda_id] = (coberto[a.demanda_id] ?? 0) + a.kg_fresco;
  });
  const falta = (demandaId: string, necessario: number) => Math.max(0, necessario - (coberto[demandaId] ?? 0));
  const situacao = (n: Necessidade): Situacao => {
    if (falta(n.demanda_id, n.kg_fresco) < FOLGA_KG) return 'coberta';
    return n.prazo > resultado.fim ? 'proximo_plano' : 'atraso';
  };

  const periodo = `${resultado.inicio}_a_${resultado.fim}`;
  const exportarCronograma = () =>
    baixarCsv(
      `${nomeArquivo}_cronograma_${periodo}.csv`,
      gerarCsv(resultado.alocacoes, [
        { titulo: 'Dia', valor: (a) => dataCsv(a.dia) },
        { titulo: 'Secador', valor: (a) => a.secador },
        { titulo: 'Erva', valor: (a) => a.erva },
        { titulo: 'Kg de fresco', valor: (a) => numeroCsv(a.kg_fresco) },
        { titulo: 'Horas de secagem', valor: (a) => numeroCsv(a.horas_secagem) },
        { titulo: 'Horas de setup', valor: (a) => numeroCsv(a.horas_setup) },
        { titulo: 'Lote', valor: (a) => a.lote_id },
        { titulo: 'Demanda', valor: (a) => a.demanda_id ?? 'sem demanda' },
      ])
    );
  const exportarNecessidades = () =>
    baixarCsv(
      `${nomeArquivo}_necessidades_${periodo}.csv`,
      gerarCsv(resultado.necessidades, [
        { titulo: 'Demanda', valor: (n) => n.demanda_id },
        { titulo: 'Erva', valor: (n) => n.erva },
        { titulo: 'Meta (kg)', valor: (n) => numeroCsv(n.kg_meta) },
        { titulo: 'Estágio da meta', valor: (n) => ROTULO_ESTAGIO[n.estagio_meta] },
        { titulo: 'Fresco necessário (kg)', valor: (n) => numeroCsv(n.kg_fresco) },
        { titulo: 'Prazo', valor: (n) => dataCsv(n.prazo) },
        { titulo: 'Coberto no plano (kg)', valor: (n) => numeroCsv(coberto[n.demanda_id] ?? 0) },
        { titulo: 'Falta (kg)', valor: (n) => numeroCsv(falta(n.demanda_id, n.kg_fresco)) },
        { titulo: 'Situação', valor: (n) => SITUACAO[situacao(n)].rotulo },
      ])
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        {resultado.viavel ? (
          <Etiqueta cor="verde">Viável</Etiqueta>
        ) : (
          <Etiqueta cor="vermelho">Com pendências</Etiqueta>
        )}
        <span className="text-sm text-suave">
          {formatarData(resultado.inicio)} a {formatarData(resultado.fim)}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          {resultado.alocacoes.length > 0 && (
            <Button variant="secondary" onClick={exportarCronograma}>Baixar cronograma (Excel)</Button>
          )}
          {resultado.necessidades.length > 0 && (
            <Button variant="secondary" onClick={exportarNecessidades}>Baixar necessidades (Excel)</Button>
          )}
        </div>
      </div>

      {resultado.avisos.map((aviso) => <Alerta key={aviso} tipo="aviso">{aviso}</Alerta>)}

      {resultado.pendencias.length > 0 && (
        <Card>
          <h3 className="font-semibold mb-3">Pendências ({resultado.pendencias.length})</h3>
          <ul className="space-y-2">
            {resultado.pendencias.map((p, i) => (
              <li key={i} className="flex gap-3 items-start text-sm">
                <Etiqueta cor={COR_PENDENCIA[p.tipo]}>{ROTULO_PENDENCIA[p.tipo]}</Etiqueta>
                <span>{p.mensagem}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {aCobrirDepois.length > 0 && (
        <Alerta tipo="aviso">
          Demandas que vencem depois de {formatarData(resultado.fim)} já recebem a secagem deste plano. Ainda faltam{' '}
          {aCobrirDepois.map(([erva, kg]) => `${formatarKg(kg)} de ${erva}`).join(', ')} (erva fresca) para elas, a
          cobrir no próximo plano.
        </Alerta>
      )}

      {Object.keys(ocupacao).length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.entries(ocupacao).map(([secador, pct]) => (
            <KpiCard
              key={secador}
              titulo={`Ocupação ${secador}`}
              // null = sem dia disponível no horizonte: "não aplicável", nunca 0%
              valor={formatarPct(pct)}
              progresso={pct}
              detalhe={`${formatarHoras(kpis.horas_ocupadas?.[secador] ?? 0)} de ${formatarHoras(kpis.horas_disponiveis?.[secador] ?? 0)} disponíveis`}
            />
          ))}
        </div>
      )}

      <Card>
        <h3 className="font-semibold mb-3">Cronograma de secagem</h3>
        <Cronograma alocacoes={resultado.alocacoes} />
      </Card>

      {resultado.necessidades.length > 0 && (
        <Card>
          <h3 className="font-semibold mb-3">Necessidade de erva fresca (cálculo reverso)</h3>
          <ItemList
            colunas={['Demanda', 'Erva', 'Meta', 'Fresco necessário', 'Prazo', 'Coberto no plano', 'Falta', 'Situação']}
            dados={resultado.necessidades.map((n) => ({
              demanda: `#${n.demanda_id}`,
              erva: n.erva,
              meta: `${formatarKg(n.kg_meta)} (${ROTULO_ESTAGIO[n.estagio_meta].toLowerCase()})`,
              fresco: formatarKg(n.kg_fresco),
              prazo: formatarData(n.prazo),
              coberto: formatarKg(coberto[n.demanda_id] ?? 0),
              falta: falta(n.demanda_id, n.kg_fresco) < FOLGA_KG ? '—' : formatarKg(falta(n.demanda_id, n.kg_fresco)),
              situacao: <Etiqueta cor={SITUACAO[situacao(n)].cor}>{SITUACAO[situacao(n)].rotulo}</Etiqueta>,
            }))}
          />
        </Card>
      )}

      {resultado.alocacoes.length > 0 && (
        <details className="bg-white border border-borda rounded-lg p-5">
          <summary className="font-semibold cursor-pointer">Detalhe das alocações</summary>
          <div className="mt-4">
            <ItemList
              colunas={['Dia', 'Secador', 'Erva', 'Kg fresco', 'Secagem', 'Setup', 'Lote', 'Demanda']}
              dados={resultado.alocacoes.map((a) => ({
                dia: formatarData(a.dia),
                secador: a.secador,
                erva: a.erva,
                kg: formatarKg(a.kg_fresco),
                secagem: formatarHoras(a.horas_secagem),
                setup: formatarHoras(a.horas_setup),
                lote: `#${a.lote_id}`,
                demanda: a.demanda_id ? `#${a.demanda_id}` : 'sem demanda',
              }))}
            />
          </div>
        </details>
      )}
    </div>
  );
}
