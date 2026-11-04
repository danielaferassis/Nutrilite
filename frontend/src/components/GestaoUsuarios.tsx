import { FormEvent, useState } from 'react';

import { apiFetch, textoDoErro } from '../api';
import { formatarDataHora } from '../formatar';
import { useApi } from '../hooks';
import { logger } from '../logger';
import { useSessao } from '../sessao';
import { Grupo, Usuario } from '../tipos';
import ItemList from './ItemList';
import { Alerta, Button, Card, Etiqueta, Input } from './ui';

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
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

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
    setErro('');
  };

  const editar = (u: Usuario) => {
    setForm({ nome: u.nome, email: u.email, senha: '', ativo: u.ativo, grupo_ids: u.grupos.map((g) => g.id) });
    setEditandoId(u.id);
    setErro('');
    setAviso('');
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    const { senha, ...resto } = form;
    try {
      if (editandoId === null) {
        await apiFetch('/usuarios', { method: 'POST', body: JSON.stringify(form) });
        logger.info('Usuário cadastrado');
        setAviso(`Usuário ${form.nome} cadastrado.`);
      } else {
        // Senha em branco na edição mantém a atual
        const corpo = senha ? { ...resto, senha } : resto;
        await apiFetch(`/usuarios/${editandoId}`, { method: 'PATCH', body: JSON.stringify(corpo) });
        logger.info('Usuário atualizado', editandoId);
        setAviso(`Usuário ${form.nome} atualizado.`);
      }
      limpar();
      usuarios.recarregar();
    } catch (err) {
      setErro(textoDoErro(err));
      setAviso('');
    }
  };

  const excluir = async (u: Usuario) => {
    if (!window.confirm(`Excluir o usuário ${u.nome} (${u.email})? Prefira desativar para manter o histórico.`)) return;
    try {
      await apiFetch(`/usuarios/${u.id}`, { method: 'DELETE' });
      logger.info('Usuário removido', u.id);
      if (editandoId === u.id) limpar();
      usuarios.recarregar();
    } catch (err) {
      setErro(textoDoErro(err));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#211E16]">Usuários</h1>
        <p className="text-sm text-gray-500">
          Cadastro de quem acessa o sistema. O que cada um pode fazer vem dos grupos a que pertence.
        </p>
      </div>

      {erro && <Alerta>{erro}</Alerta>}
      {aviso && <Alerta tipo="sucesso">{aviso}</Alerta>}

      <Card>
        <h2 className="text-lg font-semibold text-[#211E16] mb-4">
          {editandoId === null ? 'Novo usuário' : `Editar usuário: ${form.nome}`}
        </h2>
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
            <legend className="text-sm font-medium text-[#211E16] mb-2">Grupos</legend>
            {grupos.erro && <Alerta>{grupos.erro}</Alerta>}
            {grupos.dados?.length === 0 && (
              <p className="text-sm text-gray-500">Nenhum grupo cadastrado.</p>
            )}
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {(grupos.dados ?? []).map((g) => (
                <label key={g.id} className="flex items-center gap-2 text-sm text-[#211E16]">
                  <input
                    type="checkbox"
                    className="accent-[#006F44]"
                    checked={form.grupo_ids.includes(g.id)}
                    onChange={() => alternarGrupo(g.id)}
                  />
                  {g.nome}
                  {!g.ativo && <Etiqueta>inativo</Etiqueta>}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex items-center gap-2 text-sm text-[#211E16]">
            <input
              type="checkbox"
              className="accent-[#006F44]"
              checked={form.ativo}
              disabled={editandoASiMesmo}
              onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
            />
            Ativo (pode entrar no sistema)
            {editandoASiMesmo && <span className="text-gray-500">— você não pode desativar o próprio usuário</span>}
          </label>

          <div className="flex gap-2">
            <Button type="submit">{editandoId === null ? 'Cadastrar' : 'Salvar alterações'}</Button>
            {editandoId !== null && (
              <Button type="button" variant="secondary" onClick={limpar}>Cancelar</Button>
            )}
          </div>
        </form>
      </Card>

      <Card>
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
              <span className="text-gray-400">Sem grupo</span>
            ),
            situacao: u.ativo ? <Etiqueta cor="verde">Ativo</Etiqueta> : <Etiqueta>Inativo</Etiqueta>,
            login: u.ultimo_login ? formatarDataHora(u.ultimo_login) : 'Nunca',
            acoes: (
              <div className="flex gap-2 justify-end">
                <Button variant="secondary" onClick={() => editar(u)}>Editar</Button>
                {u.id !== sessao?.usuario.id && (
                  <Button variant="danger" onClick={() => excluir(u)}>Excluir</Button>
                )}
              </div>
            ),
          }))}
          vazio={usuarios.carregando ? 'Carregando…' : 'Nenhum usuário cadastrado.'}
        />
      </Card>
    </div>
  );
}
