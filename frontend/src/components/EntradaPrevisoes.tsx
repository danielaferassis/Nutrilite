import { CalendarClock, ListChecks, PackageCheck, Pencil, Plus, Sprout, Trash2 } from 'lucide-react';
import { FormEvent, useState } from 'react';

import { apiFetch, query } from '../api';
import { camposAlterados } from '../edicao';
import { useFeedback } from '../feedback';
import { ROTULO_ORIGEM, formatarData, formatarKg, hojeIso } from '../formatar';
import { useApi } from '../hooks';
import { logger } from '../logger';
import { useSessao } from '../sessao';
import { Erva, Origem, Previsao } from '../tipos';
import ImportacaoPrevisoes from './ImportacaoPrevisoes';
import {
  Alerta,
  Button,
  CabecalhoCard,
  Card,
  Etiqueta,
  Input,
  Janela,
  KpiCard,
  PageHeader,
  Select,
  Tabela,
} from './ui';

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

const origemTexto = (p: Previsao) => ROTULO_ORIGEM[p.origem];

export default function EntradaPrevisoes() {
  const { sessao, pode } = useSessao();
  const podeGerenciarTodas = pode('previsao.gerenciar');
  const podeCadastrar = pode('previsao.gerenciar', 'previsao.propria');

  // Filtros que vão ao servidor; os filtros por coluna ficam na própria tabela
  const [filtro, setFiltro] = useState({ origem: '', chegada_de: '', chegada_ate: '' });
  const previsoes = useApi<Previsao[]>(`/previsoes${query(filtro)}`);
  const ervas = useApi<Erva[]>('/ervas');

  const [form, setForm] = useState(FORM_VAZIO);
  // Janela do registro manual aberta; `editando` null = previsão nova
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<Previsao | null>(null);
  const [salvando, setSalvando] = useState(false);
  const feedback = useFeedback();

  const alterar = (campo: keyof FormPrevisao) => (e: { target: { value: string } }) =>
    setForm({ ...form, [campo]: e.target.value });

  const fechar = () => {
    setForm(FORM_VAZIO);
    setEditando(null);
    setAberto(false);
  };

  const nova = () => {
    setForm(FORM_VAZIO);
    setEditando(null);
    setAberto(true);
  };

  const editar = (p: Previsao) => {
    setForm(paraForm(p));
    setEditando(p);
    setAberto(true);
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setSalvando(true);
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
      const mensagem = `${formatarKg(form.kg_fresco)} de ${erva} com chegada em ${formatarData(form.data_chegada)}. Ela já entra nas próximas simulações.`;
      fechar();
      previsoes.recarregar();
      feedback.sucesso(titulo, mensagem);
    } catch (err) {
      feedback.erro(
        editando === null ? 'Não foi possível cadastrar a previsão' : 'Não foi possível atualizar a previsão',
        err
      );
    } finally {
      setSalvando(false);
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
      <>
        <Button variant="secondary" tamanho="sm" icone={Pencil} compacto onClick={() => editar(p)}>Editar</Button>
        <Button variant="secondary" tamanho="sm" icone={Trash2} compacto onClick={() => excluir(p)}>Excluir</Button>
      </>
    );
  };

  // Contagens (não soma kg: ervas diferentes não se somam)
  const lista = previsoes.dados ?? [];
  const hoje = hojeIso();
  const semana = hojeIso(7);
  const proximas = lista.filter((p) => p.data_chegada >= hoje && p.data_chegada <= semana).length;
  const recebidas = lista.filter((p) => p.recebida).length;

  return (
    <div className="space-y-6">
      <PageHeader
        secao="Planejamento"
        titulo="Entrada de Previsões"
        ajuda={[
          'Cada previsão é um lote de erva fresca que vai chegar: erva, origem, kg e data. Essa é a oferta que o Plano de Secagem distribui.',
          'Para a fazenda, importe a planilha de programação: você vê o que será criado, alterado e removido antes de confirmar.',
          'Para lotes avulsos (Procompete, P&D), use "Nova previsão".',
          'A data de chegada não é reagendável: o que não couber nos secadores dentro da espera máxima vira perda. Previsão já recebida fica travada; corrija o recebimento no Cronograma.',
        ]}
        descricao="Lotes de erva fresca que vão chegar (fazenda, Procompete, P&D). São a oferta que o Plano de Secagem distribui entre os secadores."
        acoes={
          podeCadastrar && (
            <Button icone={Plus} onClick={nova}>Nova previsão</Button>
          )
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard icone={ListChecks} titulo="Previsões listadas" valor={lista.length} detalhe="com os filtros de período e origem" />
        <KpiCard icone={CalendarClock} titulo="Chegam em 7 dias" valor={proximas} detalhe="a data de chegada não é reagendável" />
        <KpiCard icone={PackageCheck} titulo="Já recebidas" valor={recebidas} detalhe="travadas: corrija no Cronograma" />
      </div>

      <Card className={podeGerenciarTodas ? '' : 'bg-fundo'}>
        {podeGerenciarTodas ? (
          <ImportacaoPrevisoes ervas={ervas.dados ?? []} aoImportar={previsoes.recarregar} />
        ) : (
          <div className="p-2 text-center">
            <h3 className="mb-1 font-medium text-tinta">Importar planilha de programação</h3>
            <p className="text-sm text-suave">A importação da planilha é feita pelo PCP.</p>
          </div>
        )}
      </Card>

      <Card>
        <CabecalhoCard icone={Sprout} titulo="Previsões cadastradas" descricao="O ID é a referência fixa da previsão: não muda quando outra é excluída." />
        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
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
        <Tabela
          linhas={lista}
          chave={(p) => p.id}
          carregando={previsoes.carregando}
          vazio="Nenhuma previsão cadastrada."
          acoes={acoes}
          colunas={[
            { titulo: 'ID', valor: (p) => <span className="font-medium text-suave">#{p.id}</span>, texto: (p) => `#${p.id}`, ordenar: (p) => p.id },
            { titulo: 'Matéria-prima', valor: (p) => <span className="font-semibold text-tinta">{p.erva.nome}</span>, texto: (p) => p.erva.nome, filtro: 'opcoes' },
            {
              titulo: 'Origem',
              valor: (p) => (
                <>
                  {origemTexto(p)}
                  {p.talhao && <span className="block text-xs text-suave">{p.talhao}</span>}
                </>
              ),
              texto: origemTexto,
              filtro: 'opcoes',
            },
            { titulo: 'Chegada', valor: (p) => formatarData(p.data_chegada), texto: (p) => formatarData(p.data_chegada), ordenar: (p) => p.data_chegada },
            {
              titulo: 'Quantidade (fresco)',
              valor: (p) => formatarKg(p.kg_fresco),
              texto: (p) => formatarKg(p.kg_fresco),
              ordenar: (p) => Number(p.kg_fresco),
              alinhar: 'direita',
            },
            { titulo: 'Cadastrada por', valor: (p) => p.criado_por.nome, texto: (p) => p.criado_por.nome, filtro: 'opcoes' },
          ]}
        />
      </Card>

      {aberto && (
        <Janela
          titulo={editando === null ? 'Registro manual' : `Editar previsão #${editando.id}`}
          descricao="Um lote de erva fresca previsto para chegar."
          icone={Sprout}
          largura="md"
          aoFechar={fechar}
        >
          <form onSubmit={salvar} className="space-y-4">
            <Select id="previsao-erva" label="Matéria-prima" value={form.erva_id} onChange={alterar('erva_id')} required>
              <option value="">Selecione…</option>
              {(ervas.dados ?? []).map((erva) => (
                <option key={erva.id} value={erva.id}>{erva.nome}</option>
              ))}
              {/* A lista só traz ervas ativas; a da previsão em edição pode ter sido desativada */}
              {editando && !ervas.dados?.some((x) => x.id === editando.erva.id) && (
                <option value={editando.erva.id}>{editando.erva.nome} (inativa)</option>
              )}
            </Select>
            <Select id="previsao-origem" label="Origem" value={form.origem} onChange={alterar('origem')} required>
              <option value="">Selecione…</option>
              {Object.entries(ROTULO_ORIGEM).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>{rotulo}</option>
              ))}
            </Select>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Quantidade de erva fresca (kg)" type="number" min="0.001" step="0.001" placeholder="ex.: 800"
                value={form.kg_fresco} onChange={alterar('kg_fresco')} required />
              <Input label="Data prevista de chegada" type="date" value={form.data_chegada}
                onChange={alterar('data_chegada')} required />
            </div>
            <Input label="Observação" maxLength={500} value={form.observacao} onChange={alterar('observacao')} />
            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" onClick={fechar}>Cancelar</Button>
              <Button type="submit" carregando={salvando}>
                {editando === null ? 'Salvar previsão' : 'Salvar alterações'}
              </Button>
            </div>
          </form>
        </Janela>
      )}
    </div>
  );
}
