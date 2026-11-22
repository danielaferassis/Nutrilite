import { CalendarClock, ChartLine, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { FormEvent, useState } from 'react';

import { ErroApi, apiFetch, query } from '../api';
import { camposAlterados } from '../edicao';
import { useFeedback } from '../feedback';
import { ROTULO_ESTAGIO, formatarData, formatarKg, hojeIso } from '../formatar';
import { useApi } from '../hooks';
import { logger } from '../logger';
import { useSessao } from '../sessao';
import { Demanda, Erva, Estagio } from '../tipos';
import {
  Alerta,
  Button,
  CabecalhoCard,
  Card,
  Coluna,
  Etiqueta,
  Input,
  Janela,
  Legenda,
  PageHeader,
  Select,
  Tabela,
} from './ui';

const FORM_VAZIO = {
  erva_id: '',
  kg: '',
  estagio: 'moido' as Estagio,
  prazo: '',
  reserva_kg: '0',
  prioridade: '0',
  observacao: '',
};
type FormDemanda = typeof FORM_VAZIO;

const paraApi = (form: FormDemanda) => ({
  ...form,
  erva_id: Number(form.erva_id),
  prioridade: Number(form.prioridade),
  observacao: form.observacao.trim() || null,
});

const paraForm = (d: Demanda): FormDemanda => ({
  erva_id: String(d.erva.id),
  kg: d.kg,
  estagio: d.estagio,
  prazo: d.prazo,
  reserva_kg: d.reserva_kg,
  prioridade: String(d.prioridade),
  observacao: d.observacao ?? '',
});

// Dias entre hoje e o prazo, sem passar pelo fuso do navegador
const diasAte = (iso: string) => {
  const utc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
  return Math.round((utc(iso) - utc(hojeIso())) / 86_400_000);
};

/** Quanto falta para o prazo: só para orientar a leitura da lista. */
function Prazo({ prazo }: { prazo: string }) {
  const dias = diasAte(prazo);
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span>{formatarData(prazo)}</span>
      {dias < 0 ? (
        <Etiqueta cor="vermelho">vencida</Etiqueta>
      ) : dias <= 7 ? (
        <Etiqueta cor="amarelo">{dias === 0 ? 'hoje' : `em ${dias} dia(s)`}</Etiqueta>
      ) : null}
    </span>
  );
}

export default function GestaoDemandas() {
  const { pode } = useSessao();
  const podeGerenciar = pode('demanda.gerenciar');

  const [filtro, setFiltro] = useState({ prazo_de: '', prazo_ate: '' });
  const demandas = useApi<Demanda[]>(`/demandas${query(filtro)}`);
  const ervas = useApi<Erva[]>('/ervas');

  const [form, setForm] = useState(FORM_VAZIO);
  const [mostrarForm, setMostrarForm] = useState(false);
  // Demanda em edição; null = formulário de nova demanda
  const [editando, setEditando] = useState<Demanda | null>(null);
  const [salvando, setSalvando] = useState(false);
  const feedback = useFeedback();

  const alterar = (campo: keyof FormDemanda) => (e: { target: { value: string } }) =>
    setForm({ ...form, [campo]: e.target.value });

  const fecharForm = () => {
    setForm(FORM_VAZIO);
    setEditando(null);
    setMostrarForm(false);
  };

  const editar = (d: Demanda) => {
    setForm(paraForm(d));
    setEditando(d);
    setMostrarForm(true);
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    try {
      if (editando === null) {
        const corpo = JSON.stringify(paraApi(form));
        try {
          await apiFetch('/demandas', { method: 'POST', body: corpo });
        } catch (err) {
          // Demanda idêntica já cadastrada: o backend avisa e só grava se o usuário confirmar
          if (!(err instanceof ErroApi && err.status === 409)) throw err;
          const ok = await feedback.confirmar({
            titulo: 'Cadastrar demanda repetida?',
            mensagem: err.message,
            rotuloConfirmar: 'Cadastrar mesmo assim',
          });
          if (!ok) return;
          await apiFetch(`/demandas${query({ confirmar_duplicada: 'true' })}`, { method: 'POST', body: corpo });
        }
      } else {
        const corpo = camposAlterados(paraApi(form), paraApi(paraForm(editando)));
        await apiFetch(`/demandas/${editando.id}`, { method: 'PATCH', body: JSON.stringify(corpo) });
      }
      logger.info(editando === null ? 'Demanda cadastrada' : `Demanda ${editando.id} atualizada`);
      const erva = ervas.dados?.find((x) => String(x.id) === form.erva_id)?.nome ?? 'erva';
      const descricao = `${formatarKg(form.kg)} de ${erva} (${ROTULO_ESTAGIO[form.estagio].toLowerCase()}) até ${formatarData(form.prazo)}.`;
      const titulo = editando === null ? 'Demanda cadastrada' : `Demanda #${editando.id} atualizada`;
      fecharForm();
      demandas.recarregar();
      feedback.sucesso(titulo, descricao);
    } catch (err) {
      feedback.erro(
        editando === null ? 'Não foi possível cadastrar a demanda' : 'Não foi possível atualizar a demanda',
        err
      );
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

  const colunas: Coluna<Demanda>[] = [
    { titulo: 'ID', valor: (d) => <span className="font-semibold text-tinta">#{d.id}</span>, texto: (d) => `#${d.id}`, ordenar: (d) => d.id },
    { titulo: 'Erva', valor: (d) => d.erva.nome, texto: (d) => d.erva.nome, filtro: 'opcoes' },
    {
      titulo: 'Quantidade',
      valor: (d) => `${formatarKg(d.kg)} (${ROTULO_ESTAGIO[d.estagio].toLowerCase()})`,
      texto: (d) => ROTULO_ESTAGIO[d.estagio],
      ordenar: (d) => Number(d.kg),
      filtro: 'opcoes',
    },
    { titulo: 'Reserva', valor: (d) => (Number(d.reserva_kg) ? formatarKg(d.reserva_kg) : '—'), ordenar: (d) => Number(d.reserva_kg) },
    { titulo: 'Prazo', valor: (d) => <Prazo prazo={d.prazo} />, texto: (d) => formatarData(d.prazo), ordenar: (d) => d.prazo },
    { titulo: 'Prioridade', valor: (d) => d.prioridade, texto: (d) => String(d.prioridade), ordenar: (d) => d.prioridade, filtro: 'opcoes' },
    { titulo: 'Cadastrada por', valor: (d) => d.criado_por.nome, texto: (d) => d.criado_por.nome, filtro: 'opcoes' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        secao="Planejamento"
        titulo="Gestão de Demandas"
        ajuda={[
          'Cadastre a meta de produção em "Nova demanda": erva, quantidade, estágio (fresco, desidratado ou moído) e prazo.',
          'Não é preciso calcular a erva fresca: o Plano de Secagem converte a meta em kg de fresco pelo rendimento da erva.',
          'Use a prioridade para desempatar demandas com prazo parecido (maior = mais urgente).',
          'Filtre o período do prazo no topo da lista e o resto (erva, estágio, responsável) em "Filtrar por coluna".',
        ]}
        descricao="Metas de produção com prazo. A conversão para kg de erva fresca é feita no módulo Plano de Secagem."
        acoes={
          podeGerenciar && (
            <Button icone={Plus} onClick={() => setMostrarForm(true)}>
              Nova demanda
            </Button>
          )
        }
      />

      {mostrarForm && (
        <Janela
          titulo={editando === null ? 'Nova demanda' : `Editar demanda #${editando.id}`}
          descricao="Quanto produzir, em qual estágio e até quando."
          icone={ChartLine}
          aoFechar={fecharForm}
        >
          <form onSubmit={salvar} className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Select label="Erva" value={form.erva_id} onChange={alterar('erva_id')} required>
              <option value="">Selecione…</option>
              {(ervas.dados ?? []).map((erva) => (
                <option key={erva.id} value={erva.id}>{erva.nome}</option>
              ))}
              {/* A lista só traz ervas ativas; a da demanda em edição pode ter sido desativada */}
              {editando && !ervas.dados?.some((x) => x.id === editando.erva.id) && (
                <option value={editando.erva.id}>{editando.erva.nome} (inativa)</option>
              )}
            </Select>
            <Input label="Prazo" type="date" value={form.prazo} onChange={alterar('prazo')} required />
            <Input label="Quantidade líquida (kg)" type="number" min="0.001" step="0.001" placeholder="ex.: 150"
              value={form.kg} onChange={alterar('kg')} required />
            <Select label="Estágio da quantidade" value={form.estagio} onChange={alterar('estagio')}>
              {Object.entries(ROTULO_ESTAGIO).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>{rotulo}</option>
              ))}
            </Select>
            <Input label="Reserva (kg, mesmo estágio)" type="number" min="0" max={form.kg || undefined} step="0.001"
              value={form.reserva_kg} onChange={alterar('reserva_kg')} required />
            <Input label="Prioridade (maior = mais urgente)" type="number" min="0" max="1000" step="1"
              value={form.prioridade} onChange={alterar('prioridade')} required />
            <div className="md:col-span-2">
              <Input label="Observação" maxLength={500} placeholder="ex.: pedido do lote de exportação"
                value={form.observacao} onChange={alterar('observacao')} />
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-borda pt-4 sm:flex-row sm:justify-end md:col-span-2">
              <Button type="button" variant="secondary" onClick={fecharForm}>Cancelar</Button>
              <Button type="submit" icone={Save} carregando={salvando}>
                {editando === null ? 'Salvar demanda' : 'Salvar alterações'}
              </Button>
            </div>
          </form>
        </Janela>
      )}

      <Card>
        <CabecalhoCard
          icone={CalendarClock}
          titulo="Demandas cadastradas"
          descricao="Filtre o período do prazo aqui; erva, estágio e responsável, pelo filtro de cada coluna."
        />
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:max-w-lg">
          <Input label="Prazo a partir de" type="date" value={filtro.prazo_de}
            onChange={(e) => setFiltro({ ...filtro, prazo_de: e.target.value })} />
          <Input label="Prazo até" type="date" value={filtro.prazo_ate}
            onChange={(e) => setFiltro({ ...filtro, prazo_ate: e.target.value })} />
        </div>
        {demandas.erro && <Alerta>{demandas.erro}</Alerta>}
        <Tabela
          rotulo="Demandas"
          colunas={colunas}
          linhas={demandas.dados ?? []}
          chave={(d) => d.id}
          carregando={demandas.carregando}
          vazio="Nenhuma demanda cadastrada."
          acoes={
            podeGerenciar
              ? (d) => (
                  <>
                    <Button variant="secondary" tamanho="sm" icone={Pencil} compacto onClick={() => editar(d)}>Editar</Button>
                    <Button variant="secondary" tamanho="sm" icone={Trash2} compacto onClick={() => excluir(d)}>Excluir</Button>
                  </>
                )
              : undefined
          }
        />
        <Legenda
          itens={[
            { amostra: 'bg-red-600', rotulo: 'Vencida', descricao: 'o prazo já passou' },
            { amostra: 'bg-amber-500', rotulo: 'Em até 7 dias', descricao: 'prazo próximo' },
            { amostra: 'bg-verde-700', rotulo: 'Estágio', descricao: 'fresco, desidratado ou moído (produto acabado)' },
            { amostra: 'bg-cinza', rotulo: 'Reserva', descricao: 'kg a mais guardados como segurança, no mesmo estágio' },
          ]}
        />
      </Card>
    </div>
  );
}
