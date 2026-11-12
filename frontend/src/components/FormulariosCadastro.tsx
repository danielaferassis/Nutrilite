import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';

import { apiFetch } from '../api';
import { camposAlterados } from '../edicao';
import { useFeedback } from '../feedback';
import { logger } from '../logger';
import { Capacidade, Erva, Rendimento, Secador } from '../tipos';
import { Button, Card, Input, Select } from './ui';

// Campo vazio = "não informado" (null). Nunca vira zero: a simulação acusa PARAM_AUSENTE
const texto = (v: string | number | boolean | null) => (v === null ? '' : String(v));
const decimalOuNulo = (v: string) => (v.trim() === '' ? null : v.trim());
const inteiroOuNulo = (v: string) => (v.trim() === '' ? null : Number(v));
const simNaoOuNulo = (v: string) => (v === '' ? null : v === 'true');

const AVISO_VAZIO = 'Campo vazio fica como "não informado": a simulação aponta a falta, sem assumir valor.';

function Moldura({ titulo, children }: { titulo: string; children: ReactNode }) {
  // O formulário abre acima da matriz: rola até ele quando o "editar" foi clicado lá embaixo
  const ref = useRef<HTMLDivElement>(null);
  // Com chaves: no Chromium recente scrollIntoView devolve uma Promise, e o React
  // trataria esse retorno como função de limpeza (erro "destroy is not a function")
  useEffect(() => {
    ref.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, []);
  return (
    <div ref={ref}>
      <Card>
        <h2 className="text-lg font-semibold">{titulo}</h2>
        <p className="text-xs text-gray-500 mb-4">{AVISO_VAZIO}</p>
        {children}
      </Card>
    </div>
  );
}

function Botoes({ salvando, aoCancelar, extra }: { salvando: boolean; aoCancelar: () => void; extra?: ReactNode }) {
  return (
    <div className="md:col-span-3 flex flex-wrap gap-3 justify-end">
      {extra}
      <Button type="button" variant="secondary" onClick={aoCancelar}>Cancelar</Button>
      <Button type="submit" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</Button>
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
    <Moldura titulo={erva === null ? 'Nova erva' : `Editar ${erva.nome}`}>
      <form onSubmit={salvar} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Input label="Código" maxLength={50} value={form.codigo} onChange={alterar('codigo')} required />
        <Input label="Nome" maxLength={150} value={form.nome} onChange={alterar('nome')} required />
        <Select label="Situação" value={form.ativo} onChange={alterar('ativo')}>
          <option value="true">Ativa</option>
          <option value="false">Inativa (fora do planejamento)</option>
        </Select>
        <Input label="Regime (horas por dia)" type="number" min="0.01" max="24" step="0.01"
          value={form.regime_horas_dia} onChange={alterar('regime_horas_dia')} />
        <Input label="Espera máxima do fresco (dias)" type="number" min="0" step="1"
          value={form.espera_maxima_dias} onChange={alterar('espera_maxima_dias')} />
        <div />
        <Input label="Kg de fresco para 1 kg desidratado" type="number" min="0.0001" step="0.0001"
          value={form.fresco_por_desidratado} onChange={alterar('fresco_por_desidratado')} />
        <Input label="Kg desidratado para 1 kg moído" type="number" min="0.0001" step="0.0001"
          value={form.desidratado_por_moido} onChange={alterar('desidratado_por_moido')} />
        <Botoes salvando={salvando} aoCancelar={aoCancelar} />
      </form>
    </Moldura>
  );
}

// --- Secador ---

const formSecador = (s: Secador | null) => ({ codigo: s?.codigo ?? '', nome: s?.nome ?? '', ativo: String(s?.ativo ?? true) });
type FormSecador = ReturnType<typeof formSecador>;
const secadorParaApi = (f: FormSecador) => ({ codigo: f.codigo, nome: f.nome, ativo: f.ativo === 'true' });

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
    <Moldura titulo={secador === null ? 'Novo secador' : `Editar ${secador.codigo}`}>
      <form onSubmit={salvar} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Input label="Código" maxLength={50} value={form.codigo} onChange={alterar('codigo')} required />
        <Input label="Nome" maxLength={150} value={form.nome} onChange={alterar('nome')} required />
        <Select label="Situação" value={form.ativo} onChange={alterar('ativo')}>
          <option value="true">Ativo</option>
          <option value="false">Inativo (fora do planejamento)</option>
        </Select>
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
    <Moldura titulo={`Capacidade: ${par}`}>
      <form onSubmit={salvar} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Select label="Modo de secagem" value={form.modo} onChange={alterar('modo')}>
          <option value="">Não informado</option>
          <option value="por_carga">Por carga</option>
          <option value="continuo">Contínuo</option>
        </Select>
        {form.modo === 'continuo' ? (
          <>
            <Input label="Vazão (kg de fresco por hora)" type="number" min="0.001" step="0.001"
              value={form.kg_fresco_por_hora} onChange={alterar('kg_fresco_por_hora')} />
            <div />
          </>
        ) : (
          <>
            <Input label="Kg de fresco por carga" type="number" min="0.001" step="0.001"
              value={form.kg_por_carga} onChange={alterar('kg_por_carga')} />
            <Input label="Horas por carga" type="number" min="0.01" step="0.01"
              value={form.horas_por_carga} onChange={alterar('horas_por_carga')} />
          </>
        )}
        <Input label="Setup inicial (h)" type="number" min="0" step="0.01"
          value={form.setup_inicial_h} onChange={alterar('setup_inicial_h')} />
        <Input label="Setup final / limpeza (h)" type="number" min="0" step="0.01"
          value={form.setup_final_h} onChange={alterar('setup_final_h')} />
        {/* Na tabela do PCP é a coluna "Interv": 1 vez por dia */}
        <Input label="Setup diário / Interv (h)" type="number" min="0" step="0.01"
          value={form.setup_diario_h} onChange={alterar('setup_diario_h')} />
        <Select label="Setup dentro do regime?" value={form.setup_dentro_do_regime} onChange={alterar('setup_dentro_do_regime')}>
          <option value="">Não informado</option>
          <option value="true">Sim (desconta das horas do turno)</option>
          <option value="false">Não (fora do turno)</option>
        </Select>
        <Input label="Prioridade (menor = preferido; vazio = sem preferência)" type="number" min="0" step="1"
          value={form.prioridade} onChange={alterar('prioridade')} />
        <div />
        <Botoes
          salvando={salvando}
          aoCancelar={aoCancelar}
          extra={capacidade && (
            <Button type="button" variant="danger" onClick={remover}>Remover (não opera)</Button>
          )}
        />
      </form>
    </Moldura>
  );
}
