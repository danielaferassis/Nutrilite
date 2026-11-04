import { FormEvent, useState } from 'react';

import { apiFetch } from '../api';
import { useFeedback } from '../feedback';
import { useApi } from '../hooks';
import { logger } from '../logger';
import { Grupo } from '../tipos';
import ItemList from './ItemList';
import { Alerta, Button, Card, Etiqueta, Input } from './ui';

interface Formulario {
  nome: string;
  descricao: string;
  ativo: boolean;
}

const FORM_VAZIO: Formulario = { nome: '', descricao: '', ativo: true };

export default function GestaoGrupos() {
  const grupos = useApi<Grupo[]>('/grupos');

  const [form, setForm] = useState<Formulario>(FORM_VAZIO);
  // null = cadastrando um novo grupo
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);
  const feedback = useFeedback();

  const limpar = () => {
    setForm(FORM_VAZIO);
    setEditandoId(null);
  };

  const editar = (g: Grupo) => {
    setForm({ nome: g.nome, descricao: g.descricao ?? '', ativo: g.ativo });
    setEditandoId(g.id);
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    const corpo = { ...form, descricao: form.descricao.trim() || null };
    const novo = editandoId === null;
    setSalvando(true);
    try {
      if (novo) {
        // Nasce sem permissões: elas são marcadas na tela Permissões de Acesso
        await apiFetch('/grupos', { method: 'POST', body: JSON.stringify(corpo) });
        logger.info('Grupo cadastrado');
        feedback.sucesso(
          'Grupo cadastrado',
          `O grupo ${form.nome} foi criado sem permissões. Marque o que ele pode fazer na tela Permissões de Acesso.`
        );
      } else {
        await apiFetch(`/grupos/${editandoId}`, { method: 'PATCH', body: JSON.stringify(corpo) });
        logger.info('Grupo atualizado', editandoId);
        feedback.sucesso('Alterações salvas', `O grupo ${form.nome} foi atualizado.`);
      }
      limpar();
      grupos.recarregar();
    } catch (err) {
      feedback.erro(novo ? 'Não foi possível cadastrar o grupo' : 'Não foi possível salvar as alterações', err);
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (g: Grupo) => {
    const ok = await feedback.confirmar({
      titulo: 'Excluir grupo?',
      mensagem: `Os usuários do grupo ${g.nome} perdem as permissões que vinham dele.`,
      rotuloConfirmar: 'Excluir',
      perigo: true,
    });
    if (!ok) return;
    try {
      await apiFetch(`/grupos/${g.id}`, { method: 'DELETE' });
      logger.info('Grupo removido', g.id);
      if (editandoId === g.id) limpar();
      grupos.recarregar();
      feedback.sucesso('Grupo excluído', `O grupo ${g.nome} foi removido.`);
    } catch (err) {
      feedback.erro('Não foi possível excluir o grupo', err);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#211E16]">Grupos</h1>
        <p className="text-sm text-gray-500">
          Perfis de acesso (ex.: PCP/Gestor, Fonte fornecedora). Grupo inativo não concede permissão a ninguém.
        </p>
      </div>

      <Card>
        <h2 className="text-lg font-semibold text-[#211E16] mb-4">
          {editandoId === null ? 'Novo grupo' : `Editar grupo: ${form.nome}`}
        </h2>
        <form onSubmit={salvar} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              label="Nome"
              maxLength={100}
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              required
            />
            <div className="md:col-span-2">
              <Input
                label="Descrição"
                maxLength={255}
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-[#211E16]">
            <input
              type="checkbox"
              className="accent-[#006F44]"
              checked={form.ativo}
              onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
            />
            Ativo (concede as permissões aos membros)
          </label>

          <div className="flex gap-2">
            <Button type="submit" disabled={salvando}>
              {salvando ? 'Salvando…' : editandoId === null ? 'Cadastrar' : 'Salvar alterações'}
            </Button>
            {editandoId !== null && (
              <Button type="button" variant="secondary" onClick={limpar}>Cancelar</Button>
            )}
          </div>
        </form>
      </Card>

      <Card>
        {grupos.erro && <Alerta>{grupos.erro}</Alerta>}
        <ItemList
          colunas={['Nome', 'Descrição', 'Permissões', 'Situação', '']}
          dados={(grupos.dados ?? []).map((g) => ({
            nome: g.nome,
            descricao: g.descricao ?? <span className="text-gray-400">—</span>,
            permissoes: g.funcionalidades.length,
            situacao: g.ativo ? <Etiqueta cor="verde">Ativo</Etiqueta> : <Etiqueta>Inativo</Etiqueta>,
            acoes: (
              <div className="flex gap-2 justify-end">
                <Button variant="secondary" onClick={() => editar(g)}>Editar</Button>
                <Button variant="danger" onClick={() => excluir(g)}>Excluir</Button>
              </div>
            ),
          }))}
          vazio={grupos.carregando ? 'Carregando…' : 'Nenhum grupo cadastrado.'}
        />
      </Card>
    </div>
  );
}
