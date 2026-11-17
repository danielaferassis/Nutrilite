import {
  CalendarDays,
  CalendarRange,
  CircleAlert,
  Download,
  GanttChart,
  PackageCheck,
  PackageOpen,
  Plus,
  Save,
  Truck,
} from 'lucide-react';
import { FormEvent, useState } from 'react';

import { apiFetch, query } from '../api';
import { camposAlterados } from '../edicao';
import { baixarCsv, dataCsv, gerarCsv, numeroCsv } from '../exportar';
import { useFeedback } from '../feedback';
import {
  ROTULO_ORIGEM,
  ROTULO_SITUACAO,
  ROTULO_STATUS,
  formatarData,
  formatarDataHora,
  formatarKg,
  hojeIso,
} from '../formatar';
import { useApi } from '../hooks';
import { logger } from '../logger';
import { useSessao } from '../sessao';
import {
  Chegada,
  Cronograma as CronogramaT,
  Erva,
  PlanoResumo,
  Recebimento,
  SituacaoChegada,
  TrechoVigente,
} from '../tipos';
import CalendarioCronograma from './CalendarioCronograma';
import { Cronograma } from './ResultadoPlano';
import {
  Alerta,
  Button,
  CabecalhoCard,
  Card,
  Coluna,
  Etiqueta,
  EtiquetaCor,
  Input,
  Janela,
  KpiCard,
  Legenda,
  PageHeader,
  Select,
  SkeletonTabela,
  Tabela,
} from './ui';

const COR_SITUACAO: Record<SituacaoChegada, EtiquetaCor> = {
  recebida: 'verde',
  aguardando: 'cinza',
  atrasada: 'vermelho',
  nao_prevista: 'azul',
};

// Atalhos de período (dias a partir de hoje)
const PERIODOS = [
  { rotulo: 'Próximos 7 dias', de: 0, ate: 6 },
  { rotulo: 'Próximos 14 dias', de: -1, ate: 13 },
  { rotulo: 'Últimos 30 dias', de: -30, ate: 0 },
];

// Dias entre duas datas ISO, sem passar pelo fuso do navegador
const diasEntre = (de: string, ate: string) =>
  (Date.UTC(+ate.slice(0, 4), +ate.slice(5, 7) - 1, +ate.slice(8, 10)) -
    Date.UTC(+de.slice(0, 4), +de.slice(5, 7) - 1, +de.slice(8, 10))) / 86_400_000;

/**
 * Planos aprovados (e substituídos) que tocam o período, em lista: período do
 * plano, a situação e os dias em que ele vale de fato. Quem aprovou e quando.
 */
function PlanosNoPeriodo({
  planos,
  vigencia,
  de,
  ate,
}: {
  planos: PlanoResumo[];
  vigencia: TrechoVigente[];
  de: string;
  ate: string;
}) {
  // Dias de um intervalo dentro do período
  const dias = (inicio: string, fim: string) => {
    const i = inicio < de ? de : inicio;
    const f = fim > ate ? ate : fim;
    return diasEntre(i, f) + 1;
  };
  if (planos.length === 0) {
    return <p className="text-sm text-suave">Nenhum plano aprovado no período.</p>;
  }
  return (
    <ul className="divide-y divide-borda">
      {planos.map((p) => {
        const aprovado = p.status === 'aprovado';
        const trechos = vigencia.filter((t) => t.plano_id === p.id);
        // Aprovado que um mais novo já assumiu em parte dos dias (dentro do período)
        const diasVigentes = trechos.reduce((soma, t) => soma + dias(t.inicio, t.fim), 0);
        const emParte = aprovado && diasVigentes < dias(p.inicio, p.fim);
        return (
          <li key={p.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <span className="rounded-md bg-verde-100 px-2 py-0.5 text-xs font-bold text-verde-700">v{p.versao}</span>
              <span className={`font-semibold ${aprovado ? 'text-tinta' : 'text-suave line-through'}`}>
                {formatarData(p.inicio)} a {formatarData(p.fim)}
              </span>
              <Etiqueta cor={!aprovado ? 'amarelo' : emParte ? 'azul' : 'verde'}>
                {emParte ? 'Aprovado (em parte)' : ROTULO_STATUS[p.status]}
              </Etiqueta>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-suave">
              {aprovado && trechos.length > 0 && <span>vale</span>}
              {trechos.map((t) => (
                <span
                  key={t.inicio}
                  data-testid={`vigente-v${p.versao}`}
                  className="rounded-full bg-verde-700 px-2 py-0.5 font-semibold text-white"
                >
                  {formatarData(t.inicio)} a {formatarData(t.fim)}
                </span>
              ))}
              {p.aprovado_por && (
                <span>
                  · aprovado por {p.aprovado_por.nome} em {formatarDataHora(p.aprovado_em!)}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

interface FormRecebimento {
  /** Recebimento em correção; null = registro de chegada nova. */
  corrigindo: Recebimento | null;
  previsao_id: number | null;
  erva_id: string;
  origem: string;
  data_recebimento: string;
  kg_fresco: string;
  observacao: string;
}

type LinhaChegada = Chegada & { chave: string };

export default function CronogramaRecebimentos() {
  const { pode } = useSessao();
  const podeRegistrar = pode('recebimento.registrar');

  const [periodo, setPeriodo] = useState({ de: hojeIso(-1), ate: hojeIso(13) });
  const cronograma = useApi<CronogramaT>(`/cronograma${query(periodo)}`);
  const ervas = useApi<Erva[]>(podeRegistrar ? '/ervas' : null);

  const [form, setForm] = useState<FormRecebimento | null>(null);
  const [visao, setVisao] = useState<'calendario' | 'secador'>('calendario');

  // Período sem secagem: oferece pular para o próximo plano aprovado
  const vePlanos = pode('plano.consultar', 'plano.simular', 'plano.aprovar');
  const aprovados = useApi<PlanoResumo[]>(vePlanos ? `/planos${query({ status: 'aprovado' })}` : null);
  const proximo = (aprovados.dados ?? [])
    .filter((p) => p.fim >= hojeIso() && (p.inicio > periodo.ate || p.fim < periodo.de))
    .sort((a, b) => a.inicio.localeCompare(b.inicio))[0];
  const [salvando, setSalvando] = useState(false);
  const feedback = useFeedback();

  const abrirForm = (previsao_id: number | null) =>
    setForm({
      corrigindo: null,
      previsao_id,
      erva_id: '',
      origem: '',
      // Só conveniência do formulário: o usuário confirma a data antes de salvar
      data_recebimento: cronograma.dados?.hoje ?? hojeIso(),
      kg_fresco: '',
      observacao: '',
    });

  // Só data, kg e observação: vínculo, erva e origem do recebimento não mudam
  const corrigir = (r: Recebimento) =>
    setForm({
      corrigindo: r,
      previsao_id: r.previsao_id,
      erva_id: String(r.erva.id),
      origem: r.origem,
      data_recebimento: r.data_recebimento,
      kg_fresco: r.kg_fresco,
      observacao: r.observacao ?? '',
    });

  const salvarCorrecao = async (form: FormRecebimento, r: Recebimento) => {
    const corrigido = {
      data_recebimento: form.data_recebimento,
      kg_fresco: form.kg_fresco,
      observacao: form.observacao.trim() || null,
    };
    const original = { data_recebimento: r.data_recebimento, kg_fresco: r.kg_fresco, observacao: r.observacao };
    await apiFetch(`/recebimentos/${r.id}`, {
      method: 'PATCH',
      body: JSON.stringify(camposAlterados(corrigido, original)),
    });
    logger.info(`Recebimento ${r.id} corrigido`);
    setForm(null);
    cronograma.recarregar();
    feedback.sucesso(
      'Recebimento corrigido',
      `${formatarKg(form.kg_fresco)} de ${r.erva.nome} recebidos em ${formatarData(form.data_recebimento)}.`
    );
  };

  const registrar = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSalvando(true);
    try {
      if (form.corrigindo) {
        await salvarCorrecao(form, form.corrigindo);
        return;
      }
      const naoPrevista = form.previsao_id === null;
      await apiFetch('/recebimentos', {
        method: 'POST',
        body: JSON.stringify({
          previsao_id: form.previsao_id,
          erva_id: naoPrevista ? Number(form.erva_id) : null,
          origem: naoPrevista ? form.origem : null,
          data_recebimento: form.data_recebimento,
          kg_fresco: form.kg_fresco,
          observacao: form.observacao.trim() || null,
        }),
      });
      logger.info('Recebimento registrado');
      setForm(null);
      cronograma.recarregar();
      feedback.sucesso(
        'Recebimento registrado',
        `${formatarKg(form.kg_fresco)} recebidos em ${formatarData(form.data_recebimento)}. O recebido passa a valer no lugar do previsto nas próximas simulações.`
      );
    } catch (err) {
      feedback.erro(
        form.corrigindo ? 'Não foi possível corrigir o recebimento' : 'Não foi possível registrar o recebimento',
        err
      );
    } finally {
      setSalvando(false);
    }
  };

  const desfazer = async (recebimentoId: number) => {
    const ok = await feedback.confirmar({
      titulo: 'Remover recebimento?',
      mensagem: 'A previsão volta a valer na simulação no lugar do que foi registrado.',
      rotuloConfirmar: 'Remover',
      perigo: true,
    });
    if (!ok) return;
    try {
      await apiFetch(`/recebimentos/${recebimentoId}`, { method: 'DELETE' });
      cronograma.recarregar();
      feedback.sucesso('Recebimento removido', 'A previsão original voltou a valer.');
    } catch (err) {
      feedback.erro('Não foi possível remover o recebimento', err);
    }
  };

  const alterar = (campo: keyof FormRecebimento) => (e: { target: { value: string } }) =>
    form && setForm({ ...form, [campo]: e.target.value });

  const dados = cronograma.dados;

  const exportarProgramacao = () =>
    dados &&
    baixarCsv(
      `programacao_${dados.de}_a_${dados.ate}.csv`,
      gerarCsv(dados.alocacoes, [
        { titulo: 'Plano', valor: (a) => `v${a.versao}` },
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

  const exportarChegadas = () =>
    dados &&
    baixarCsv(
      `chegadas_${dados.de}_a_${dados.ate}.csv`,
      gerarCsv(dados.chegadas, [
        { titulo: 'Previsão', valor: (c) => c.previsao_id ?? 'não prevista' },
        { titulo: 'Erva', valor: (c) => c.erva.nome },
        { titulo: 'Origem', valor: (c) => ROTULO_ORIGEM[c.origem] },
        { titulo: 'Prevista para', valor: (c) => dataCsv(c.data_prevista) },
        { titulo: 'Previsto (kg)', valor: (c) => numeroCsv(c.kg_previsto) },
        { titulo: 'Recebido em', valor: (c) => c.recebimentos.map((r) => dataCsv(r.data_recebimento)).join(', ') },
        { titulo: 'Recebido (kg)', valor: (c) => numeroCsv(c.kg_recebido) },
        { titulo: 'Desvio (kg)', valor: (c) => numeroCsv(c.desvio_kg) },
        { titulo: 'Situação', valor: (c) => ROTULO_SITUACAO[c.situacao] },
      ])
    );

  const colunas: Coluna<LinhaChegada>[] = [
    {
      titulo: 'Previsão',
      valor: (c) => (c.previsao_id ? `#${c.previsao_id}` : '—'),
      texto: (c) => (c.previsao_id ? `#${c.previsao_id}` : '—'),
      ordenar: (c) => c.previsao_id ?? 0,
    },
    { titulo: 'Erva', valor: (c) => c.erva.nome, texto: (c) => c.erva.nome, filtro: 'opcoes' },
    { titulo: 'Origem', valor: (c) => ROTULO_ORIGEM[c.origem], texto: (c) => ROTULO_ORIGEM[c.origem], filtro: 'opcoes' },
    {
      titulo: 'Prevista para',
      valor: (c) => (c.data_prevista ? formatarData(c.data_prevista) : '—'),
      texto: (c) => (c.data_prevista ? formatarData(c.data_prevista) : '—'),
      ordenar: (c) => c.data_prevista ?? '',
    },
    {
      titulo: 'Previsto',
      valor: (c) => (c.kg_previsto ? formatarKg(c.kg_previsto) : '—'),
      ordenar: (c) => Number(c.kg_previsto ?? 0),
      alinhar: 'direita',
    },
    {
      titulo: 'Recebido',
      valor: (c) =>
        c.recebimentos.length
          ? c.recebimentos.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-x-2">
                {formatarData(r.data_recebimento)}: {formatarKg(r.kg_fresco)}
                {podeRegistrar && (
                  <>
                    <button className="text-xs font-semibold text-verde-700 hover:underline" onClick={() => corrigir(r)}>
                      corrigir
                    </button>
                    <button className="text-xs font-semibold text-red-600 hover:underline" onClick={() => desfazer(r.id)}>
                      remover
                    </button>
                  </>
                )}
                <span className="block w-full text-xs text-suave">por {r.registrado_por.nome}</span>
              </div>
            ))
          : '—',
      ordenar: (c) => Number(c.kg_recebido),
    },
    {
      titulo: 'Desvio',
      valor: (c) =>
        c.desvio_kg === null ? (
          '—'
        ) : (
          <span className={`font-semibold ${Number(c.desvio_kg) < 0 ? 'text-red-700' : 'text-verde-700'}`}>
            {Number(c.desvio_kg) > 0 ? '+' : ''}
            {formatarKg(c.desvio_kg)}
          </span>
        ),
      ordenar: (c) => Number(c.desvio_kg ?? 0),
      alinhar: 'direita',
    },
    {
      titulo: 'Situação',
      valor: (c) => <Etiqueta cor={COR_SITUACAO[c.situacao]}>{ROTULO_SITUACAO[c.situacao]}</Etiqueta>,
      texto: (c) => ROTULO_SITUACAO[c.situacao],
      filtro: 'opcoes',
    },
  ];

  const contar = (s: SituacaoChegada) => dados?.chegadas.filter((c) => c.situacao === s).length ?? 0;
  const previstas = dados?.chegadas.filter((c) => c.previsao_id !== null).length ?? 0;
  const vigentes = dados?.planos.filter((p) => p.status === 'aprovado').length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        secao="Planejamento"
        titulo="Cronograma e Recebimentos"
        descricao="O que os planos aprovados mandam secar, dia a dia, e o que de fato chegou."
      />

      <Card className="flex flex-col gap-3 py-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {PERIODOS.map((p) => {
            const ativo = periodo.de === hojeIso(p.de) && periodo.ate === hojeIso(p.ate);
            return (
              <button
                key={p.rotulo}
                type="button"
                aria-pressed={ativo}
                onClick={() => setPeriodo({ de: hojeIso(p.de), ate: hojeIso(p.ate) })}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
                  ativo
                    ? 'border-verde-700 bg-verde-700 text-white shadow-suave'
                    : 'border-borda bg-white text-texto hover:border-verde-600 hover:bg-verde-50'
                }`}
              >
                {p.rotulo}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:w-80">
          <Input label="De" type="date" value={periodo.de} onChange={(e) => setPeriodo({ ...periodo, de: e.target.value })} />
          <Input label="Até" type="date" value={periodo.ate} onChange={(e) => setPeriodo({ ...periodo, ate: e.target.value })} />
        </div>
      </Card>

      {cronograma.erro && <Alerta>{cronograma.erro}</Alerta>}
      {!dados && cronograma.carregando && <SkeletonTabela linhas={6} />}

      {dados && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard titulo="Planos em vigor" icone={GanttChart} valor={vigentes} detalhe="aprovados que valem no período" />
            <KpiCard titulo="Chegadas previstas" icone={Truck} valor={previstas} detalhe="lotes de erva fresca no período" />
            <KpiCard
              titulo="Recebidas"
              icone={PackageCheck}
              valor={contar('recebida')}
              unidade={previstas ? `de ${previstas}` : undefined}
              progresso={previstas ? (100 * contar('recebida')) / previstas : null}
              tom="bom"
            />
            <KpiCard
              titulo="Não chegaram"
              icone={CircleAlert}
              valor={contar('atrasada')}
              tom={contar('atrasada') ? 'critico' : 'neutro'}
              detalhe="data prevista passou sem recebimento"
            />
          </div>

          <Card>
            <CabecalhoCard
              icone={CalendarDays}
              titulo="Programação de secagem"
              descricao="Vem dos planos aprovados: o que cada secador seca em cada dia e as chegadas de erva fresca."
              acoes={
                <>
                  <div role="tablist" aria-label="Visualização" className="flex rounded-lg bg-fundo p-0.5">
                    {(
                      [
                        { id: 'calendario', rotulo: 'Calendário', icone: CalendarDays },
                        { id: 'secador', rotulo: 'Por secador', icone: GanttChart },
                      ] as const
                    ).map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        role="tab"
                        aria-selected={visao === v.id}
                        onClick={() => setVisao(v.id)}
                        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-all duration-200 ${
                          visao === v.id ? 'bg-white text-verde-700 shadow-suave' : 'text-suave hover:text-tinta'
                        }`}
                      >
                        <v.icone aria-hidden="true" className="size-3.5" />
                        {v.rotulo}
                      </button>
                    ))}
                  </div>
                  {dados.alocacoes.length > 0 && (
                    <Button variant="secondary" icone={Download} onClick={exportarProgramacao}>Baixar (Excel)</Button>
                  )}
                </>
              }
            />
            {dados.alocacoes.length === 0 && (
              <div className="mb-4 flex flex-col items-center gap-2 rounded-lg border border-dashed border-borda bg-fundo px-4 py-6 text-center text-sm text-suave">
                <PackageOpen aria-hidden="true" className="size-8 text-cinza" />
                <p className="max-w-md">
                  Nenhum plano aprovado manda secar algo neste período. A programação aparece aqui quando um plano é
                  simulado, salvo e aprovado no Plano de Secagem.
                </p>
                {proximo ? (
                  <Button
                    variant="secondary"
                    icone={CalendarRange}
                    onClick={() => setPeriodo({ de: proximo.inicio, ate: proximo.fim })}
                  >
                    Ver o próximo plano aprovado ({formatarData(proximo.inicio)} a {formatarData(proximo.fim)})
                  </Button>
                ) : (
                  <a href="/planos" className="font-semibold text-verde-700 hover:underline">Ir para o Plano de Secagem</a>
                )}
              </div>
            )}
            {visao === 'calendario' ? (
              <CalendarioCronograma dados={dados} />
            ) : (
              dados.alocacoes.length > 0 && <Cronograma alocacoes={dados.alocacoes} />
            )}
          </Card>

          <Card>
            <CabecalhoCard
              icone={CalendarRange}
              titulo="Planos no período"
              descricao="Qual plano aprovado vale em cada dia, quem aprovou e quando."
            />
            <PlanosNoPeriodo planos={dados.planos} vigencia={dados.vigencia} de={dados.de} ate={dados.ate} />
          </Card>

          <Card>
            <CabecalhoCard
              icone={Truck}
              titulo="Chegadas de erva fresca"
              descricao="Previsões do período e o que foi recebido. O recebido substitui o previsto nas próximas simulações."
              acoes={
                <>
                  {dados.chegadas.length > 0 && (
                    <Button variant="secondary" icone={Download} onClick={exportarChegadas}>Baixar (Excel)</Button>
                  )}
                  {podeRegistrar && (
                    <Button variant="secondary" icone={Plus} onClick={() => abrirForm(null)}>Chegada não prevista</Button>
                  )}
                </>
              }
            />
            <Tabela
              rotulo="Chegadas de erva fresca"
              colunas={colunas}
              linhas={dados.chegadas.map((c, i) => ({ ...c, chave: `${c.previsao_id ?? 'np'}-${i}` }))}
              chave={(c) => c.chave}
              vazio="Nenhuma chegada prevista ou registrada no período."
              classeLinha={(c) => (c.situacao === 'atrasada' ? 'bg-red-50/40' : '')}
              acoes={
                podeRegistrar
                  ? (c) =>
                      c.previsao_id ? (
                        <Button variant="secondary" tamanho="sm" icone={PackageCheck} onClick={() => abrirForm(c.previsao_id)}>
                          Registrar chegada
                        </Button>
                      ) : null
                  : undefined
              }
            />
            <Legenda
              itens={[
                { amostra: 'bg-verde-600', rotulo: 'Recebida', descricao: 'chegada registrada' },
                { amostra: 'bg-cinza', rotulo: 'Aguardando', descricao: 'data prevista ainda não chegou' },
                { amostra: 'bg-red-600', rotulo: 'Não chegou', descricao: 'data passou sem recebimento' },
                { amostra: 'bg-blue-600', rotulo: 'Não prevista', descricao: 'chegou sem previsão cadastrada' },
                { amostra: 'bg-red-700', rotulo: 'Desvio negativo', descricao: 'chegou menos do que o previsto' },
              ]}
            />
          </Card>

          {form && (
            <Janela
              titulo={
                form.corrigindo
                  ? `Corrigir recebimento de ${form.corrigindo.erva.nome} (${ROTULO_ORIGEM[form.corrigindo.origem]})`
                  : form.previsao_id
                    ? `Chegada da previsão #${form.previsao_id}`
                    : 'Chegada não prevista'
              }
              descricao="Quanto de erva fresca chegou e quando."
              icone={PackageCheck}
              largura="md"
              aoFechar={() => setForm(null)}
            >
              <form onSubmit={registrar} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {form.previsao_id === null && !form.corrigindo && (
                  <>
                    <Select label="Erva" value={form.erva_id} onChange={alterar('erva_id')} required>
                      <option value="">Selecione…</option>
                      {(ervas.dados ?? []).map((erva) => <option key={erva.id} value={erva.id}>{erva.nome}</option>)}
                    </Select>
                    <Select label="Origem" value={form.origem} onChange={alterar('origem')} required>
                      <option value="">Selecione…</option>
                      {Object.entries(ROTULO_ORIGEM).map(([valor, rotulo]) => (
                        <option key={valor} value={valor}>{rotulo}</option>
                      ))}
                    </Select>
                  </>
                )}
                <Input label="Data da chegada" type="date" max={dados.hoje} value={form.data_recebimento}
                  onChange={alterar('data_recebimento')} required />
                <Input label="Kg de erva fresca recebidos" type="number" min="0.001" step="0.001" placeholder="ex.: 480"
                  value={form.kg_fresco} onChange={alterar('kg_fresco')} required />
                <div className="sm:col-span-2">
                  <Input label="Observação" maxLength={500} placeholder="ex.: carga chegou úmida"
                    value={form.observacao} onChange={alterar('observacao')} />
                </div>
                <div className="flex flex-col-reverse gap-2 border-t border-borda pt-4 sm:col-span-2 sm:flex-row sm:justify-end">
                  <Button type="button" variant="secondary" onClick={() => setForm(null)}>Cancelar</Button>
                  <Button type="submit" icone={Save} carregando={salvando}>
                    {form.corrigindo ? 'Salvar correção' : 'Registrar'}
                  </Button>
                </div>
              </form>
            </Janela>
          )}
        </>
      )}
    </div>
  );
}
