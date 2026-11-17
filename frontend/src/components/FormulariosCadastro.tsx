import { Factory, Gauge, Leaf, LucideIcon, Save, Trash2 } from 'lucide-react';
import { FormEvent, ReactNode, useState } from 'react';

import { apiFetch } from '../api';
import { camposAlterados } from '../edicao';
import { useFeedback } from '../feedback';
import { logger } from '../logger';
import { Capacidade, Erva, Rendimento, Secador } from '../tipos';
import { Button, Input, Janela, Select } from './ui';

// Campo vazio = "não informado" (null). Nunca vira zero: a simulação acusa PARAM_AUSENTE.
// Os placeholders ("ex.: …") são só exemplo de formato e nunca são enviados.
const texto = (v: string | number | boolean | null) => (v === null ? '' : String(v));
const decimalOuNulo = (v: string) => (v.trim() === '' ? null : v.trim());
const inteiroOuNulo = (v: string) => (v.trim() === '' ? null : Number(v));
const simNaoOuNulo = (v: string) => (v === '' ? null : v === 'true');

const AVISO_VAZIO = 'Campo vazio fica como "não informado": a simulação aponta a falta, sem assumir valor.';

/** Janela (popup) com o formulário de cadastro. */
function Moldura({
  titulo,
  icone,
  aoCancelar,
  children,
}: {
  titulo: string;
  icone: LucideIcon;
  aoCancelar: () => void;
  children: ReactNode;
}) {
  return (
    <Janela titulo={titulo} descricao={AVISO_VAZIO} icone={icone} aoFechar={aoCancelar} largura="xl">
      {children}
    </Janela>
  );
}

/** Campo com uma linha de ajuda embaixo (o que é e como medir). */
function Ajuda({ children, texto: ajuda }: { children: ReactNode; texto: string }) {
  return (
    <div>
      {children}
      <p className="mt-1 text-xs text-suave">{ajuda}</p>
    </div>
  );
}

/** Subtítulo que separa grupos de campos dentro do formulário. */
function Grupo({ titulo }: { titulo: string }) {
  return (
    <p className="border-b border-borda pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-suave md:col-span-3">
      {titulo}
    </p>
  );
}

function Botoes({ salvando, aoCancelar, extra }: { salvando: boolean; aoCancelar: () => void; extra?: ReactNode }) {
  return (
    <div className="mt-2 flex flex-col-reverse gap-2 border-t border-borda pt-4 sm:flex-row sm:justify-end md:col-span-3">
      {extra && <div className="sm:mr-auto [&>button]:w-full sm:[&>button]:w-auto">{extra}</div>}
      <Button type="button" variant="secondary" onClick={aoCancelar}>Cancelar</Button>
      <Button type="submit" icone={Save} carregando={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</Button>
    </div>
  );
}

interface PropsFormulario {
  aoSalvar: () => void;
  aoCancelar: () => void;
}

// --- Erva (com o rendimento, que é um por erva) ---

const formErva = (erva: Erva | null, rendimento: Rendimento | null) => ({
  codigo: erva?.codigo ?? '',
  nome: erva?.nome ?? '',
  ativo: String(erva?.ativo ?? true),
  regime_horas_dia: texto(erva?.regime_horas_dia ?? null),
  espera_maxima_dias: texto(erva?.espera_maxima_dias ?? null),
  fresco_por_desidratado: texto(rendimento?.fresco_por_desidratado ?? null),
  desidratado_por_moido: texto(rendimento?.desidratado_por_moido ?? null),
});
type FormErva = ReturnType<typeof formErva>;

const ervaParaApi = (f: FormErva) => ({
  codigo: f.codigo,
  nome: f.nome,
  ativo: f.ativo === 'true',
  regime_horas_dia: decimalOuNulo(f.regime_horas_dia),
  espera_maxima_dias: inteiroOuNulo(f.espera_maxima_dias),
});

const rendimentoParaApi = (f: FormErva) => ({
  fresco_por_desidratado: decimalOuNulo(f.fresco_por_desidratado),
  desidratado_por_moido: decimalOuNulo(f.desidratado_por_moido),
});

export function FormularioErva({
  erva,
  rendimento,
  aoSalvar,
  aoCancelar,
}: PropsFormulario & { erva: Erva | null; rendimento: Rendimento | null }) {
  const original = formErva(erva, rendimento);
  const [form, setForm] = useState(original);
  const [salvando, setSalvando] = useState(false);
  const feedback = useFeedback();

  const alterar = (campo: keyof FormErva) => (e: { target: { value: string } }) =>
    setForm({ ...form, [campo]: e.target.value });

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    let ervaSalva = false;
    try {
      let ervaId: number;
      if (erva === null) {
        ervaId = (await apiFetch<Erva>('/ervas', { method: 'POST', body: JSON.stringify(ervaParaApi(form)) })).id;
      } else {
        ervaId = erva.id;
        const corpo = camposAlterados(ervaParaApi(form), ervaParaApi(original));
        if (Object.keys(corpo).length) {
          await apiFetch(`/ervas/${erva.id}`, { method: 'PATCH', body: JSON.stringify(corpo) });
        }
      }
      ervaSalva = true;

      const novoRendimento = rendimentoParaApi(form);
      if (rendimento) {
        const corpo = camposAlterados(novoRendimento, rendimentoParaApi(original));
        if (Object.keys(corpo).length) {
          await apiFetch(`/rendimentos/${rendimento.id}`, { method: 'PATCH', body: JSON.stringify(corpo) });
        }
      } else if (novoRendimento.fresco_por_desidratado !== null || novoRendimento.desidratado_por_moido !== null) {
        await apiFetch('/rendimentos', { method: 'POST', body: JSON.stringify({ erva_id: ervaId, ...novoRendimento }) });
      }

      logger.info(`Erva ${ervaId} salva`);
      aoSalvar();
      feedback.sucesso(erva === null ? 'Erva cadastrada' : 'Erva atualizada', `${form.nome} (${form.codigo.trim().toUpperCase()}).`);
    } catch (err) {
      if (ervaSalva) {
        // A erva já foi gravada: fecha o formulário para não cadastrar de novo
        aoSalvar();
        feedback.erro('A erva foi salva, mas o rendimento não', err);
      } else {
        feedback.erro(erva === null ? 'Não foi possível cadastrar a erva' : 'Não foi possível atualizar a erva', err);
      }
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Moldura titulo={erva === null ? 'Nova erva' : `Editar ${erva.nome}`} icone={Leaf} aoCancelar={aoCancelar}>
      <form onSubmit={salvar} className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Grupo titulo="Identificação" />
        <Input label="Código" maxLength={50} placeholder="ex.: ERVA-X" value={form.codigo} onChange={alterar('codigo')} required />
        <Input label="Nome" maxLength={150} placeholder="ex.: Erva X" value={form.nome} onChange={alterar('nome')} required />
        <Select label="Situação" value={form.ativo} onChange={alterar('ativo')}>
          <option value="true">Ativa</option>
          <option value="false">Inativa (fora do planejamento)</option>
        </Select>

        <Grupo titulo="Regime de secagem" />
        <Ajuda texto="Horas por dia em que a erva pode secar (24 = dia inteiro).">
          <Input label="Regime (horas por dia)" type="number" min="0.01" max="24" step="0.01" placeholder="ex.: 12"
            value={form.regime_horas_dia} onChange={alterar('regime_horas_dia')} />
        </Ajuda>
        <Ajuda texto="Dias que o fresco aguenta esperando secador; depois disso é perda.">
          <Input label="Espera máxima do fresco (dias)" type="number" min="0" step="1" placeholder="ex.: 3"
            value={form.espera_maxima_dias} onChange={alterar('espera_maxima_dias')} />
        </Ajuda>
        <div className="hidden md:block" />

        <Grupo titulo="Rendimento (cálculo reverso da demanda)" />
        <Ajuda texto="Quantos kg de erva fresca viram 1 kg de desidratado.">
          <Input label="Kg de fresco para 1 kg desidratado" type="number" min="0.0001" step="0.0001" placeholder="ex.: 6,5"
            value={form.fresco_por_desidratado} onChange={alterar('fresco_por_desidratado')} />
        </Ajuda>
        <Ajuda texto="Quantos kg de desidratado viram 1 kg de moído (produto acabado).">
          <Input label="Kg desidratado para 1 kg moído" type="number" min="0.0001" step="0.0001" placeholder="ex.: 1,1"
            value={form.desidratado_por_moido} onChange={alterar('desidratado_por_moido')} />
        </Ajuda>
        <Botoes salvando={salvando} aoCancelar={aoCancelar} />
      </form>
    </Moldura>
  );
}

// --- Secador ---

const formSecador = (s: Secador | null) => ({
  codigo: s?.codigo ?? '',
  nome: s?.nome ?? '',
  codigo_infinity: s?.codigo_infinity ?? '',
  ativo: String(s?.ativo ?? true),
});
type FormSecador = ReturnType<typeof formSecador>;
const secadorParaApi = (f: FormSecador) => ({
  codigo: f.codigo,
  nome: f.nome,
  // Vazio = sem vínculo com o Infinity
  codigo_infinity: f.codigo_infinity.trim() || null,
  ativo: f.ativo === 'true',
});

export function FormularioSecador({ secador, aoSalvar, aoCancelar }: PropsFormulario & { secador: Secador | null }) {
  const original = formSecador(secador);
  const [form, setForm] = useState(original);
  const [salvando, setSalvando] = useState(false);
  const feedback = useFeedback();

  const alterar = (campo: keyof FormSecador) => (e: { target: { value: string } }) =>
    setForm({ ...form, [campo]: e.target.value });

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    try {
      if (secador === null) {
        await apiFetch('/secadores', { method: 'POST', body: JSON.stringify(secadorParaApi(form)) });
      } else {
        const corpo = camposAlterados(secadorParaApi(form), secadorParaApi(original));
        await apiFetch(`/secadores/${secador.id}`, { method: 'PATCH', body: JSON.stringify(corpo) });
      }
      logger.info(secador === null ? 'Secador cadastrado' : `Secador ${secador.id} atualizado`);
      aoSalvar();
      feedback.sucesso(secador === null ? 'Secador cadastrado' : 'Secador atualizado', `${form.codigo.trim().toUpperCase()}: ${form.nome}.`);
    } catch (err) {
      feedback.erro(secador === null ? 'Não foi possível cadastrar o secador' : 'Não foi possível atualizar o secador', err);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Moldura titulo={secador === null ? 'Novo secador' : `Editar ${secador.codigo}`} icone={Factory} aoCancelar={aoCancelar}>
      <form onSubmit={salvar} className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Input label="Código" maxLength={50} placeholder="ex.: SEC-9" value={form.codigo} onChange={alterar('codigo')} required />
        <Input label="Nome" maxLength={150} placeholder="ex.: Secador de bandejas 9" value={form.nome} onChange={alterar('nome')} required />
        <Select label="Situação" value={form.ativo} onChange={alterar('ativo')}>
          <option value="true">Ativo</option>
          <option value="false">Inativo (fora do planejamento)</option>
        </Select>
        <div className="md:col-span-3">
          <Ajuda texto="Liga os apontamentos importados do Infinity a este secador. Vazio: os apontamentos dele não são importados.">
            <Input
              label="Código no Infinity"
              maxLength={150}
              placeholder="Como aparece na coluna Processo, ex.: SB-09-Secador Bandejas"
              value={form.codigo_infinity}
              onChange={alterar('codigo_infinity')}
            />
          </Ajuda>
        </div>
        <Botoes salvando={salvando} aoCancelar={aoCancelar} />
      </form>
    </Moldura>
  );
}

// --- Capacidade (erva × secador) ---

const formCapacidade = (c: Capacidade | null) => ({
  modo: c?.modo ?? '',
  kg_fresco_por_hora: texto(c?.kg_fresco_por_hora ?? null),
  kg_por_carga: texto(c?.kg_por_carga ?? null),
  horas_por_carga: texto(c?.horas_por_carga ?? null),
  setup_inicial_h: texto(c?.setup_inicial_h ?? null),
  setup_final_h: texto(c?.setup_final_h ?? null),
  setup_diario_h: texto(c?.setup_diario_h ?? null),
  setup_dentro_do_regime: texto(c?.setup_dentro_do_regime ?? null),
  prioridade: texto(c?.prioridade ?? null),
});
type FormCapacidade = ReturnType<typeof formCapacidade>;

const capacidadeParaApi = (f: FormCapacidade) => ({
  modo: f.modo === '' ? null : f.modo,
  kg_fresco_por_hora: decimalOuNulo(f.kg_fresco_por_hora),
  kg_por_carga: decimalOuNulo(f.kg_por_carga),
  horas_por_carga: decimalOuNulo(f.horas_por_carga),
  setup_inicial_h: decimalOuNulo(f.setup_inicial_h),
  setup_final_h: decimalOuNulo(f.setup_final_h),
  setup_diario_h: decimalOuNulo(f.setup_diario_h),
  setup_dentro_do_regime: simNaoOuNulo(f.setup_dentro_do_regime),
  prioridade: inteiroOuNulo(f.prioridade),
});

export function FormularioCapacidade({
  erva,
  secador,
  capacidade,
  aoSalvar,
  aoCancelar,
}: PropsFormulario & { erva: Erva; secador: Secador; capacidade: Capacidade | null }) {
  const original = formCapacidade(capacidade);
  const [form, setForm] = useState(original);
  const [salvando, setSalvando] = useState(false);
  const feedback = useFeedback();
  const par = `${erva.nome} no ${secador.codigo}`;

  const alterar = (campo: keyof FormCapacidade) => (e: { target: { value: string } }) =>
    setForm({ ...form, [campo]: e.target.value });

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    try {
      if (capacidade === null) {
        const corpo = { erva_id: erva.id, secador_id: secador.id, ...capacidadeParaApi(form) };
        await apiFetch('/capacidades', { method: 'POST', body: JSON.stringify(corpo) });
      } else {
        const corpo = camposAlterados(capacidadeParaApi(form), capacidadeParaApi(original));
        await apiFetch(`/capacidades/${capacidade.id}`, { method: 'PATCH', body: JSON.stringify(corpo) });
      }
      logger.info(`Capacidade de ${erva.codigo} × ${secador.codigo} salva`);
      aoSalvar();
      feedback.sucesso('Capacidade salva', `${par}. As próximas simulações já usam os novos parâmetros.`);
    } catch (err) {
      feedback.erro('Não foi possível salvar a capacidade', err);
    } finally {
      setSalvando(false);
    }
  };

  const remover = async () => {
    if (!capacidade) return;
    const ok = await feedback.confirmar({
      titulo: 'Remover capacidade?',
      mensagem: `${par} deixa de operar: a simulação não manda mais essa erva para esse secador. Planos já salvos não mudam.`,
      rotuloConfirmar: 'Remover',
      perigo: true,
    });
    if (!ok) return;
    try {
      await apiFetch(`/capacidades/${capacidade.id}`, { method: 'DELETE' });
      logger.info(`Capacidade ${capacidade.id} removida`);
      aoSalvar();
      feedback.sucesso('Capacidade removida', `${par} não opera mais.`);
    } catch (err) {
      feedback.erro('Não foi possível remover a capacidade', err);
    }
  };

  return (
    <Moldura titulo={`Capacidade: ${par}`} icone={Gauge} aoCancelar={aoCancelar}>
      <form onSubmit={salvar} className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Grupo titulo="Ritmo de secagem" />
        <Ajuda texto="Por carga: enche, seca e esvazia. Contínuo: a erva passa pelo secador numa vazão constante.">
          <Select label="Modo de secagem" value={form.modo} onChange={alterar('modo')}>
            <option value="">Não informado</option>
            <option value="por_carga">Por carga</option>
            <option value="continuo">Contínuo</option>
          </Select>
        </Ajuda>
        {form.modo === 'continuo' ? (
          <>
            <Ajuda texto="Quantos kg de erva fresca o secador processa por hora.">
              <Input label="Vazão (kg de fresco por hora)" type="number" min="0.001" step="0.001" placeholder="ex.: 80"
                value={form.kg_fresco_por_hora} onChange={alterar('kg_fresco_por_hora')} />
            </Ajuda>
            <div className="hidden md:block" />
          </>
        ) : (
          <>
            <Ajuda texto="Kg de erva fresca que cabem numa carga do secador.">
              <Input label="Kg de fresco por carga" type="number" min="0.001" step="0.001" placeholder="ex.: 250"
                value={form.kg_por_carga} onChange={alterar('kg_por_carga')} />
            </Ajuda>
            <Ajuda texto="Tempo de secagem de uma carga, do início ao fim.">
              <Input label="Horas por carga" type="number" min="0.01" step="0.01" placeholder="ex.: 6"
                value={form.horas_por_carga} onChange={alterar('horas_por_carga')} />
            </Ajuda>
          </>
        )}

        <Grupo titulo="Setups (horas paradas para preparo e limpeza)" />
        <Ajuda texto="Preparo do secador ao começar a campanha desta erva.">
          <Input label="Setup inicial (h)" type="number" min="0" step="0.01" placeholder="ex.: 1,5"
            value={form.setup_inicial_h} onChange={alterar('setup_inicial_h')} />
        </Ajuda>
        <Ajuda texto="Limpeza ao encerrar a campanha (antes de trocar de erva).">
          <Input label="Setup final / limpeza (h)" type="number" min="0" step="0.01" placeholder="ex.: 2"
            value={form.setup_final_h} onChange={alterar('setup_final_h')} />
        </Ajuda>
        {/* Na tabela do PCP é a coluna "Interv": 1 vez por dia */}
        <Ajuda texto='Parada de todo dia de operação (coluna "Interv" da planilha do PCP).'>
          <Input label="Setup diário / Interv (h)" type="number" min="0" step="0.01" placeholder="ex.: 0,5"
            value={form.setup_diario_h} onChange={alterar('setup_diario_h')} />
        </Ajuda>
        <Ajuda texto="Sim: o setup consome horas do regime da erva. Não: acontece fora dele.">
          <Select label="Setup dentro do regime?" value={form.setup_dentro_do_regime} onChange={alterar('setup_dentro_do_regime')}>
            <option value="">Não informado</option>
            <option value="true">Sim (desconta das horas do turno)</option>
            <option value="false">Não (fora do turno)</option>
          </Select>
        </Ajuda>

        <Grupo titulo="Preferência" />
        <Ajuda texto="Ordem de escolha entre secadores para esta erva. Vazio: vai para o de maior capacidade no dia.">
          <Input label="Prioridade (menor = preferido; vazio = sem preferência)" type="number" min="0" step="1" placeholder="ex.: 1"
            value={form.prioridade} onChange={alterar('prioridade')} />
        </Ajuda>
        <Botoes
          salvando={salvando}
          aoCancelar={aoCancelar}
          extra={capacidade && (
            <Button type="button" variant="danger" icone={Trash2} onClick={remover}>Remover (não opera)</Button>
          )}
        />
      </form>
    </Moldura>
  );
}
