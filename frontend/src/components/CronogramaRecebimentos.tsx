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
  formatarKg,
  hojeIso,
} from '../formatar';
import { useApi } from '../hooks';
import { logger } from '../logger';
import { useSessao } from '../sessao';
import { Chegada, Cronograma as CronogramaT, Erva, PlanoResumo, Recebimento, SituacaoChegada } from '../tipos';
import ItemList from './ItemList';
import { Cronograma } from './ResultadoPlano';
import { Alerta, Button, Card, Etiqueta, EtiquetaCor, Input, Select } from './ui';

const COR_SITUACAO: Record<SituacaoChegada, EtiquetaCor> = {
  recebida: 'verde',
  aguardando: 'cinza',
  atrasada: 'vermelho',
  nao_prevista: 'azul',
};

// Dias entre duas datas ISO, sem passar pelo fuso do navegador
const diasEntre = (de: string, ate: string) =>
  (Date.UTC(+ate.slice(0, 4), +ate.slice(5, 7) - 1, +ate.slice(8, 10)) -
    Date.UTC(+de.slice(0, 4), +de.slice(5, 7) - 1, +de.slice(8, 10))) / 86_400_000;

/** Barras dos planos aprovados e substituídos dentro do período. */
function LinhaDoTempo({ planos, de, ate }: { planos: PlanoResumo[]; de: string; ate: string }) {
  const total = diasEntre(de, ate) + 1;
  if (planos.length === 0) return <p className="text-sm text-gray-500">Nenhum plano aprovado no período.</p>;
  return (
    <div className="space-y-2">
      {planos.map((p) => {
        const inicio = p.inicio < de ? de : p.inicio;
        const fim = p.fim > ate ? ate : p.fim;
        const esquerda = (diasEntre(de, inicio) / total) * 100;
        const largura = ((diasEntre(inicio, fim) + 1) / total) * 100;
        const aprovado = p.status === 'aprovado';
        return (
          <div key={p.id} className="flex items-center gap-3 text-xs">
            <span className="w-10 font-semibold">v{p.versao}</span>
            <div className="relative flex-1 h-6 bg-gray-100 rounded">
              <div
                className={`absolute h-6 rounded px-2 flex items-center whitespace-nowrap overflow-hidden ${
                  aprovado ? 'bg-[#006F44] text-white' : 'bg-amber-200 text-amber-900 line-through'
                }`}
                style={{ left: `${esquerda}%`, width: `${largura}%` }}
                title={`${ROTULO_STATUS[p.status]}: ${formatarData(p.inicio)} a ${formatarData(p.fim)}`}
              >
                {formatarData(p.inicio)} a {formatarData(p.fim)}
              </div>
            </div>
            <span className="w-24">{ROTULO_STATUS[p.status]}</span>
          </div>
        );
      })}
    </div>
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

export default function CronogramaRecebimentos() {
  const { pode } = useSessao();
  const podeRegistrar = pode('recebimento.registrar');

  const [periodo, setPeriodo] = useState({ de: hojeIso(-1), ate: hojeIso(13) });
  const cronograma = useApi<CronogramaT>(`/cronograma${query(periodo)}`);
  const ervas = useApi<Erva[]>(podeRegistrar ? '/ervas' : null);

  const [form, setForm] = useState<FormRecebimento | null>(null);
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
    try {
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
    } catch (err) {
      feedback.erro('Não foi possível corrigir o recebimento', err);
    }
  };

  const registrar = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    if (form.corrigindo) return salvarCorrecao(form, form.corrigindo);
    const naoPrevista = form.previsao_id === null;
    try {
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
      feedback.erro('Não foi possível registrar o recebimento', err);
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

  const linha = (c: Chegada) => ({
    previsao: c.previsao_id ? `#${c.previsao_id}` : '—',
    erva: c.erva.nome,
    origem: ROTULO_ORIGEM[c.origem],
    prevista: c.data_prevista ? formatarData(c.data_prevista) : '—',
    kgPrevisto: c.kg_previsto ? formatarKg(c.kg_previsto) : '—',
    recebido: c.recebimentos.length
      ? c.recebimentos.map((r) => (
          <div key={r.id} className="flex items-center gap-2">
            {formatarData(r.data_recebimento)}: {formatarKg(r.kg_fresco)}
            {podeRegistrar && (
              <>
                <button className="text-xs text-[#006F44] hover:underline" onClick={() => corrigir(r)}>
                  corrigir
                </button>
                <button className="text-xs text-red-600 hover:underline" onClick={() => desfazer(r.id)}>
                  remover
                </button>
              </>
            )}
          </div>
        ))
      : '—',
    desvio: c.desvio_kg === null ? '—' : (
      <span className={Number(c.desvio_kg) < 0 ? 'text-red-700' : 'text-[#006F44]'}>
        {Number(c.desvio_kg) > 0 ? '+' : ''}{formatarKg(c.desvio_kg)}
      </span>
    ),
    situacao: <Etiqueta cor={COR_SITUACAO[c.situacao]}>{ROTULO_SITUACAO[c.situacao]}</Etiqueta>,
    acoes: podeRegistrar && c.previsao_id ? (
      <Button variant="secondary" onClick={() => abrirForm(c.previsao_id)}>Registrar chegada</Button>
    ) : null,
  });

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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#211E16]">Cronograma e Recebimentos</h1>
          <p className="text-sm text-gray-500">
            O que os planos aprovados mandam secar e o que de fato chegou. O recebido substitui o previsto nas
            próximas simulações.
          </p>
        </div>
        <div className="flex gap-3">
          <Input label="De" type="date" value={periodo.de} onChange={(e) => setPeriodo({ ...periodo, de: e.target.value })} />
          <Input label="Até" type="date" value={periodo.ate} onChange={(e) => setPeriodo({ ...periodo, ate: e.target.value })} />
        </div>
      </div>

      {cronograma.erro && <Alerta>{cronograma.erro}</Alerta>}

      {dados && (
        <>
          <Card>
            <h2 className="font-semibold mb-3">Planos no período</h2>
            <LinhaDoTempo planos={dados.planos} de={dados.de} ate={dados.ate} />
          </Card>

          <Card>
            <div className="flex justify-between items-center mb-3">
              <h2 className="font-semibold">Programação de secagem (planos aprovados)</h2>
              {dados.alocacoes.length > 0 && (
                <Button variant="secondary" onClick={exportarProgramacao}>Baixar (Excel)</Button>
              )}
            </div>
            <Cronograma alocacoes={dados.alocacoes} />
          </Card>

          <Card>
            <div className="flex justify-between items-center mb-3">
              <h2 className="font-semibold">Chegadas de erva fresca</h2>
              <div className="flex gap-2">
                {dados.chegadas.length > 0 && (
                  <Button variant="secondary" onClick={exportarChegadas}>Baixar (Excel)</Button>
                )}
                {podeRegistrar && (
                  <Button variant="secondary" onClick={() => abrirForm(null)}>+ Chegada não prevista</Button>
                )}
              </div>
            </div>

            {form && (
              <form onSubmit={registrar} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end mb-6 p-4 bg-gray-50 rounded">
                <p className="md:col-span-5 text-sm font-semibold">
                  {form.corrigindo
                    ? `Corrigir recebimento de ${form.corrigindo.erva.nome} (${ROTULO_ORIGEM[form.corrigindo.origem]})`
                    : form.previsao_id
                      ? `Chegada da previsão #${form.previsao_id}`
                      : 'Chegada não prevista'}
                </p>
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
                <Input label="Kg de erva fresca recebidos" type="number" min="0.001" step="0.001"
                  value={form.kg_fresco} onChange={alterar('kg_fresco')} required />
                <Input label="Observação" maxLength={500} value={form.observacao} onChange={alterar('observacao')} />
                <div className="md:col-span-5 flex gap-3 justify-end">
                  <Button type="button" variant="secondary" onClick={() => setForm(null)}>Cancelar</Button>
                  <Button type="submit">{form.corrigindo ? 'Salvar correção' : 'Registrar'}</Button>
                </div>
              </form>
            )}

            <ItemList
              colunas={['Previsão', 'Erva', 'Origem', 'Prevista para', 'Previsto', 'Recebido', 'Desvio', 'Situação', '']}
              dados={dados.chegadas.map(linha)}
              vazio="Nenhuma chegada prevista ou registrada no período."
            />
          </Card>
        </>
      )}
    </div>
  );
}
