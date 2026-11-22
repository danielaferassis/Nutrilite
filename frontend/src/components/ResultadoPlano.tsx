import {
  CalendarRange,
  CircleCheck,
  CircleHelp,
  CircleX,
  Clock,
  Download,
  Info,
  ListTree,
  LucideIcon,
  Sprout,
  Target,
  TriangleAlert,
} from 'lucide-react';
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
import {
  Alerta,
  Button,
  CabecalhoCard,
  Card,
  Coluna,
  Etiqueta,
  EtiquetaCor,
  KpiCard,
  Legenda,
  Tabela,
} from './ui';

// Mesma folga do motor para comparar kg em ponto flutuante
const FOLGA_KG = 1e-6;

const PENDENCIA: Record<TipoPendencia, { icone: LucideIcon; cor: string; etiqueta: EtiquetaCor }> = {
  param_ausente: { icone: CircleHelp, cor: 'bg-amber-100 text-amber-700', etiqueta: 'amarelo' },
  capacidade_excedida: { icone: TriangleAlert, cor: 'bg-red-100 text-red-700', etiqueta: 'vermelho' },
  atraso: { icone: Clock, cor: 'bg-red-100 text-red-700', etiqueta: 'vermelho' },
  saldo_nao_alocado: { icone: Info, cor: 'bg-blue-100 text-blue-800', etiqueta: 'azul' },
};

// Cores das ervas no cronograma: tons escuros o bastante para texto branco,
// na família da marca. A ordem segue o código da erva, para não mudar entre telas.
export const CORES_ERVA = ['#0b8355', '#5e8c0a', '#2e6f8e', '#8a6d1e', '#7a4e9c', '#b4532a', '#3f7d6e', '#4a5a1c'];

const LISTRA_SETUP = 'bg-[repeating-linear-gradient(45deg,#6b6860_0_2px,transparent_2px_4px)]';

// Dia da semana de uma data ISO, sem passar pelo fuso do navegador
const diaDaSemana = (iso: string) =>
  DIAS_SEMANA[(new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))).getUTCDay() + 6) % 7];

/**
 * Cronograma em blocos: uma linha por secador, uma coluna por dia. Cada bloco é
 * uma erva no secador naquele dia; a faixa listrada marca que houve setup. Troca
 * de erva no mesmo dia empilha os blocos, na ordem em que entraram.
 */
export function Cronograma({ alocacoes }: { alocacoes: Alocacao[] }) {
  if (alocacoes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-borda bg-fundo px-4 py-8 text-center text-sm text-suave">
        <CalendarRange aria-hidden="true" className="size-7 text-cinza" />
        Nenhuma alocação.
      </div>
    );
  }

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
          <div className="sticky left-0 z-10 bg-white" />
          {dias.map((dia) => (
            <div key={dia} className="pb-1 text-center font-semibold text-suave">
              {diaDaSemana(dia)}
              <span className="block text-sm text-tinta">{formatarData(dia).slice(0, 5)}</span>
            </div>
          ))}
          {secadores.map((secador) => (
            <Fragment key={secador}>
              <div className="sticky left-0 z-10 flex items-center bg-white font-bold text-tinta">{secador}</div>
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
                        className="relative flex min-h-14 flex-1 flex-col justify-between overflow-hidden rounded-lg py-1.5 pr-2 pl-3 text-white shadow-suave transition-all duration-200 ease-suave hover:z-10 hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-elevada"
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
      <Legenda
        itens={[
          ...ervas.map((erva) => ({
            amostra: <span className="block size-3 rounded-sm" style={{ backgroundColor: cor(erva) }} />,
            rotulo: erva,
          })),
          {
            amostra: <span className={`block h-3 w-1.5 rounded-sm ${LISTRA_SETUP}`} />,
            rotulo: 'Faixa listrada',
            descricao: 'dia com setup (preparo ou limpeza do secador)',
          },
          {
            amostra: 'border border-dashed border-cinza bg-fundo',
            rotulo: 'Livre',
            descricao: 'secador sem erva programada no dia',
          },
          { amostra: 'bg-verde-700', rotulo: 'Bloco', descricao: 'kg de fresco · horas de secagem + setup' },
        ]}
      />
    </div>
  );
}

type Situacao = 'coberta' | 'atraso' | 'proximo_plano';

const SITUACAO: Record<Situacao, { rotulo: string; cor: EtiquetaCor }> = {
  coberta: { rotulo: 'Coberta', cor: 'verde' },
  atraso: { rotulo: 'Atraso', cor: 'vermelho' },
  // Prazo depois do fim: o próximo plano ainda pode cobrir, não é atraso
  proximo_plano: { rotulo: 'Continua no próximo plano', cor: 'azul' },
};

/** Pendências em cartões: o que o plano não consegue atender, e por quê. */
function Pendencias({ resultado }: { resultado: ResultadoSimulacao }) {
  const { pendencias } = resultado;
  return (
    <Card className="h-full">
      <CabecalhoCard
        titulo={
          <>
            Pendências
            <Etiqueta cor={pendencias.length ? 'vermelho' : 'verde'}>{pendencias.length}</Etiqueta>
          </>
        }
        descricao="O que o plano não consegue atender, e por quê."
      />
      {pendencias.length === 0 ? (
        <div className="flex items-center gap-3 rounded-lg bg-verde-50 p-3 text-sm text-verde-700">
          <CircleCheck aria-hidden="true" className="size-5 shrink-0" />
          Nenhuma pendência: tudo cabe nos secadores dentro do prazo.
        </div>
      ) : (
        <ul className="max-h-[26rem] space-y-2 overflow-y-auto pr-1">
          {pendencias.map((p, i) => {
            const estilo = PENDENCIA[p.tipo];
            return (
              <li
                key={i}
                className="flex gap-3 rounded-lg border border-borda p-3 transition-colors hover:bg-fundo animate-entra"
                style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
              >
                <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${estilo.cor}`}>
                  <estilo.icone aria-hidden="true" className="size-4" />
                </span>
                <div className="min-w-0 text-sm">
                  <b className="block text-[13px] text-tinta">{ROTULO_PENDENCIA[p.tipo]}</b>
                  <span className="text-xs text-suave">{p.mensagem}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

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
  // Perda por erva: kg de ervas diferentes não se somam, então é um cartão por erva
  const perdas = Object.entries(kpis.kg_perdido ?? {}).filter(([, kg]) => kg > 0);
  const temOferta = Object.keys(kpis.kg_perdido ?? {}).length > 0;

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
  const cobertas = resultado.necessidades.filter((n) => situacao(n) === 'coberta').length;
  const totalDemandas = resultado.necessidades.length;
  const atrasos = resultado.necessidades.filter((n) => situacao(n) === 'atraso').length;

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

  const colunasNecessidade: Coluna<Necessidade>[] = [
    { titulo: 'Demanda', valor: (n) => `#${n.demanda_id}`, texto: (n) => `#${n.demanda_id}`, ordenar: (n) => Number(n.demanda_id) || n.demanda_id },
    { titulo: 'Erva', valor: (n) => n.erva, texto: (n) => n.erva, filtro: 'opcoes' },
    {
      titulo: 'Meta',
      valor: (n) => `${formatarKg(n.kg_meta)} (${ROTULO_ESTAGIO[n.estagio_meta].toLowerCase()})`,
      ordenar: (n) => n.kg_meta,
    },
    { titulo: 'Fresco necessário', valor: (n) => formatarKg(n.kg_fresco), ordenar: (n) => n.kg_fresco, alinhar: 'direita' },
    { titulo: 'Prazo', valor: (n) => formatarData(n.prazo), texto: (n) => formatarData(n.prazo), ordenar: (n) => n.prazo },
    {
      titulo: 'Coberto no plano',
      valor: (n) => formatarKg(coberto[n.demanda_id] ?? 0),
      ordenar: (n) => coberto[n.demanda_id] ?? 0,
      alinhar: 'direita',
    },
    {
      titulo: 'Falta',
      valor: (n) => {
        const f = falta(n.demanda_id, n.kg_fresco);
        return f < FOLGA_KG ? '—' : <span className="font-semibold text-red-700">{formatarKg(f)}</span>;
      },
      ordenar: (n) => falta(n.demanda_id, n.kg_fresco),
      alinhar: 'direita',
    },
    {
      titulo: 'Situação',
      valor: (n) => <Etiqueta cor={SITUACAO[situacao(n)].cor}>{SITUACAO[situacao(n)].rotulo}</Etiqueta>,
      texto: (n) => SITUACAO[situacao(n)].rotulo,
      filtro: 'opcoes',
    },
  ];

  const colunasAlocacao: Coluna<Alocacao & { indice: number }>[] = [
    { titulo: 'Dia', valor: (a) => formatarData(a.dia), texto: (a) => formatarData(a.dia), ordenar: (a) => a.dia },
    { titulo: 'Secador', valor: (a) => a.secador, texto: (a) => a.secador, filtro: 'opcoes' },
    { titulo: 'Erva', valor: (a) => a.erva, texto: (a) => a.erva, filtro: 'opcoes' },
    { titulo: 'Kg fresco', valor: (a) => formatarKg(a.kg_fresco), ordenar: (a) => a.kg_fresco, alinhar: 'direita' },
    { titulo: 'Secagem', valor: (a) => formatarHoras(a.horas_secagem), ordenar: (a) => a.horas_secagem, alinhar: 'direita' },
    { titulo: 'Setup', valor: (a) => formatarHoras(a.horas_setup), ordenar: (a) => a.horas_setup, alinhar: 'direita' },
    { titulo: 'Lote', valor: (a) => `#${a.lote_id}`, texto: (a) => `#${a.lote_id}` },
    {
      titulo: 'Demanda',
      valor: (a) => (a.demanda_id ? `#${a.demanda_id}` : 'sem demanda'),
      texto: (a) => (a.demanda_id ? `#${a.demanda_id}` : 'sem demanda'),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {resultado.viavel ? (
          <Etiqueta cor="verde">Viável</Etiqueta>
        ) : (
          <Etiqueta cor="vermelho">Com pendências</Etiqueta>
        )}
        <span className="text-sm text-suave">
          {formatarData(resultado.inicio)} a {formatarData(resultado.fim)}
        </span>
        <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
          {resultado.alocacoes.length > 0 && (
            <Button variant="secondary" icone={Download} onClick={exportarCronograma} className="flex-1 sm:flex-none">
              Baixar cronograma (Excel)
            </Button>
          )}
          {resultado.necessidades.length > 0 && (
            <Button variant="secondary" icone={Download} onClick={exportarNecessidades} className="flex-1 sm:flex-none">
              Baixar necessidades (Excel)
            </Button>
          )}
        </div>
      </div>

      {resultado.avisos.map((aviso) => <Alerta key={aviso} tipo="aviso">{aviso}</Alerta>)}

      {/* Plano vazio é "viável" e sem pendências, mas não programa nada: deixar isso explícito */}
      {resultado.alocacoes.length === 0 && resultado.pendencias.length === 0 && (
        <Alerta tipo="aviso">
          Nada a secar de {formatarData(resultado.inicio)} a {formatarData(resultado.fim)}: nenhuma previsão de erva
          fresca chega nesse período e nenhuma demanda pede secagem nele. Confira a Entrada de Previsões ou escolha
          outro período.
        </Alerta>
      )}

      {(Object.keys(ocupacao).length > 0 || totalDemandas > 0 || temOferta) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
          {totalDemandas > 0 && (
            <KpiCard
              titulo="Demandas cobertas"
              icone={Target}
              valor={cobertas}
              unidade={`de ${totalDemandas}`}
              progresso={(100 * cobertas) / totalDemandas}
              tom={atrasos ? 'atencao' : 'bom'}
              extra={atrasos ? <Etiqueta cor="vermelho">{atrasos} em atraso</Etiqueta> : <Etiqueta cor="verde">no prazo</Etiqueta>}
              detalhe={
                aCobrirDepois.length
                  ? 'Há demanda que vence depois do horizonte'
                  : 'Demandas com prazo no horizonte do plano'
              }
            />
          )}
          {perdas.map(([erva, kg]) => (
            <KpiCard
              key={`perda-${erva}`}
              titulo={`Perda ${erva}`}
              icone={CircleX}
              valor={formatarKg(kg)}
              progresso={kpis.perda_pct?.[erva] ?? null}
              tom="critico"
              extra={<Etiqueta cor="vermelho">{formatarPct(kpis.perda_pct?.[erva] ?? null)} da oferta</Etiqueta>}
              detalhe="Erva fresca que vence sem secador no horizonte"
            />
          ))}
          {temOferta && perdas.length === 0 && (
            <KpiCard
              titulo="Perda de erva fresca"
              icone={CircleCheck}
              valor="0 kg"
              tom="bom"
              detalhe="Toda a oferta que vence no horizonte encontra secador"
            />
          )}
        </div>
      )}

      {aCobrirDepois.length > 0 && (
        <Alerta tipo="aviso">
          Demandas que vencem depois de {formatarData(resultado.fim)} já recebem a secagem deste plano. Ainda faltam{' '}
          {aCobrirDepois.map(([erva, kg]) => `${formatarKg(kg)} de ${erva}`).join(', ')} (erva fresca) para elas, a
          cobrir no próximo plano.
        </Alerta>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="min-w-0 xl:col-span-2">
          <CabecalhoCard
            icone={CalendarRange}
            titulo="Programação da secagem"
            descricao="Cada bloco é uma erva no secador naquele dia."
          />
          <Cronograma alocacoes={resultado.alocacoes} />
        </Card>
        <Pendencias resultado={resultado} />
      </div>

      {resultado.necessidades.length > 0 && (
        <Card>
          <CabecalhoCard
            icone={Sprout}
            titulo="Necessidade de erva fresca"
            descricao="Demanda convertida para kg de fresco pelo rendimento (cálculo reverso)."
          />
          <Tabela
            rotulo="Necessidade de erva fresca (cálculo reverso)"
            colunas={colunasNecessidade}
            linhas={resultado.necessidades}
            chave={(n) => n.demanda_id}
            classeLinha={(n) => (situacao(n) === 'atraso' ? 'bg-red-50/40' : '')}
          />
          <Legenda
            itens={[
              { amostra: 'bg-verde-600', rotulo: 'Coberta', descricao: 'o plano seca todo o fresco necessário até o prazo' },
              { amostra: 'bg-red-600', rotulo: 'Atraso', descricao: 'prazo dentro do plano e falta fresco seco' },
              { amostra: 'bg-blue-600', rotulo: 'Continua no próximo plano', descricao: 'prazo depois do fim; o próximo plano completa' },
            ]}
          />
        </Card>
      )}

      {resultado.alocacoes.length > 0 && (
        <details className="group rounded-xl border border-borda bg-white p-4 shadow-suave sm:p-5">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-tinta">
            <ListTree aria-hidden="true" className="size-4 text-verde-700" />
            Detalhe das alocações
            <span className="text-xs font-normal text-suave">({resultado.alocacoes.length} linhas, por lote e demanda)</span>
          </summary>
          <div className="mt-4">
            <Tabela
              colunas={colunasAlocacao}
              linhas={resultado.alocacoes.map((a, indice) => ({ ...a, indice }))}
              chave={(a) => a.indice}
            />
          </div>
        </details>
      )}
    </div>
  );
}
