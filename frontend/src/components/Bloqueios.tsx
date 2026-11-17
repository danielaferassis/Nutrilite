import { CircleSlash, Info, Lock, Pencil, Save, Trash2 } from 'lucide-react';
import { FormEvent, useState } from 'react';

import { apiFetch } from '../api';
import { camposAlterados } from '../edicao';
import { useFeedback } from '../feedback';
import { formatarData, hojeIso } from '../formatar';
import { useApi } from '../hooks';
import { logger } from '../logger';
import { useSessao } from '../sessao';
import { Bloqueio, Secador } from '../tipos';
import {
  Alerta,
  Button,
  CabecalhoCard,
  Card,
  Coluna,
  Etiqueta,
  EtiquetaCor,
  Input,
  Legenda,
  PageHeader,
  Select,
  Tabela,
} from './ui';

const FORM_VAZIO = { secador_id: '', inicio: '', fim: '', motivo: '' };
type FormBloqueio = typeof FORM_VAZIO;

const paraApi = (form: FormBloqueio) => ({ ...form, secador_id: Number(form.secador_id) });

const paraForm = (b: Bloqueio): FormBloqueio => ({
  secador_id: String(b.secador.id),
  inicio: b.inicio,
  fim: b.fim,
  motivo: b.motivo,
});

type Fase = 'andamento' | 'futuro' | 'encerrado';
const FASE: Record<Fase, { rotulo: string; cor: EtiquetaCor }> = {
  andamento: { rotulo: 'Em andamento', cor: 'vermelho' },
  futuro: { rotulo: 'Programado', cor: 'amarelo' },
  encerrado: { rotulo: 'Encerrado', cor: 'cinza' },
};
const fase = (b: Bloqueio, hoje: string): Fase => (b.fim < hoje ? 'encerrado' : b.inicio > hoje ? 'futuro' : 'andamento');

// Dias do bloqueio, início e fim inclusivos
const duracao = (b: Bloqueio) =>
  (Date.UTC(+b.fim.slice(0, 4), +b.fim.slice(5, 7) - 1, +b.fim.slice(8, 10)) -
    Date.UTC(+b.inicio.slice(0, 4), +b.inicio.slice(5, 7) - 1, +b.inicio.slice(8, 10))) / 86_400_000 + 1;

export default function Bloqueios() {
  const { pode } = useSessao();
  const podeGerenciar = pode('bloqueio.gerenciar');
  const hoje = hojeIso();

  const bloqueios = useApi<Bloqueio[]>('/bloqueios');
  const secadores = useApi<Secador[]>('/secadores?ativos=false');

  const [form, setForm] = useState(FORM_VAZIO);
  // Bloqueio em edição; null = formulário de novo bloqueio
  const [editando, setEditando] = useState<Bloqueio | null>(null);
  const [salvando, setSalvando] = useState(false);
  const feedback = useFeedback();

  const alterar = (campo: keyof FormBloqueio) => (e: { target: { value: string } }) =>
    setForm({ ...form, [campo]: e.target.value });

  const cancelarEdicao = () => {
    setForm(FORM_VAZIO);
    setEditando(null);
  };

  const editar = (b: Bloqueio) => {
    setForm(paraForm(b));
    setEditando(b);
    window.scrollTo?.({ top: 0, behavior: 'smooth' });
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    try {
      if (editando === null) {
        await apiFetch('/bloqueios', { method: 'POST', body: JSON.stringify(paraApi(form)) });
      } else {
        const corpo = camposAlterados(paraApi(form), paraApi(paraForm(editando)));
        await apiFetch(`/bloqueios/${editando.id}`, { method: 'PATCH', body: JSON.stringify(corpo) });
      }
      logger.info(editando === null ? 'Bloqueio cadastrado' : `Bloqueio ${editando.id} atualizado`);
      const secador = secadores.dados?.find((s) => String(s.id) === form.secador_id)?.codigo ?? 'secador';
      const titulo = editando === null ? 'Bloqueio cadastrado' : 'Bloqueio atualizado';
      cancelarEdicao();
      bloqueios.recarregar();
      feedback.sucesso(
        titulo,
        `${secador} fica indisponível de ${formatarData(form.inicio)} a ${formatarData(form.fim)}. As próximas simulações já consideram o bloqueio.`
      );
    } catch (err) {
      feedback.erro(
        editando === null ? 'Não foi possível cadastrar o bloqueio' : 'Não foi possível atualizar o bloqueio',
        err
      );
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (b: Bloqueio) => {
    const ok = await feedback.confirmar({
      titulo: 'Excluir bloqueio?',
      mensagem: `${b.secador.codigo} de ${formatarData(b.inicio)} a ${formatarData(b.fim)} (${b.motivo}). O secador volta a contar como disponível nesses dias.`,
      rotuloConfirmar: 'Excluir',
      perigo: true,
    });
    if (!ok) return;
    try {
      await apiFetch(`/bloqueios/${b.id}`, { method: 'DELETE' });
      bloqueios.recarregar();
      feedback.sucesso('Bloqueio excluído', `${b.secador.codigo} volta a ficar disponível nesse período.`);
    } catch (err) {
      feedback.erro('Não foi possível excluir o bloqueio', err);
    }
  };

  const colunas: Coluna<Bloqueio>[] = [
    {
      titulo: 'Secador',
      valor: (b) => <span className="font-semibold text-tinta">{b.secador.codigo}</span>,
      texto: (b) => b.secador.codigo,
      filtro: 'opcoes',
    },
    { titulo: 'Início', valor: (b) => formatarData(b.inicio), texto: (b) => formatarData(b.inicio), ordenar: (b) => b.inicio },
    { titulo: 'Fim', valor: (b) => formatarData(b.fim), texto: (b) => formatarData(b.fim), ordenar: (b) => b.fim },
    { titulo: 'Dias', valor: (b) => duracao(b), ordenar: (b) => duracao(b), alinhar: 'direita' },
    { titulo: 'Motivo', valor: (b) => b.motivo, texto: (b) => b.motivo },
    {
      titulo: 'Situação',
      valor: (b) => <Etiqueta cor={FASE[fase(b, hoje)].cor}>{FASE[fase(b, hoje)].rotulo}</Etiqueta>,
      texto: (b) => FASE[fase(b, hoje)].rotulo,
      filtro: 'opcoes',
    },
    { titulo: 'Cadastrado por', valor: (b) => b.criado_por.nome, texto: (b) => b.criado_por.nome, filtro: 'opcoes' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        secao="Planejamento"
        titulo="Bloqueios de Secador"
        descricao="Manutenções e feriados. Nesses dias o secador não recebe erva e não conta como hora disponível."
      />

      {podeGerenciar && (
        <Card className={editando ? 'ring-2 ring-lima-500/60' : ''}>
          <CabecalhoCard
            icone={editando ? Pencil : Lock}
            titulo={
              editando
                ? `Editar bloqueio de ${editando.secador.codigo} (${formatarData(editando.inicio)} a ${formatarData(editando.fim)})`
                : 'Novo bloqueio'
            }
          />
          <form onSubmit={salvar} className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Select label="Secador" value={form.secador_id} onChange={alterar('secador_id')} required>
              <option value="">Selecione…</option>
              {(secadores.dados ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.codigo} — {s.nome}</option>
              ))}
            </Select>
            <Input label="Início" type="date" value={form.inicio} onChange={alterar('inicio')} required />
            <Input label="Fim (inclusive)" type="date" value={form.fim} onChange={alterar('fim')} required />
            <Input label="Motivo" maxLength={255} placeholder="ex.: manutenção preventiva" value={form.motivo}
              onChange={alterar('motivo')} required />
            {editando === null ? (
              <Button type="submit" icone={CircleSlash} carregando={salvando}>Bloquear</Button>
            ) : (
              <div className="flex gap-2 [&>button]:flex-1">
                <Button type="button" variant="secondary" onClick={cancelarEdicao}>Cancelar</Button>
                <Button type="submit" icone={Save} carregando={salvando}>Salvar</Button>
              </div>
            )}
          </form>
          <div className="mt-4 flex gap-2 rounded-lg bg-fundo p-3 text-xs text-suave">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-verde-700" />
            <p>
              <b className="text-texto">Onde o bloqueio pesa:</b> nas próximas simulações do Plano de Secagem (o
              secador sai da distribuição nesses dias) e na disponibilidade do OEE (dias bloqueados não contam como
              horas disponíveis). Planos já salvos não mudam.
            </p>
          </div>
        </Card>
      )}

      <Card>
        <CabecalhoCard icone={CircleSlash} titulo="Bloqueios cadastrados" />
        {bloqueios.erro && <Alerta>{bloqueios.erro}</Alerta>}
        <Tabela
          rotulo="Bloqueios"
          colunas={colunas}
          linhas={bloqueios.dados ?? []}
          chave={(b) => b.id}
          carregando={bloqueios.carregando}
          vazio="Nenhum bloqueio cadastrado."
          classeLinha={(b) => (editando?.id === b.id ? 'bg-lima-100/50' : '')}
          acoes={
            podeGerenciar
              ? (b) => (
                  <>
                    <Button variant="secondary" tamanho="sm" icone={Pencil} compacto onClick={() => editar(b)}>Editar</Button>
                    <Button variant="secondary" tamanho="sm" icone={Trash2} compacto onClick={() => excluir(b)}>Excluir</Button>
                  </>
                )
              : undefined
          }
        />
        <Legenda
          itens={[
            { amostra: 'bg-red-600', rotulo: 'Em andamento', descricao: 'o secador está parado hoje' },
            { amostra: 'bg-amber-500', rotulo: 'Programado', descricao: 'começa depois de hoje' },
            { amostra: 'bg-cinza', rotulo: 'Encerrado', descricao: 'já passou; fica como histórico' },
          ]}
        />
      </Card>
    </div>
  );
}
