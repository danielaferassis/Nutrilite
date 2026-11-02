import { FormEvent, useState } from 'react';

import { apiFetch, textoDoErro } from '../api';
import { formatarData } from '../formatar';
import { useApi } from '../hooks';
import { logger } from '../logger';
import { useSessao } from '../sessao';
import { Bloqueio, Secador } from '../tipos';
import ItemList from './ItemList';
import { Alerta, Button, Card, Input, Select } from './ui';

const FORM_VAZIO = { secador_id: '', inicio: '', fim: '', motivo: '' };

export default function Bloqueios() {
  const { pode } = useSessao();
  const podeGerenciar = pode('bloqueio.gerenciar');

  const bloqueios = useApi<Bloqueio[]>('/bloqueios');
  const secadores = useApi<Secador[]>('/secadores?ativos=false');

  const [form, setForm] = useState(FORM_VAZIO);
  const [erro, setErro] = useState('');

  const alterar = (campo: keyof typeof FORM_VAZIO) => (e: { target: { value: string } }) =>
    setForm({ ...form, [campo]: e.target.value });

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/bloqueios', {
        method: 'POST',
        body: JSON.stringify({ ...form, secador_id: Number(form.secador_id) }),
      });
      logger.info('Bloqueio cadastrado');
      setForm(FORM_VAZIO);
      setErro('');
      bloqueios.recarregar();
    } catch (err) {
      setErro(textoDoErro(err));
    }
  };

  const excluir = async (b: Bloqueio) => {
    if (!window.confirm(`Excluir o bloqueio do ${b.secador.codigo} (${b.motivo})?`)) return;
    try {
      await apiFetch(`/bloqueios/${b.id}`, { method: 'DELETE' });
      bloqueios.recarregar();
    } catch (err) {
      setErro(textoDoErro(err));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#211E16]">Bloqueios de Secador</h1>
        <p className="text-sm text-gray-500">
          Manutenções e feriados. Nesses dias o secador não recebe erva e não conta como hora disponível.
        </p>
      </div>

      {erro && <Alerta>{erro}</Alerta>}

      {podeGerenciar && (
        <Card>
          <form onSubmit={salvar} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
            <Select label="Secador" value={form.secador_id} onChange={alterar('secador_id')} required>
              <option value="">Selecione…</option>
              {(secadores.dados ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.codigo} — {s.nome}</option>
              ))}
            </Select>
            <Input label="Início" type="date" value={form.inicio} onChange={alterar('inicio')} required />
            <Input label="Fim (inclusive)" type="date" value={form.fim} onChange={alterar('fim')} required />
            <Input label="Motivo" maxLength={255} value={form.motivo} onChange={alterar('motivo')} required />
            <Button type="submit">Bloquear</Button>
          </form>
        </Card>
      )}

      <Card>
        {bloqueios.erro && <Alerta>{bloqueios.erro}</Alerta>}
        <ItemList
          colunas={['Secador', 'Início', 'Fim', 'Motivo', 'Cadastrado por', '']}
          dados={(bloqueios.dados ?? []).map((b) => ({
            secador: b.secador.codigo,
            inicio: formatarData(b.inicio),
            fim: formatarData(b.fim),
            motivo: b.motivo,
            criado: b.criado_por.nome,
            acoes: podeGerenciar ? <Button variant="secondary" onClick={() => excluir(b)}>Excluir</Button> : null,
          }))}
          vazio={bloqueios.carregando ? 'Carregando…' : 'Nenhum bloqueio cadastrado.'}
        />
      </Card>
    </div>
  );
}
