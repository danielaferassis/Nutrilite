import { FormEvent, useState } from 'react';

import { apiFetch, query } from '../api';
import { useFeedback } from '../feedback';
import { ROTULO_ESTAGIO, formatarData, formatarKg } from '../formatar';
import { useApi } from '../hooks';
import { logger } from '../logger';
import { useSessao } from '../sessao';
import { Demanda, Erva, Estagio } from '../tipos';
import ItemList from './ItemList';
import { Alerta, Button, Card, Input, Select } from './ui';

const FORM_VAZIO = {
  erva_id: '',
  kg: '',
  estagio: 'moido' as Estagio,
  prazo: '',
  reserva_kg: '0',
  prioridade: '0',
  observacao: '',
};

export default function GestaoDemandas() {
  const { pode } = useSessao();
  const podeGerenciar = pode('demanda.gerenciar');

  const [filtro, setFiltro] = useState({ erva_id: '', prazo_de: '', prazo_ate: '' });
  const demandas = useApi<Demanda[]>(`/demandas${query(filtro)}`);
  const ervas = useApi<Erva[]>('/ervas');

  const [form, setForm] = useState(FORM_VAZIO);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const feedback = useFeedback();

  const alterar = (campo: keyof typeof FORM_VAZIO) => (e: { target: { value: string } }) =>
    setForm({ ...form, [campo]: e.target.value });

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    try {
      await apiFetch('/demandas', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          erva_id: Number(form.erva_id),
          prioridade: Number(form.prioridade),
          observacao: form.observacao.trim() || null,
        }),
      });
      logger.info('Demanda cadastrada');
      const erva = ervas.dados?.find((x) => String(x.id) === form.erva_id)?.nome ?? 'erva';
      setForm(FORM_VAZIO);
      setMostrarForm(false);
      demandas.recarregar();
      feedback.sucesso(
        'Demanda cadastrada',
        `${formatarKg(form.kg)} de ${erva} (${ROTULO_ESTAGIO[form.estagio].toLowerCase()}) até ${formatarData(form.prazo)}.`
      );
    } catch (err) {
      feedback.erro('Não foi possível cadastrar a demanda', err);
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (demanda: Demanda) => {
    const ok = await feedback.confirmar({
      titulo: 'Excluir demanda?',
      mensagem: `Demanda #${demanda.id}: ${formatarKg(demanda.kg)} de ${demanda.erva.nome} até ${formatarData(demanda.prazo)}.`,
      rotuloConfirmar: 'Excluir',
      perigo: true,
    });
    if (!ok) return;
    try {
      await apiFetch(`/demandas/${demanda.id}`, { method: 'DELETE' });
      demandas.recarregar();
      feedback.sucesso('Demanda excluída', `A demanda #${demanda.id} foi removida.`);
    } catch (err) {
      feedback.erro('Não foi possível excluir a demanda', err);
    }
  };

  const linhas = (demandas.dados ?? []).map((d) => ({
    id: `#${d.id}`,
    erva: d.erva.nome,
    qtde: `${formatarKg(d.kg)} (${ROTULO_ESTAGIO[d.estagio].toLowerCase()})`,
    reserva: Number(d.reserva_kg) ? formatarKg(d.reserva_kg) : '—',
    prazo: formatarData(d.prazo),
    prioridade: d.prioridade,
    criado: d.criado_por.nome,
    acoes: podeGerenciar ? (
      <Button variant="secondary" onClick={() => excluir(d)}>Excluir</Button>
    ) : null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-[#211E16]">Gestão de Demandas</h1>
          <p className="text-sm text-gray-500">
            Metas de produção com prazo. A conversão para kg de erva fresca é feita na simulação.
          </p>
        </div>
        {podeGerenciar && (
          <Button variant="primary" onClick={() => setMostrarForm(!mostrarForm)}>
            {mostrarForm ? 'Cancelar' : '+ Nova Demanda'}
          </Button>
        )}
      </div>

      {mostrarForm && (
        <Card>
          <h2 className="text-lg font-semibold mb-4">Nova demanda</h2>
          <form onSubmit={salvar} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select label="Erva" value={form.erva_id} onChange={alterar('erva_id')} required>
              <option value="">Selecione…</option>
              {(ervas.dados ?? []).map((erva) => (
                <option key={erva.id} value={erva.id}>{erva.nome}</option>
              ))}
            </Select>
            <Input label="Quantidade líquida (kg)" type="number" min="0.001" step="0.001"
              value={form.kg} onChange={alterar('kg')} required />
            <Select label="Estágio da quantidade" value={form.estagio} onChange={alterar('estagio')}>
              {Object.entries(ROTULO_ESTAGIO).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>{rotulo}</option>
              ))}
            </Select>
            <Input label="Prazo" type="date" value={form.prazo} onChange={alterar('prazo')} required />
            <Input label="Reserva (kg, mesmo estágio)" type="number" min="0" step="0.001"
              value={form.reserva_kg} onChange={alterar('reserva_kg')} required />
            <Input label="Prioridade (maior = mais urgente)" type="number" min="0" step="1"
              value={form.prioridade} onChange={alterar('prioridade')} required />
            <div className="md:col-span-3">
              <Input label="Observação" maxLength={500} value={form.observacao} onChange={alterar('observacao')} />
            </div>
            <div className="md:col-span-3 flex justify-end">
              <Button type="submit" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar demanda'}</Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Select label="Erva" value={filtro.erva_id} onChange={(e) => setFiltro({ ...filtro, erva_id: e.target.value })}>
            <option value="">Todas</option>
            {(ervas.dados ?? []).map((erva) => (
              <option key={erva.id} value={erva.id}>{erva.nome}</option>
            ))}
          </Select>
          <Input label="Prazo a partir de" type="date" value={filtro.prazo_de}
            onChange={(e) => setFiltro({ ...filtro, prazo_de: e.target.value })} />
          <Input label="Prazo até" type="date" value={filtro.prazo_ate}
            onChange={(e) => setFiltro({ ...filtro, prazo_ate: e.target.value })} />
        </div>
        {demandas.erro && <Alerta>{demandas.erro}</Alerta>}
        <ItemList
          colunas={['ID', 'Erva', 'Quantidade', 'Reserva', 'Prazo', 'Prioridade', 'Cadastrada por', '']}
          dados={linhas}
          vazio={demandas.carregando ? 'Carregando…' : 'Nenhuma demanda cadastrada.'}
        />
      </Card>
    </div>
  );
}
