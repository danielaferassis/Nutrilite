import { Check, FlaskConical, Play, Save } from 'lucide-react';
import { FormEvent, useState } from 'react';

import { apiFetch } from '../api';
import { useFeedback } from '../feedback';
import {
  DIAS_SEMANA,
  ROTULO_STATUS,
  diasSubstituidos,
  formatarData,
  formatarDataHora,
  hojeIso,
  sobrepostos,
} from '../formatar';
import { useApi } from '../hooks';
import { logger } from '../logger';
import { useSessao } from '../sessao';
import { PlanoDetalhe, PlanoResumo, ResultadoSimulacao, StatusPlano } from '../tipos';
import PlanosSalvos from './PlanosSalvos';
import ResultadoPlano from './ResultadoPlano';
import {
  Alerta,
  Button,
  CabecalhoCard,
  Card,
  Etiqueta,
  EtiquetaCor,
  Input,
  PageHeader,
} from './ui';

const COR_STATUS: Record<StatusPlano, EtiquetaCor> = {
  rascunho: 'cinza',
  aprovado: 'verde',
  substituido: 'amarelo',
};

/** Dias de operação como botões que ligam e desligam (checkbox por baixo, para teclado e leitor de tela). */
function DiasOperacao({ dias, alternar, definir }: { dias: number[]; alternar: (d: number) => void; definir: (d: number[]) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-tinta">Dias de operação da fábrica</legend>
      <div className="flex flex-wrap items-center gap-2">
        {DIAS_SEMANA.map((rotulo, dia) => {
          const marcado = dias.includes(dia);
          return (
            <label
              key={dia}
              className={`cursor-pointer select-none rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-all duration-200 ease-suave has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-lima-500 ${
                marcado
                  ? 'border-verde-700 bg-verde-700 text-white shadow-suave'
                  : 'border-borda bg-white text-suave hover:border-verde-600 hover:text-tinta'
              }`}
            >
              <input type="checkbox" className="sr-only" checked={marcado} onChange={() => alternar(dia)} />
              {rotulo}
            </label>
          );
        })}
        <span className="mx-1 hidden h-5 w-px bg-borda sm:block" />
        {/* Atalhos: só marcam quando o usuário clica; nada vem marcado de início */}
        <button type="button" onClick={() => definir([0, 1, 2, 3, 4, 5, 6])} className="text-xs font-semibold text-verde-700 hover:underline">
          Todos
        </button>
        <button type="button" onClick={() => definir([])} className="text-xs font-semibold text-suave hover:underline">
          Limpar
        </button>
      </div>
      {dias.length === 0 && (
        <p className="mt-2 text-xs text-amber-700">
          Nenhum dia marcado: a simulação vai apontar o calendário como parâmetro ausente.
        </p>
      )}
    </fieldset>
  );
}

export default function PlanoSecagem() {
  const { pode } = useSessao();
  const podeSimular = pode('plano.simular');
  const podeAprovar = pode('plano.aprovar');

  const [inicio, setInicio] = useState(hojeIso());
  const [fim, setFim] = useState(hojeIso(6));
  // Começa vazio de propósito: dia de operação não informado vira PARAM_AUSENTE, sem supor nada
  const [dias, setDias] = useState<number[]>([]);
  const [observacao, setObservacao] = useState('');

  const [simulacao, setSimulacao] = useState<ResultadoSimulacao | null>(null);
  const [plano, setPlano] = useState<PlanoDetalhe | null>(null);
  const [ocupado, setOcupado] = useState<'simular' | 'salvar' | 'outro' | null>(null);
  const feedback = useFeedback();

  const planos = useApi<PlanoResumo[]>('/planos');

  const pedido = () => ({ inicio, fim, dias_operacao: dias.length ? dias : null });

  /** Roda a ação e, se falhar, mostra a janela de erro com `tituloErro`. */
  const executar = async (tituloErro: string, acao: () => Promise<void>, qual: 'simular' | 'salvar' | 'outro' = 'outro') => {
    setOcupado(qual);
    try {
      await acao();
    } catch (err) {
      feedback.erro(tituloErro, err);
    } finally {
      setOcupado(null);
    }
  };

  const simular = (e: FormEvent) => {
    e.preventDefault();
    // Sucesso não abre janela: o resultado aparece logo abaixo
    executar('Não foi possível simular', async () => {
      setPlano(null);
      setSimulacao(await apiFetch<ResultadoSimulacao>('/simulacoes', {
        method: 'POST',
        body: JSON.stringify(pedido()),
      }));
    }, 'simular');
  };

  const salvar = () =>
    executar('Não foi possível salvar o plano', async () => {
      const salvo = await apiFetch<PlanoDetalhe>('/planos', {
        method: 'POST',
        body: JSON.stringify({ ...pedido(), observacao: observacao.trim() || null }),
      });
      logger.info(`Plano ${salvo.id} salvo`);
      setSimulacao(null);
      setPlano(salvo);
      planos.recarregar();
      feedback.sucesso(
        'Plano salvo',
        `O plano v${salvo.versao} foi salvo como rascunho. Ele só passa a valer depois de aprovado.`
      );
    }, 'salvar');

  const abrir = (id: number) =>
    executar('Não foi possível abrir o plano', async () => {
      setSimulacao(null);
      setPlano(await apiFetch<PlanoDetalhe>(`/planos/${id}`));
    });

  const aprovar = async (p: PlanoResumo) => {
    // Mostra o que a aprovação tira de vigor antes de confirmar
    const hoje = hojeIso();
    const aprovados = (planos.dados ?? []).filter((x) => x.status === 'aprovado');
    const substituidos = sobrepostos(p, aprovados);
    const impacto = substituidos.map((x) => {
      const fase = x.fim < hoje ? 'já executado' : x.inicio <= hoje ? 'EM ANDAMENTO' : 'futuro';
      const dias = diasSubstituidos(p, x);
      const alcance = dias
        ? `só de ${formatarData(dias.de)} a ${formatarData(dias.ate)}; os outros dias continuam valendo`
        : 'por inteiro';
      return `• v${x.versao} (${formatarData(x.inicio)} a ${formatarData(x.fim)}), ${fase}: ${alcance}`;
    });
    const ok = await feedback.confirmar({
      titulo: `Aprovar o plano v${p.versao}?`,
      mensagem:
        `Horizonte: ${formatarData(p.inicio)} a ${formatarData(p.fim)}.\n\n` +
        (impacto.length
          ? `Nos dias que ele cobre, substitui:\n${impacto.join('\n')}`
          : 'Nenhum plano aprovado é afetado.'),
      rotuloConfirmar: 'Aprovar',
    });
    if (!ok) return;
    executar('Não foi possível aprovar o plano', async () => {
      setPlano(await apiFetch<PlanoDetalhe>(`/planos/${p.id}/aprovar`, { method: 'POST' }));
      planos.recarregar();
      feedback.sucesso(
        'Plano aprovado',
        `O plano v${p.versao} está em vigor e já aparece no Cronograma.` +
          (substituidos.length
            ? ` Nos dias que ele cobre, substitui: ${substituidos.map((x) => `v${x.versao}`).join(', ')}.`
            : '')
      );
    });
  };

  const excluir = async (p: PlanoResumo) => {
    const ok = await feedback.confirmar({
      titulo: 'Excluir rascunho?',
      mensagem: `O rascunho v${p.versao} (${formatarData(p.inicio)} a ${formatarData(p.fim)}) será apagado.`,
      rotuloConfirmar: 'Excluir',
      perigo: true,
    });
    if (!ok) return;
    executar('Não foi possível excluir o rascunho', async () => {
      await apiFetch(`/planos/${p.id}`, { method: 'DELETE' });
      if (plano?.id === p.id) setPlano(null);
      planos.recarregar();
      feedback.sucesso('Rascunho excluído', `O rascunho v${p.versao} foi removido.`);
    });
  };

  const alternarDia = (dia: number) =>
    setDias(dias.includes(dia) ? dias.filter((d) => d !== dia) : [...dias, dia].sort());

  const resultadoAberto = simulacao ?? plano;

  return (
    <div className="space-y-6">
      <PageHeader
        secao="Planejamento"
        titulo="Plano de Secagem"
        descricao="Cruza demandas, previsões e capacidade dos secadores e aponta conflitos antes de a erva chegar."
      />

      {podeSimular && (
        <Card className="relative overflow-hidden border-verde-700/30 bg-gradient-to-br from-white via-white to-verde-50 ring-1 ring-verde-700/10">
          <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-verde-700 to-lima-500" />
          <CabecalhoCard
            icone={FlaskConical}
            titulo="Simular"
            descricao="Escolha o período e os dias de operação. Simular não grava nada; salve como rascunho quando o resultado servir."
          />
          <form onSubmit={simular} className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Input label="Início" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} required />
              <Input label="Fim" type="date" value={fim} onChange={(e) => setFim(e.target.value)} required />
              <div className="sm:col-span-2">
                <Input
                  label="Observação (ao salvar)"
                  maxLength={500}
                  placeholder="ex.: plano com o secador 2 em manutenção"
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                />
              </div>
            </div>
            <DiasOperacao dias={dias} alternar={alternarDia} definir={setDias} />
            <div className="flex flex-col-reverse gap-3 border-t border-borda pt-4 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                tamanho="lg"
                icone={Save}
                onClick={salvar}
                carregando={ocupado === 'salvar'}
                disabled={ocupado !== null}
              >
                Simular e salvar rascunho
              </Button>
              <Button type="submit" tamanho="lg" icone={Play} carregando={ocupado === 'simular'} disabled={ocupado !== null} className="sm:min-w-40">
                Simular
              </Button>
            </div>
          </form>
        </Card>
      )}

      {resultadoAberto && (
        <section className="space-y-4 animate-entra">
          <div className="flex flex-col gap-3 border-b border-borda pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              {simulacao ? (
                <h2 className="text-xl font-bold text-tinta">
                  Resultado da simulação <span className="text-base font-medium text-suave">(não salvo)</span>
                </h2>
              ) : (
                plano && (
                  <>
                    <h2 className="flex flex-wrap items-center gap-3 text-xl font-bold text-tinta">
                      Plano v{plano.versao} · {formatarData(plano.inicio)} a {formatarData(plano.fim)}
                      <Etiqueta cor={COR_STATUS[plano.status]}>{ROTULO_STATUS[plano.status]}</Etiqueta>
                    </h2>
                    <p className="mt-1 text-sm text-suave">
                      Criado por {plano.criado_por.nome} em {formatarDataHora(plano.criado_em)}
                      {plano.aprovado_por && ` · aprovado por ${plano.aprovado_por.nome} em ${formatarDataHora(plano.aprovado_em!)}`}
                      {' · dias de operação: '}
                      {plano.parametros.dias_operacao?.map((d) => DIAS_SEMANA[d]).join(', ') ?? 'não informados'}
                      {plano.observacao && ` · ${plano.observacao}`}
                    </p>
                  </>
                )
              )}
            </div>
            {plano && !simulacao && podeAprovar && plano.status === 'rascunho' && (
              <Button icone={Check} onClick={() => aprovar(plano)} disabled={ocupado !== null}>
                Aprovar plano
              </Button>
            )}
          </div>
          {simulacao ? (
            <ResultadoPlano resultado={simulacao} />
          ) : (
            plano && <ResultadoPlano resultado={plano} nomeArquivo={`plano-v${plano.versao}`} />
          )}
        </section>
      )}

      {planos.erro && <Alerta>{planos.erro}</Alerta>}
      <PlanosSalvos
        planos={planos.dados}
        carregando={planos.carregando}
        hoje={hojeIso()}
        abertoId={simulacao ? undefined : plano?.id}
        podeAprovar={podeAprovar}
        podeExcluir={podeSimular}
        aoVer={(p) => abrir(p.id)}
        aoAprovar={aprovar}
        aoExcluir={excluir}
      />
    </div>
  );
}
