import {
  CalendarCheck,
  CalendarClock,
  CalendarRange,
  CircleCheck,
  CircleSlash,
  Clock,
  Gauge,
  PackageX,
  ShieldCheck,
  TriangleAlert,
  Truck,
} from 'lucide-react';
import { ReactNode } from 'react';

import { query } from '../api';
import { ROTULO_ESTAGIO, ROTULO_ORIGEM, ROTULO_PENDENCIA, formatarData, formatarHoras, formatarKg, formatarPct, hojeIso } from '../formatar';
import { useApi } from '../hooks';
import { ConfiabilidadeOrigem, confiabilidadePorOrigem, naoChegaram } from '../indicadores';
import { useSessao } from '../sessao';
import { Bloqueio, Cronograma as CronogramaT, Demanda, PlanoDetalhe, PlanoResumo } from '../tipos';
import { Cronograma } from './ResultadoPlano';
import {
  Barra,
  CabecalhoCard,
  Card,
  Coluna,
  Etiqueta,
  KpiCard,
  Legenda,
  PageHeader,
  SkeletonTabela,
  TEXTO_TOM,
  Tabela,
  tomPorFaixa,
} from './ui';

const SEMANA = 7;
const JANELA_DIAS = 30;

/** Percentual com mini barra colorida pela faixa. */
function PctComBarra({ pct }: { pct: number | null }) {
  const tom = tomPorFaixa(pct);
  return (
    <div className="flex min-w-28 items-center gap-2">
      <div className="flex-1">
        <Barra valor={pct} tom={tom} />
      </div>
      <span className={`w-12 text-right font-semibold ${TEXTO_TOM[tom]}`}>{formatarPct(pct)}</span>
    </div>
  );
}

/** Item da lista "Precisa de atenção". */
function Atencao({ icone: Icone, cor, titulo, texto }: { icone: typeof Clock; cor: string; titulo: string; texto: ReactNode }) {
  return (
    <li className="flex gap-3 rounded-lg border border-borda p-3 transition-colors hover:bg-fundo animate-entra">
      <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${cor}`}>
        <Icone aria-hidden="true" className="size-4" />
      </span>
      <div className="min-w-0 text-sm">
        <b className="block text-[13px] text-tinta">{titulo}</b>
        <span className="text-xs text-suave">{texto}</span>
      </div>
    </li>
  );
}

export default function DashboardPCP() {
  const { pode } = useSessao();
  const hoje = hojeIso();
  const fimSemana = hojeIso(SEMANA - 1);
  const passado = hojeIso(-JANELA_DIAS);

  const vePlanos = pode('plano.consultar', 'plano.simular', 'plano.aprovar');
  const veCronograma = vePlanos || pode('recebimento.consultar', 'recebimento.registrar');

  // Só busca o que o perfil pode ver (null = não busca), para não gerar 403
  const vigentes = useApi<PlanoResumo[]>(vePlanos ? `/planos${query({ status: 'aprovado', dia: hoje })}` : null);
  const vigente = vigentes.dados?.[0];
  const plano = useApi<PlanoDetalhe>(vigente ? `/planos/${vigente.id}` : null);
  const demandas = useApi<Demanda[]>(
    pode('demanda.consultar') ? `/demandas${query({ prazo_de: hoje, prazo_ate: hojeIso(JANELA_DIAS) })}` : null
  );
  // Próximos 7 dias: programação aprovada e chegadas previstas
  const semana = useApi<CronogramaT>(veCronograma ? `/cronograma${query({ de: hoje, ate: fimSemana })}` : null);
  // Últimos 30 dias: base da confiabilidade das fontes
  const historico = useApi<CronogramaT>(veCronograma ? `/cronograma${query({ de: passado, ate: hoje })}` : null);
  const bloqueios = useApi<Bloqueio[]>(vePlanos ? '/bloqueios' : null);

  const confiabilidade = historico.dados
    ? confiabilidadePorOrigem(historico.dados.chegadas, passado, historico.dados.hoje)
    : [];
  const faltando = historico.dados ? naoChegaram(historico.dados.chegadas) : [];
  const chegadasSemana = semana.dados?.chegadas.filter((c) => c.previsao_id !== null) ?? [];
  const bloqueiosSemana = (bloqueios.dados ?? []).filter((b) => b.inicio <= fimSemana && b.fim >= hoje);
  const pendencias = plano.dados?.pendencias ?? [];
  const ocupacao = Object.entries(plano.dados?.kpis.ocupacao_planejada_pct ?? {});
  const demandasSemana = (demandas.dados ?? []).filter((d) => d.prazo <= fimSemana).length;

  const atencao = pendencias.length + faltando.length + bloqueiosSemana.length;

  const colunasConfiabilidade: Coluna<ConfiabilidadeOrigem>[] = [
    { titulo: 'Origem', valor: (c) => <span className="font-semibold text-tinta">{ROTULO_ORIGEM[c.origem]}</span>, texto: (c) => ROTULO_ORIGEM[c.origem] },
    { titulo: 'Erva', valor: (c) => c.erva, texto: (c) => c.erva, filtro: 'opcoes' },
    { titulo: 'Previsões', valor: (c) => c.previsoes, ordenar: (c) => c.previsoes, alinhar: 'direita' },
    { titulo: 'Previsto', valor: (c) => formatarKg(c.kgPrevisto), ordenar: (c) => c.kgPrevisto, alinhar: 'direita' },
    { titulo: 'Recebido', valor: (c) => formatarKg(c.kgRecebido), ordenar: (c) => c.kgRecebido, alinhar: 'direita' },
    { titulo: 'Aderência', valor: (c) => <PctComBarra pct={c.aderenciaPct} />, ordenar: (c) => c.aderenciaPct ?? -1 },
    { titulo: 'Pontualidade', valor: (c) => <PctComBarra pct={c.pontualidadePct} />, ordenar: (c) => c.pontualidadePct ?? -1 },
  ];

  const colunasDemandas: Coluna<Demanda>[] = [
    { titulo: 'Demanda', valor: (d) => <span className="font-semibold text-tinta">#{d.id}</span>, ordenar: (d) => d.id },
    { titulo: 'Erva', valor: (d) => d.erva.nome, texto: (d) => d.erva.nome, filtro: 'opcoes' },
    {
      titulo: 'Meta',
      valor: (d) => `${formatarKg(d.kg)} (${ROTULO_ESTAGIO[d.estagio].toLowerCase()})`,
      ordenar: (d) => Number(d.kg),
    },
    {
      titulo: 'Prazo',
      valor: (d) => (
        <span className="flex items-center gap-2">
          {formatarData(d.prazo)}
          {d.prazo <= fimSemana && <Etiqueta cor="amarelo">esta semana</Etiqueta>}
        </span>
      ),
      ordenar: (d) => d.prazo,
    },
    { titulo: 'Prioridade', valor: (d) => d.prioridade, ordenar: (d) => d.prioridade, alinhar: 'direita' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        secao="Visão geral"
        titulo="Dashboard PCP"
        ajuda={[
          'Comece pelos quatro números do topo: plano em vigor, pendências, chegadas da semana e demandas do mês.',
          '"Secagem dos próximos 7 dias" mostra o que os planos aprovados mandam secar; clique em "Abrir cronograma" para ver mais dias.',
          '"Precisa de atenção" junta o que pede ação: pendências do plano, erva que não chegou e secador parado.',
          '"Confiabilidade das fontes" compara o previsto com o recebido nos últimos 30 dias: use para planejar com folga as fontes abaixo de 70%.',
        ]}
        descricao="O plano em vigor hoje, a secagem dos próximos 7 dias e o que precisa de atenção."
      />

      {/* 1. Situação de hoje */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          titulo="Plano em vigor"
          icone={CalendarCheck}
          valor={vigente ? `v${vigente.versao}` : '—'}
          tom={vigente ? 'bom' : 'neutro'}
          detalhe={
            vigente
              ? `${formatarData(vigente.inicio)} a ${formatarData(vigente.fim)}${vigente.aprovado_por ? ` · aprovado por ${vigente.aprovado_por.nome}` : ''}`
              : 'Nenhum plano aprovado cobre hoje.'
          }
        />
        <KpiCard
          titulo="Pendências do plano"
          icone={TriangleAlert}
          valor={vigente ? pendencias.length : '—'}
          tom={pendencias.length ? 'critico' : vigente ? 'bom' : 'neutro'}
          extra={pendencias.length ? <Etiqueta cor="vermelho">atenção</Etiqueta> : undefined}
          detalhe={vigente ? (pendencias.length ? 'Itens que o plano não consegue atender' : 'Plano sem conflitos') : undefined}
        />
        <KpiCard
          titulo="Chegadas em 7 dias"
          icone={Truck}
          valor={semana.dados ? chegadasSemana.length : '—'}
          detalhe={faltando.length ? `${faltando.length} chegada(s) atrasada(s) nos últimos 30 dias` : 'Lotes de erva fresca previstos'}
          extra={faltando.length ? <Etiqueta cor="vermelho">{faltando.length} atrasada(s)</Etiqueta> : undefined}
        />
        <KpiCard
          titulo="Demandas em 30 dias"
          icone={CalendarClock}
          valor={demandas.dados ? demandas.dados.length : '—'}
          tom={demandasSemana ? 'atencao' : 'marca'}
          detalhe={demandas.dados ? `${demandasSemana} com prazo nesta semana` : undefined}
        />
      </div>

      {/* 2. Próximos 7 dias + o que pede ação */}
      {veCronograma && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card className="min-w-0 xl:col-span-2">
            <CabecalhoCard
              icone={CalendarRange}
              titulo="Secagem dos próximos 7 dias"
              descricao="O que os planos aprovados mandam secar, por secador e dia."
              acoes={<a href="/cronograma" className="text-xs font-semibold text-verde-700 hover:underline">Abrir cronograma</a>}
            />
            {!semana.dados ? (
              <SkeletonTabela linhas={3} />
            ) : semana.dados.alocacoes.length ? (
              <Cronograma alocacoes={semana.dados.alocacoes} />
            ) : (
              <p className="rounded-lg border border-dashed border-borda bg-fundo px-4 py-8 text-center text-sm text-suave">
                Nenhuma secagem aprovada para os próximos 7 dias.{' '}
                <a href="/planos" className="font-semibold text-verde-700 hover:underline">Simular um plano</a>
              </p>
            )}
          </Card>

          <Card>
            <CabecalhoCard
              titulo={
                <>
                  Precisa de atenção
                  <Etiqueta cor={atencao ? 'vermelho' : 'verde'}>{atencao}</Etiqueta>
                </>
              }
              descricao="Pendências do plano, chegadas atrasadas e secadores parados."
            />
            {atencao === 0 ? (
              <div className="flex items-center gap-3 rounded-lg bg-verde-50 p-3 text-sm text-verde-700">
                <CircleCheck aria-hidden="true" className="size-5 shrink-0" />
                Nada pendente agora.
              </div>
            ) : (
              <ul className="max-h-[26rem] space-y-2 overflow-y-auto pr-1">
                {pendencias.slice(0, 5).map((p, i) => (
                  <Atencao key={`p${i}`} icone={TriangleAlert} cor="bg-red-100 text-red-700" titulo={ROTULO_PENDENCIA[p.tipo]} texto={p.mensagem} />
                ))}
                {pendencias.length > 5 && (
                  <li className="text-xs text-suave">
                    … e mais {pendencias.length - 5}. <a href="/planos" className="font-semibold text-verde-700 hover:underline">Ver no plano</a>
                  </li>
                )}
                {faltando.slice(0, 5).map((c) => (
                  <Atencao
                    key={`c${c.previsao_id}`}
                    icone={PackageX}
                    cor="bg-amber-100 text-amber-700"
                    titulo={`Não chegou: ${c.erva.nome}`}
                    texto={`Previsão #${c.previsao_id} · ${ROTULO_ORIGEM[c.origem]} · ${formatarKg(c.kg_previsto!)} para ${formatarData(c.data_prevista!)}`}
                  />
                ))}
                {bloqueiosSemana.map((b) => (
                  <Atencao
                    key={`b${b.id}`}
                    icone={CircleSlash}
                    cor="bg-fundo text-suave"
                    titulo={`${b.secador.codigo} bloqueado`}
                    texto={`${formatarData(b.inicio)} a ${formatarData(b.fim)} · ${b.motivo}`}
                  />
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {/* 3. Ocupação dos secadores no plano em vigor */}
      {ocupacao.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-tinta">
            <Gauge aria-hidden="true" className="size-4 text-verde-700" />
            Ocupação dos secadores no plano em vigor
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ocupacao.map(([secador, pct]) => (
              <KpiCard
                key={secador}
                titulo={secador}
                valor={formatarPct(pct)}
                progresso={pct}
                detalhe={`${formatarHoras(plano.dados?.kpis.horas_ocupadas?.[secador] ?? 0)} de ${formatarHoras(plano.dados?.kpis.horas_disponiveis?.[secador] ?? 0)} disponíveis`}
              />
            ))}
          </div>
        </section>
      )}

      {/* 4. Fontes e demandas */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {historico.dados && (
          <Card className="min-w-0">
            <CabecalhoCard
              icone={ShieldCheck}
              titulo="Confiabilidade das fontes"
              descricao={`Previsões com data nos últimos ${JANELA_DIAS} dias: quanto chegou e se chegou no dia.`}
            />
            <Tabela
              rotulo="Confiabilidade das fontes"
              colunas={colunasConfiabilidade}
              linhas={confiabilidade}
              chave={(c) => `${c.origem}|${c.erva}`}
              filtravel={false}
              vazio="Nenhuma previsão vencida no período."
            />
            <Legenda
              itens={[
                { amostra: 'bg-verde-600', rotulo: '90% ou mais', descricao: 'fonte confiável' },
                { amostra: 'bg-amber-500', rotulo: '70% a 90%', descricao: 'acompanhar' },
                { amostra: 'bg-red-600', rotulo: 'Abaixo de 70%', descricao: 'planejar com folga' },
                { amostra: 'bg-cinza', rotulo: 'n/a', descricao: 'sem previsão vencida para comparar' },
                { amostra: 'bg-verde-700', rotulo: 'Aderência', descricao: 'kg recebidos ÷ kg previstos' },
                { amostra: 'bg-verde-700', rotulo: 'Pontualidade', descricao: 'chegou até a data prevista' },
              ]}
            />
          </Card>
        )}

        {demandas.dados && (
          <Card className="min-w-0">
            <CabecalhoCard
              icone={CalendarClock}
              titulo="Próximas demandas"
              descricao={`Metas com prazo nos próximos ${JANELA_DIAS} dias, da mais próxima à mais distante.`}
              acoes={<a href="/demandas" className="text-xs font-semibold text-verde-700 hover:underline">Ver todas</a>}
            />
            <Tabela
              rotulo="Próximas demandas"
              colunas={colunasDemandas}
              linhas={[...demandas.dados].sort((a, b) => a.prazo.localeCompare(b.prazo)).slice(0, 8)}
              chave={(d) => d.id}
              filtravel={false}
              vazio={`Nenhuma demanda com prazo nos próximos ${JANELA_DIAS} dias.`}
            />
          </Card>
        )}
      </div>
    </div>
  );
}
