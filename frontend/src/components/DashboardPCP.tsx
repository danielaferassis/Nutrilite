import { query } from '../api';
import { ROTULO_ORIGEM, formatarData, formatarKg, formatarPct, hojeIso } from '../formatar';
import { useApi } from '../hooks';
import { confiabilidadePorOrigem, naoChegaram } from '../indicadores';
import { useSessao } from '../sessao';
import { Cronograma, Demanda, PlanoDetalhe, PlanoResumo, Previsao } from '../tipos';
import ItemList from './ItemList';
import { Card, Etiqueta, KpiCard, PageHeader } from './ui';

const JANELA_DIAS = 30;

export default function DashboardPCP() {
  const { pode } = useSessao();
  const hoje = hojeIso();
  const ate = hojeIso(JANELA_DIAS);

  // Só busca o que o perfil pode ver (null = não busca), para não gerar 403
  const vigentes = useApi<PlanoResumo[]>(
    pode('plano.consultar', 'plano.simular', 'plano.aprovar') ? `/planos${query({ status: 'aprovado', dia: hoje })}` : null
  );
  const vigente = vigentes.dados?.[0];
  const plano = useApi<PlanoDetalhe>(vigente ? `/planos/${vigente.id}` : null);
  const demandas = useApi<Demanda[]>(
    pode('demanda.consultar') ? `/demandas${query({ prazo_de: hoje, prazo_ate: ate })}` : null
  );
  const previsoes = useApi<Previsao[]>(
    pode('previsao.consultar', 'previsao.gerenciar', 'previsao.propria')
      ? `/previsoes${query({ chegada_de: hoje, chegada_ate: ate })}`
      : null
  );

  // Últimos 30 dias de chegadas: base dos indicadores de confiabilidade das fontes
  const passado = hojeIso(-JANELA_DIAS);
  const chegadas = useApi<Cronograma>(
    pode('plano.consultar', 'plano.simular', 'plano.aprovar', 'recebimento.consultar', 'recebimento.registrar')
      ? `/cronograma${query({ de: passado, ate: hoje })}`
      : null
  );
  const confiabilidade = chegadas.dados
    ? confiabilidadePorOrigem(chegadas.dados.chegadas, passado, chegadas.dados.hoje)
    : [];
  const faltando = chegadas.dados ? naoChegaram(chegadas.dados.chegadas) : [];

  const ocupacao = Object.entries(plano.dados?.kpis.ocupacao_planejada_pct ?? {});
  const pendencias = plano.dados?.pendencias.length;

  return (
    <div className="space-y-6">
      <PageHeader
        secao="Visão geral"
        titulo="Dashboard PCP"
        descricao={`O plano em vigor hoje, o que vem nos próximos ${JANELA_DIAS} dias e como as fontes vêm entregando.`}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          titulo="Plano vigente"
          valor={vigente ? `v${vigente.versao}` : '—'}
          detalhe={vigente ? `${formatarData(vigente.inicio)} a ${formatarData(vigente.fim)}` : 'Nenhum plano aprovado cobre hoje.'}
        />
        <KpiCard
          titulo={`Demandas (próx. ${JANELA_DIAS} dias)`}
          valor={demandas.dados?.length ?? '—'}
        />
        <KpiCard
          titulo={`Previsões (próx. ${JANELA_DIAS} dias)`}
          valor={previsoes.dados?.length ?? '—'}
        />
        <KpiCard
          titulo="Pendências do plano vigente"
          valor={<span className={pendencias ? 'text-red-700' : undefined}>{pendencias ?? '—'}</span>}
          extra={pendencias ? <Etiqueta cor="vermelho">atenção</Etiqueta> : undefined}
        />
      </div>

      {chegadas.dados && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <h2 className="text-lg font-semibold mb-1">Confiabilidade das fontes</h2>
            <p className="text-xs text-suave mb-3">
              Previsões com data nos últimos {JANELA_DIAS} dias. Aderência = recebido ÷ previsto; pontualidade =
              chegou até a data prevista.
            </p>
            <ItemList
              colunas={['Origem', 'Previsões', 'Previsto', 'Recebido', 'Aderência', 'Pontualidade']}
              dados={confiabilidade.map((c) => ({
                origem: ROTULO_ORIGEM[c.origem],
                previsoes: c.previsoes,
                previsto: formatarKg(c.kgPrevisto),
                recebido: formatarKg(c.kgRecebido),
                aderencia: formatarPct(c.aderenciaPct),
                pontualidade: formatarPct(c.pontualidadePct),
              }))}
              vazio="Nenhuma previsão vencida no período."
            />
          </Card>
          <Card className={faltando.length ? 'border-red-200' : ''}>
            <h2 className={`text-lg font-semibold mb-3 ${faltando.length ? 'text-red-800' : ''}`}>
              Chegadas que não vieram ({faltando.length})
            </h2>
            <ItemList
              colunas={['Previsão', 'Erva', 'Origem', 'Prevista para', 'Previsto']}
              dados={faltando.map((c) => ({
                previsao: `#${c.previsao_id}`,
                erva: c.erva.nome,
                origem: ROTULO_ORIGEM[c.origem],
                data: formatarData(c.data_prevista!),
                kg: formatarKg(c.kg_previsto!),
              }))}
              vazio="Todas as previsões vencidas chegaram."
            />
          </Card>
        </div>
      )}

      {ocupacao.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Ocupação planejada no plano vigente</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {ocupacao.map(([secador, pct]) => (
              <KpiCard key={secador} titulo={secador} valor={formatarPct(pct)} progresso={pct} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
