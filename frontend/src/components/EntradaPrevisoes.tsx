import { FormEvent, useState } from 'react';

import { apiFetch, query } from '../api';
import { camposAlterados } from '../edicao';
import { useFeedback } from '../feedback';
import { ROTULO_ORIGEM, formatarData, formatarKg } from '../formatar';
import { useApi } from '../hooks';
import { logger } from '../logger';
import { useSessao } from '../sessao';
import { Erva, Origem, Previsao } from '../tipos';
import ItemList from './ItemList';
import { Alerta, Button, Card, Etiqueta, Input, Select } from './ui';

const FORM_VAZIO = { erva_id: '', origem: '' as Origem | '', kg_fresco: '', data_chegada: '', observacao: '' };
type FormPrevisao = typeof FORM_VAZIO;

const paraApi = (form: FormPrevisao) => ({
  ...form,
  erva_id: Number(form.erva_id),
  observacao: form.observacao.trim() || null,
});

const paraForm = (p: Previsao): FormPrevisao => ({
  erva_id: String(p.erva.id),
  origem: p.origem,
  kg_fresco: p.kg_fresco,
  data_chegada: p.data_chegada,
  observacao: p.observacao ?? '',
});

export default function EntradaPrevisoes() {
  const { sessao, pode } = useSessao();
  const podeGerenciarTodas = pode('previsao.gerenciar');
  const podeCadastrar = pode('previsao.gerenciar', 'previsao.propria');

  const [filtro, setFiltro] = useState({ origem: '', chegada_de: '', chegada_ate: '' });
  const previsoes = useApi<Previsao[]>(`/previsoes${query(filtro)}`);
  const ervas = useApi<Erva[]>('/ervas');

  const [form, setForm] = useState(FORM_VAZIO);
  // Previsão em edição; null = formulário de nova previsão
  const [editando, setEditando] = useState<Previsao | null>(null);
  const feedback = useFeedback();

  const alterar = (campo: keyof FormPrevisao) => (e: { target: { value: string } }) =>
    setForm({ ...form, [campo]: e.target.value });

  const cancelarEdicao = () => {
    setForm(FORM_VAZIO);
    setEditando(null);
  };

  const editar = (p: Previsao) => {
    setForm(paraForm(p));
    setEditando(p);
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (editando === null) {
        await apiFetch('/previsoes', { method: 'POST', body: JSON.stringify(paraApi(form)) });
      } else {
        const corpo = camposAlterados(paraApi(form), paraApi(paraForm(editando)));
        await apiFetch(`/previsoes/${editando.id}`, { method: 'PATCH', body: JSON.stringify(corpo) });
      }
      logger.info(editando === null ? 'Previsão cadastrada' : `Previsão ${editando.id} atualizada`);
      const erva = ervas.dados?.find((x) => String(x.id) === form.erva_id)?.nome ?? editando?.erva.nome ?? 'erva';
      const titulo = editando === null ? 'Previsão cadastrada' : `Previsão #${editando.id} atualizada`;
      cancelarEdicao();
      previsoes.recarregar();
      feedback.sucesso(
        titulo,
        `${formatarKg(form.kg_fresco)} de ${erva} com chegada em ${formatarData(form.data_chegada)}. Ela já entra nas próximas simulações.`
      );
    } catch (err) {
      feedback.erro(
        editando === null ? 'Não foi possível cadastrar a previsão' : 'Não foi possível atualizar a previsão',
        err
      );
    }
  };

  const excluir = async (previsao: Previsao) => {
    const ok = await feedback.confirmar({
      titulo: 'Excluir previsão?',
      mensagem: `Previsão #${previsao.id}: ${formatarKg(previsao.kg_fresco)} de ${previsao.erva.nome} em ${formatarData(previsao.data_chegada)}.`,
      rotuloConfirmar: 'Excluir',
      perigo: true,
    });
    if (!ok) return;
    try {
      await apiFetch(`/previsoes/${previsao.id}`, { method: 'DELETE' });
      previsoes.recarregar();
      feedback.sucesso('Previsão excluída', `A previsão #${previsao.id} foi removida.`);
    } catch (err) {
      feedback.erro('Não foi possível excluir a previsão', err);
    }
  };

  // A Fonte fornecedora só altera as próprias; o backend confere de novo
  const podeAlterar = (p: Previsao) =>
    podeGerenciarTodas || (pode('previsao.propria') && p.criado_por.id === sessao?.usuario.id);

  const acoes = (p: Previsao) => {
    if (!podeAlterar(p)) return null;
    // Recebida fica travada: o recebimento aponta para ela (corrige-se o recebimento, no Cronograma)
    if (p.recebida) return <Etiqueta cor="verde">Recebida</Etiqueta>;
    return (
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => editar(p)}>Editar</Button>
        <Button variant="secondary" onClick={() => excluir(p)}>Excluir</Button>
      </div>
    );
  };

  const linhas = (previsoes.dados ?? []).map((p) => ({
    id: `#${p.id}`,
    erva: p.erva.nome,
    origem: ROTULO_ORIGEM[p.origem],
    chegada: formatarData(p.data_chegada),
    qtde: formatarKg(p.kg_fresco),
    fonte: p.criado_por.nome,
    acoes: acoes(p),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#211E16]">Entrada de Previsões (S&OP)</h1>
        <p className="text-sm text-gray-500">
          Lotes de erva fresca previstos. A data de chegada não é reagendável: o que não for secado a tempo é perda.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <h2 className="text-lg font-semibold mb-4">
            {editando === null ? 'Registo Manual' : `Editar previsão #${editando.id}`}
          </h2>
          {podeCadastrar ? (
            <form onSubmit={salvar} className="space-y-4">
              <Select label="Matéria Prima" value={form.erva_id} onChange={alterar('erva_id')} required>
                <option value="">Selecione…</option>
                {(ervas.dados ?? []).map((erva) => (
                  <option key={erva.id} value={erva.id}>{erva.nome}</option>
                ))}
                {/* A lista só traz ervas ativas; a da previsão em edição pode ter sido desativada */}
                {editando && !ervas.dados?.some((x) => x.id === editando.erva.id) && (
                  <option value={editando.erva.id}>{editando.erva.nome} (inativa)</option>
                )}
              </Select>
              <Select label="Origem" value={form.origem} onChange={alterar('origem')} required>
                <option value="">Selecione…</option>
                {Object.entries(ROTULO_ORIGEM).map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>{rotulo}</option>
                ))}
              </Select>
              <Input label="Quantidade de erva fresca (kg)" type="number" min="0.001" step="0.001"
                value={form.kg_fresco} onChange={alterar('kg_fresco')} required />
              <Input label="Data prevista de chegada" type="date" value={form.data_chegada}
                onChange={alterar('data_chegada')} required />
              <Input label="Observação" maxLength={500} value={form.observacao} onChange={alterar('observacao')} />
              {editando === null ? (
                <Button type="submit" variant="primary" className="w-full">Guardar Previsão</Button>
              ) : (
                <div className="flex gap-3">
                  <Button type="button" variant="secondary" className="w-full" onClick={cancelarEdicao}>Cancelar</Button>
                  <Button type="submit" variant="primary" className="w-full">Salvar alterações</Button>
                </div>
              )}
            </form>
          ) : (
            <p className="text-sm text-gray-500">Seu perfil só consulta as previsões.</p>
          )}
        </Card>

        <Card className="flex flex-col items-center justify-center p-8 text-center bg-gray-50 border-dashed">
          <h3 className="font-medium mb-2">Importação em Lote via Excel/CSV</h3>
          <p className="text-sm text-gray-500 mb-6">
            Aguardando o formato oficial da planilha S&OP. Por enquanto use o registo manual.
          </p>
          <Button variant="secondary" disabled>Selecionar Ficheiro</Button>
        </Card>
      </div>

      <Card>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Select label="Origem" value={filtro.origem} onChange={(e) => setFiltro({ ...filtro, origem: e.target.value })}>
            <option value="">Todas</option>
            {Object.entries(ROTULO_ORIGEM).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>{rotulo}</option>
            ))}
          </Select>
          <Input label="Chegada a partir de" type="date" value={filtro.chegada_de}
            onChange={(e) => setFiltro({ ...filtro, chegada_de: e.target.value })} />
          <Input label="Chegada até" type="date" value={filtro.chegada_ate}
            onChange={(e) => setFiltro({ ...filtro, chegada_ate: e.target.value })} />
        </div>
        {previsoes.erro && <Alerta>{previsoes.erro}</Alerta>}
        <ItemList
          colunas={['ID', 'Matéria Prima', 'Origem', 'Chegada', 'Quantidade (fresco)', 'Cadastrada por', '']}
          dados={linhas}
          vazio={previsoes.carregando ? 'Carregando…' : 'Nenhuma previsão cadastrada.'}
        />
      </Card>
    </div>
  );
}
