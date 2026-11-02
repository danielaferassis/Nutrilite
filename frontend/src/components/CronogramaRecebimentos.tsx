import { FormEvent, useState } from 'react';

import { apiFetch, query, textoDoErro } from '../api';
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
import { Chegada, Cronograma as CronogramaT, Erva, PlanoResumo, SituacaoChegada } from '../tipos';
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
  const [erro, setErro] = useState('');

  const abrirForm = (previsao_id: number | null) =>
    setForm({
      previsao_id,
      erva_id: '',
      origem: '',
      // Só conveniência do formulário: o usuário confirma a data antes de salvar
      data_recebimento: cronograma.dados?.hoje ?? hojeIso(),
      kg_fresco: '',
      observacao: '',
    });

  const registrar = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
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
      setErro('');
      cronograma.recarregar();
    } catch (err) {
      setErro(textoDoErro(err));
    }
  };

  const desfazer = async (recebimentoId: number) => {
    if (!window.confirm('Remover este recebimento? A previsão volta a valer na simulação.')) return;
    try {
      await apiFetch(`/recebimentos/${recebimentoId}`, { method: 'DELETE' });
      cronograma.recarregar();
    } catch (err) {
      setErro(textoDoErro(err));
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
              <button className="text-xs text-red-600 hover:underline" onClick={() => desfazer(r.id)}>
                remover
              </button>
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

      {erro && <Alerta>{erro}</Alerta>}
      {cronograma.erro && <Alerta>{cronograma.erro}</Alerta>}

      {dados && (
        <>
          <Card>
            <h2 className="font-semibold mb-3">Planos no período</h2>
            <LinhaDoTempo planos={dados.planos} de={dados.de} ate={dados.ate} />
          </Card>

          <Card>
            <h2 className="font-semibold mb-3">Programação de secagem (planos aprovados)</h2>
            <Cronograma alocacoes={dados.alocacoes} />
          </Card>

          <Card>
            <div className="flex justify-between items-center mb-3">
              <h2 className="font-semibold">Chegadas de erva fresca</h2>
              {podeRegistrar && (
                <Button variant="secondary" onClick={() => abrirForm(null)}>+ Chegada não prevista</Button>
              )}
            </div>

            {form && (
              <form onSubmit={registrar} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end mb-6 p-4 bg-gray-50 rounded">
                <p className="md:col-span-5 text-sm font-semibold">
                  {form.previsao_id ? `Chegada da previsão #${form.previsao_id}` : 'Chegada não prevista'}
                </p>
                {form.previsao_id === null && (
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
                  <Button type="submit">Registrar</Button>
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
