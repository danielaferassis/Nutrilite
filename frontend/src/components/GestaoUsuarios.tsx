import { Pencil, Save, Trash2, UserPlus, Users } from 'lucide-react';
import { FormEvent, useState } from 'react';

import { apiFetch } from '../api';
import { useFeedback } from '../feedback';
import { formatarDataHora } from '../formatar';
import { useApi } from '../hooks';
import { logger } from '../logger';
import { useSessao } from '../sessao';
import { Grupo, Usuario } from '../tipos';
import ItemList from './ItemList';
import { Alerta, Button, CabecalhoCard, Card, Etiqueta, Input, PageHeader } from './ui';

interface Formulario {
  nome: string;
  email: string;
  senha: string;
  ativo: boolean;
  grupo_ids: number[];
}

const FORM_VAZIO: Formulario = { nome: '', email: '', senha: '', ativo: true, grupo_ids: [] };

export default function GestaoUsuarios() {
  const { sessao } = useSessao();
  const usuarios = useApi<Usuario[]>('/usuarios');
  const grupos = useApi<Grupo[]>('/grupos');

  const [form, setForm] = useState<Formulario>(FORM_VAZIO);
  // null = cadastrando um novo usuário
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);
  const feedback = useFeedback();

  const editandoASiMesmo = editandoId !== null && editandoId === sessao?.usuario.id;

  const alternarGrupo = (id: number) =>
    setForm({
      ...form,
      grupo_ids: form.grupo_ids.includes(id)
        ? form.grupo_ids.filter((g) => g !== id)
        : [...form.grupo_ids, id],
    });

  const limpar = () => {
    setForm(FORM_VAZIO);
    setEditandoId(null);
  };

  const editar = (u: Usuario) => {
    setForm({ nome: u.nome, email: u.email, senha: '', ativo: u.ativo, grupo_ids: u.grupos.map((g) => g.id) });
    setEditandoId(u.id);
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    const { senha, ...resto } = form;
    const novo = editandoId === null;
    setSalvando(true);
    try {
      if (novo) {
        await apiFetch('/usuarios', { method: 'POST', body: JSON.stringify(form) });
        logger.info('Usuário cadastrado');
        feedback.sucesso('Usuário cadastrado', `${form.nome} já pode entrar no sistema com o e-mail ${form.email}.`);
      } else {
        // Senha em branco na edição mantém a atual
        const corpo = senha ? { ...resto, senha } : resto;
        await apiFetch(`/usuarios/${editandoId}`, { method: 'PATCH', body: JSON.stringify(corpo) });
        logger.info('Usuário atualizado', editandoId);
        feedback.sucesso(
          'Alterações salvas',
          `Os dados de ${form.nome} foram atualizados.${senha ? ' A nova senha já vale; quem estava conectado com a senha antiga precisa entrar de novo.' : ''}`
        );
      }
      limpar();
      usuarios.recarregar();
    } catch (err) {
      // O formulário continua preenchido para corrigir e tentar de novo
      feedback.erro(novo ? 'Não foi possível cadastrar o usuário' : 'Não foi possível salvar as alterações', err);
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (u: Usuario) => {
    const ok = await feedback.confirmar({
      titulo: 'Excluir usuário?',
      mensagem: `${u.nome} (${u.email}) perde o acesso e o cadastro é apagado. Para manter o histórico, prefira desativar.`,
      rotuloConfirmar: 'Excluir',
      perigo: true,
    });
    if (!ok) return;
    try {
      await apiFetch(`/usuarios/${u.id}`, { method: 'DELETE' });
      logger.info('Usuário removido', u.id);
      if (editandoId === u.id) limpar();
      usuarios.recarregar();
      feedback.sucesso('Usuário excluído', `${u.nome} não tem mais acesso ao sistema.`);
    } catch (err) {
      feedback.erro('Não foi possível excluir o usuário', err);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        secao="Administração"
        titulo="Usuários"
        descricao="Cadastro de quem acessa o sistema. O que cada um pode fazer vem dos grupos a que pertence."
      />

      <Card>
        <CabecalhoCard
          icone={editandoId === null ? UserPlus : Pencil}
          titulo={editandoId === null ? 'Novo usuário' : `Editar usuário: ${form.nome}`}
        />
        <form onSubmit={salvar} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              label="Nome"
              maxLength={150}
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              required
            />
            <Input
              label="E-mail"
              type="email"
              maxLength={150}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
            <Input
              id="usuario-senha"
              label={editandoId === null ? 'Senha' : 'Nova senha (em branco mantém a atual)'}
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={form.senha}
              onChange={(e) => setForm({ ...form, senha: e.target.value })}
              required={editandoId === null}
            />
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-tinta mb-2">Grupos</legend>
            {grupos.erro && <Alerta>{grupos.erro}</Alerta>}
            {grupos.dados?.length === 0 && (
              <p className="text-sm text-suave">Nenhum grupo cadastrado.</p>
            )}
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {(grupos.dados ?? []).map((g) => (
                <label key={g.id} className="flex items-center gap-2 text-sm text-tinta">
                  <input
                    type="checkbox"
                    className="accent-verde-700"
                    checked={form.grupo_ids.includes(g.id)}
                    onChange={() => alternarGrupo(g.id)}
                  />
                  {g.nome}
                  {!g.ativo && <Etiqueta>inativo</Etiqueta>}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex items-center gap-2 text-sm text-tinta">
            <input
              type="checkbox"
              className="accent-verde-700"
              checked={form.ativo}
              disabled={editandoASiMesmo}
              onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
            />
            Ativo (pode entrar no sistema)
            {editandoASiMesmo && <span className="text-suave">— você não pode desativar o próprio usuário</span>}
          </label>

          <div className="flex flex-col-reverse gap-2 border-t border-borda pt-4 sm:flex-row">
            <Button type="submit" icone={Save} carregando={salvando}>
              {salvando ? 'Salvando…' : editandoId === null ? 'Cadastrar' : 'Salvar alterações'}
            </Button>
            {editandoId !== null && (
              <Button type="button" variant="secondary" onClick={limpar}>Cancelar</Button>
            )}
          </div>
        </form>
      </Card>

      <Card>
        <CabecalhoCard icone={Users} titulo="Usuários cadastrados" />
        {usuarios.erro && <Alerta>{usuarios.erro}</Alerta>}
        <ItemList
          colunas={['Nome', 'E-mail', 'Grupos', 'Situação', 'Último login', '']}
          dados={(usuarios.dados ?? []).map((u) => ({
            nome: u.nome,
            email: u.email,
            grupos: u.grupos.length ? (
              <div className="flex flex-wrap gap-1">
                {u.grupos.map((g) => <Etiqueta key={g.id} cor="azul">{g.nome}</Etiqueta>)}
              </div>
            ) : (
              <span className="text-suave/70">Sem grupo</span>
            ),
            situacao: u.ativo ? <Etiqueta cor="verde">Ativo</Etiqueta> : <Etiqueta>Inativo</Etiqueta>,
            login: u.ultimo_login ? formatarDataHora(u.ultimo_login) : 'Nunca',
            acoes: (
              <div className="flex gap-2 justify-end">
                <Button variant="secondary" tamanho="sm" icone={Pencil} compacto onClick={() => editar(u)}>Editar</Button>
                {u.id !== sessao?.usuario.id && (
                  <Button variant="secondary" tamanho="sm" icone={Trash2} compacto onClick={() => excluir(u)}>Excluir</Button>
                )}
              </div>
            ),
          }))}
          carregando={usuarios.carregando}
          vazio="Nenhum usuário cadastrado."
        />
      </Card>
    </div>
  );
}
