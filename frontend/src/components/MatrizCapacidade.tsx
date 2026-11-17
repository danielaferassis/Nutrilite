import { CircleSlash, Factory, FilterX, Grid3x3, Leaf, Pencil, Plus, Search, Sprout, TriangleAlert } from 'lucide-react';
import { ReactNode, useCallback, useMemo, useState } from 'react';

import { formatarHoras, formatarNumero } from '../formatar';
import { useApi } from '../hooks';
import { useSessao } from '../sessao';
import { Capacidade, Erva, Rendimento, Secador } from '../tipos';
import { FormularioCapacidade, FormularioErva, FormularioSecador } from './FormulariosCadastro';
import { Alerta, Button, Card, Etiqueta, Input, KpiCard, Legenda, PageHeader, Select, SkeletonTabela } from './ui';

// Campo nulo = não informado. Nunca mostrar como zero: o motor gera PARAM_AUSENTE
const valor = (v: string | number | null, formatar: (x: string | number) => string) =>
  v === null ? <span className="font-semibold text-amber-700">não informado</span> : formatar(v);

/** Par erva × secador com algum parâmetro que a simulação exige ainda vazio. */
const capacidadeIncompleta = (c: Capacidade) =>
  c.modo === null ||
  (c.modo === 'continuo' ? c.kg_fresco_por_hora === null : c.kg_por_carga === null || c.horas_por_carga === null) ||
  c.setup_inicial_h === null ||
  c.setup_final_h === null ||
  c.setup_diario_h === null ||
  c.setup_dentro_do_regime === null;

/** Erva com regime, espera máxima ou rendimento vazio. */
const ervaIncompleta = (e: Erva, r: Rendimento | null) =>
  e.regime_horas_dia === null ||
  e.espera_maxima_dias === null ||
  r?.fresco_por_desidratado == null ||
  r?.desidratado_por_moido == null;

type Situacao = '' | 'incompleta' | 'completa' | 'nao_opera';

// Linha "rótulo → valor" com divisória, usada nos blocos da erva e do secador
function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-suave">{rotulo}</dt>
      <dd className="text-right font-medium text-tinta">{children}</dd>
    </div>
  );
}

function Parametros({ cap }: { cap: Capacidade }) {
  return (
    <dl className="divide-y divide-borda text-xs">
      <Linha rotulo="Modo">
        {cap.modo === null ? <span className="font-semibold text-amber-700">não informado</span> : cap.modo === 'continuo' ? 'Contínuo' : 'Por carga'}
      </Linha>
      {cap.modo !== 'por_carga' && (
        <Linha rotulo="Vazão">{valor(cap.kg_fresco_por_hora, (x) => `${formatarNumero(x)} kg/h`)}</Linha>
      )}
      {cap.modo === 'por_carga' && (
        <Linha rotulo="Carga">
          {valor(cap.kg_por_carga, (x) => `${formatarNumero(x)} kg`)} / {valor(cap.horas_por_carga, formatarHoras)}
        </Linha>
      )}
      <Linha rotulo="Setup ini/fim/dia">
        {valor(cap.setup_inicial_h, formatarHoras)} / {valor(cap.setup_final_h, formatarHoras)} /{' '}
        {valor(cap.setup_diario_h, formatarHoras)}
      </Linha>
      <Linha rotulo="Prioridade">
        {cap.prioridade !== null ? (
          <span className="inline-flex size-5 items-center justify-center rounded-full bg-verde-100 text-[11px] font-bold text-verde-700">
            {cap.prioridade}
          </span>
        ) : (
          <span className="font-normal text-suave/70">sem preferência</span>
        )}
      </Linha>
    </dl>
  );
}

type Edicao =
  | { tipo: 'erva'; erva: Erva | null }
  | { tipo: 'secador'; secador: Secador | null }
  | { tipo: 'capacidade'; erva: Erva; secador: Secador; capacidade: Capacidade | null };

/** Folha em marca d'água no cartão da erva (mesmo desenho das folhas do login). */
function FolhaMarca() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="pointer-events-none absolute -bottom-6 -right-6 size-32 rotate-12 text-white/[0.07]">
      <path fill="currentColor" d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
      <path fill="none" stroke="currentColor" strokeWidth="1.2" d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
    </svg>
  );
}

function LinkEditar({ onClick, children = 'editar', claro = false }: { onClick: () => void; children?: ReactNode; claro?: boolean }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold transition-colors ${
        claro ? 'text-white/85 hover:bg-white/15 hover:text-white' : 'text-verde-700 hover:bg-verde-50'
      }`}
      onClick={onClick}
    >
      {children === 'editar' ? <Pencil aria-hidden="true" className="size-3" /> : <Plus aria-hidden="true" className="size-3" />}
      {children}
    </button>
  );
}

const FILTRO_VAZIO = { busca: '', secador: '', situacao: '' as Situacao };

export default function MatrizCapacidade() {
  const { pode } = useSessao();
  const podeGerenciar = pode('cadastro.gerenciar');

  // Inativos só aparecem para quem pode reativá-los
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const inativos = mostrarInativos ? '?ativos=false' : '';
  const ervas = useApi<Erva[]>(`/ervas${inativos}`);
  const secadores = useApi<Secador[]>(`/secadores${inativos}`);
  const capacidades = useApi<Capacidade[]>('/capacidades');
  const rendimentos = useApi<Rendimento[]>('/rendimentos');
  const erro = ervas.erro || secadores.erro || capacidades.erro || rendimentos.erro;

  const [filtro, setFiltro] = useState(FILTRO_VAZIO);
  const [edicao, setEdicao] = useState<Edicao | null>(null);

  const capacidade = useCallback(
    (ervaId: number, secadorId: number) =>
      capacidades.dados?.find((c) => c.erva_id === ervaId && c.secador_id === secadorId) ?? null,
    [capacidades.dados]
  );
  const rendimento = (ervaId: number) => rendimentos.dados?.find((r) => r.erva_id === ervaId) ?? null;

  const { recarregar: recarregarErvas } = ervas;
  const { recarregar: recarregarSecadores } = secadores;
  const { recarregar: recarregarCapacidades } = capacidades;
  const { recarregar: recarregarRendimentos } = rendimentos;
  const aoSalvar = useCallback(() => {
    setEdicao(null);
    recarregarErvas();
    recarregarSecadores();
    recarregarCapacidades();
    recarregarRendimentos();
  }, [recarregarErvas, recarregarSecadores, recarregarCapacidades, recarregarRendimentos]);
  // Estável: a janela usa como dependência do efeito de foco
  const aoCancelar = useCallback(() => setEdicao(null), []);

  const todasErvas = ervas.dados ?? [];
  const todosSecadores = secadores.dados ?? [];

  // Situação de um par erva × secador
  const situacaoPar = useCallback(
    (ervaId: number, secadorId: number): Exclude<Situacao, ''> => {
      const cap = capacidade(ervaId, secadorId);
      if (!cap) return 'nao_opera';
      return capacidadeIncompleta(cap) ? 'incompleta' : 'completa';
    },
    [capacidade]
  );

  // Resumo de todos os pares (sem filtro), para o topo da tela
  const resumo = useMemo(() => {
    const conta = { completa: 0, incompleta: 0, nao_opera: 0 };
    todasErvas.forEach((e) => todosSecadores.forEach((s) => (conta[situacaoPar(e.id, s.id)] += 1)));
    return conta;
  }, [todasErvas, todosSecadores, situacaoPar]);
  const totalPares = resumo.completa + resumo.incompleta + resumo.nao_opera;

  // Colunas: só o secador escolhido. Linhas: busca pelo nome/código e situação nos secadores visíveis
  const secadoresVisiveis = todosSecadores.filter((s) => !filtro.secador || String(s.id) === filtro.secador);
  const busca = filtro.busca.trim().toLowerCase();
  const ervasVisiveis = todasErvas.filter((e) => {
    if (busca && !`${e.nome} ${e.codigo}`.toLowerCase().includes(busca)) return false;
    if (!filtro.situacao) return true;
    const doisLados = secadoresVisiveis.map((s) => situacaoPar(e.id, s.id));
    if (filtro.situacao === 'incompleta') {
      return doisLados.includes('incompleta') || ervaIncompleta(e, rendimento(e.id));
    }
    return doisLados.includes(filtro.situacao);
  });
  const filtrando = filtro.busca !== '' || filtro.secador !== '' || filtro.situacao !== '';

  // Com filtro de situação, as células que não batem ficam apagadas (a grade não se desmancha)
  const apagada = (ervaId: number, secadorId: number) =>
    filtro.situacao !== '' && situacaoPar(ervaId, secadorId) !== filtro.situacao;

  const carregandoPrimeira = (ervas.carregando || secadores.carregando) && !ervas.dados;

  return (
    <div className="space-y-6">
      <PageHeader
        secao="Cadastros e dados"
        titulo="Matriz de Capacidade"
        ajuda={[
          'Cada linha é uma erva e cada coluna, um secador. O bloco do cruzamento traz como essa erva seca naquele secador.',
          'Clique em "editar" no bloco para mudar carga, horas e setups, ou em "cadastrar" para fazer a erva operar num secador.',
          'Campo vazio fica "não informado" (âmbar) e vira pendência na simulação: o sistema nunca assume um valor.',
          'Use os filtros para achar rápido o que falta preencher ("Com parâmetro não informado").',
        ]}
        descricao="Parâmetros de cada erva em cada secador. O que estiver vazio vira pendência na simulação."
        acoes={
          podeGerenciar && (
            <>
              <Button variant="secondary" icone={Plus} onClick={() => setEdicao({ tipo: 'secador', secador: null })}>
                Novo secador
              </Button>
              <Button icone={Plus} onClick={() => setEdicao({ tipo: 'erva', erva: null })}>Nova erva</Button>
            </>
          )
        }
      />
      {erro && <Alerta>{erro}</Alerta>}

      {totalPares > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard
            titulo="Pares completos"
            icone={Grid3x3}
            valor={resumo.completa}
            unidade={`de ${totalPares}`}
            progresso={(100 * resumo.completa) / totalPares}
            tom="bom"
            detalhe="Prontos para a simulação."
          />
          <KpiCard
            titulo="Com parâmetro vazio"
            icone={TriangleAlert}
            valor={resumo.incompleta}
            unidade={`de ${totalPares}`}
            progresso={(100 * resumo.incompleta) / totalPares}
            tom={resumo.incompleta ? 'atencao' : 'neutro'}
            detalhe="Viram pendência ao simular."
          />
          <KpiCard
            titulo="Não operam"
            icone={CircleSlash}
            valor={resumo.nao_opera}
            unidade={`de ${totalPares}`}
            progresso={(100 * resumo.nao_opera) / totalPares}
            tom="neutro"
            detalhe="Sem capacidade: a erva não vai para esse secador."
          />
        </div>
      )}

      {/* key: trocar de registro recomeça o formulário com os valores dele */}
      {edicao?.tipo === 'erva' && (
        <FormularioErva key={`erva-${edicao.erva?.id}`} erva={edicao.erva}
          rendimento={edicao.erva && rendimento(edicao.erva.id)} aoSalvar={aoSalvar} aoCancelar={aoCancelar} />
      )}
      {edicao?.tipo === 'secador' && (
        <FormularioSecador key={`secador-${edicao.secador?.id}`} secador={edicao.secador}
          aoSalvar={aoSalvar} aoCancelar={aoCancelar} />
      )}
      {edicao?.tipo === 'capacidade' && (
        <FormularioCapacidade key={`cap-${edicao.erva.id}-${edicao.secador.id}`} erva={edicao.erva}
          secador={edicao.secador} capacidade={edicao.capacidade} aoSalvar={aoSalvar} aoCancelar={aoCancelar} />
      )}

      <Card>
        {/* Filtros: a matriz responde na hora (linhas e colunas) */}
        <div className="mb-4 grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1.2fr_auto]">
          <div className="relative">
            <Input
              id="matriz-busca"
              label="Buscar erva"
              type="search"
              placeholder="Nome ou código"
              className="pl-9"
              value={filtro.busca}
              onChange={(e) => setFiltro({ ...filtro, busca: e.target.value })}
            />
            <Search aria-hidden="true" className="pointer-events-none absolute bottom-2.5 left-3 size-4 text-suave" />
          </div>
          <Select
            id="matriz-secador"
            label="Secador"
            value={filtro.secador}
            onChange={(e) => setFiltro({ ...filtro, secador: e.target.value })}
          >
            <option value="">Todos os secadores</option>
            {todosSecadores.map((s) => (
              <option key={s.id} value={s.id}>{`${s.codigo} · ${s.nome}`}</option>
            ))}
          </Select>
          <Select
            id="matriz-situacao"
            label="Situação do par"
            value={filtro.situacao}
            onChange={(e) => setFiltro({ ...filtro, situacao: e.target.value as Situacao })}
          >
            <option value="">Todas</option>
            <option value="incompleta">Com parâmetro não informado</option>
            <option value="completa">Completas</option>
            <option value="nao_opera">Não opera</option>
          </Select>
          <div className="flex flex-wrap items-center gap-3 pb-2">
            {podeGerenciar && (
              <label className="flex items-center gap-2 whitespace-nowrap text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-verde-700"
                  checked={mostrarInativos}
                  onChange={(e) => setMostrarInativos(e.target.checked)}
                />
                Mostrar inativos
              </label>
            )}
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-suave" aria-live="polite">
            {ervasVisiveis.length} erva(s) × {secadoresVisiveis.length} secador(es)
            {filtrando && ` · filtrado de ${todasErvas.length} × ${todosSecadores.length}`}
          </p>
          {filtrando && (
            <Button variant="ghost" tamanho="sm" icone={FilterX} onClick={() => setFiltro(FILTRO_VAZIO)}>
              Limpar filtros
            </Button>
          )}
        </div>

        {carregandoPrimeira ? (
          <SkeletonTabela />
        ) : (
          // No celular rola de lado; a coluna da erva fica presa à esquerda
          <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
            <table className="w-full border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className="text-xs font-semibold uppercase tracking-wide text-suave">
                  <th className="sticky left-0 z-10 w-56 min-w-48 bg-white p-3 align-bottom">
                    <div className="flex items-center gap-2 rounded-lg border border-verde-900/20 bg-verde-900 px-3 py-2.5 text-white shadow-suave">
                      <Sprout aria-hidden="true" className="size-4 text-lima-500" />
                      Erva
                    </div>
                  </th>
                  {secadoresVisiveis.map((s) => (
                    <th key={s.id} className="min-w-56 p-3 align-bottom">
                      {/* Moldura do secador: a coluna fica fácil de seguir com os olhos */}
                      <div className="rounded-lg border border-verde-700/25 bg-verde-50 px-3 py-2 shadow-suave">
                        <div className="flex items-center gap-2 normal-case tracking-normal">
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-verde-700 text-white">
                            <Factory aria-hidden="true" className="size-3.5" />
                          </span>
                          <span className="text-sm font-bold text-tinta">{s.codigo}</span>
                          {!s.ativo && <Etiqueta cor="amarelo">inativo</Etiqueta>}
                          {podeGerenciar && (
                            <span className="ml-auto">
                              <LinkEditar onClick={() => setEdicao({ tipo: 'secador', secador: s })} />
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 pl-8 text-xs font-normal normal-case tracking-normal text-suave">{s.nome}</div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ervasVisiveis.map((erva) => {
                  const rend = rendimento(erva.id);
                  return (
                    <tr key={erva.id} className="align-top">
                      <td className="sticky left-0 z-10 border-b border-borda bg-white p-3">
                        {/* Cartão da erva com o tema das folhas do login */}
                        <div className="relative overflow-hidden rounded-lg bg-gradient-to-br from-verde-900 via-verde-700 to-verde-600 p-3 text-white shadow-suave">
                          <FolhaMarca />
                          <div className="relative flex items-center gap-2">
                            <Leaf aria-hidden="true" className="size-4 shrink-0 text-lima-500" />
                            <span className="font-semibold">{erva.nome}</span>
                            {!erva.ativo && <Etiqueta cor="amarelo">inativa</Etiqueta>}
                            {podeGerenciar && (
                              <span className="ml-auto">
                                <LinkEditar claro onClick={() => setEdicao({ tipo: 'erva', erva })} />
                              </span>
                            )}
                          </div>
                          <div className="relative mb-2 mt-1.5">
                            <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-white/90">
                              {erva.codigo}
                            </span>
                          </div>
                          {/* No fundo escuro: rótulos claros e "não informado" em âmbar claro */}
                          <dl className="relative divide-y divide-white/15 border-t border-white/15 text-xs [&_dd]:text-white [&_dt]:text-white/70 [&_.text-amber-700]:text-amber-200">
                            <Linha rotulo="Regime">{valor(erva.regime_horas_dia, (x) => `${formatarNumero(x)} h/dia`)}</Linha>
                            <Linha rotulo="Espera máx.">{valor(erva.espera_maxima_dias, (x) => `${x} dias`)}</Linha>
                            <Linha rotulo="Fresco/desidratado">
                              {valor(rend?.fresco_por_desidratado ?? null, (x) => formatarNumero(x, 4))}
                            </Linha>
                            <Linha rotulo="Desidratado/moído">
                              {valor(rend?.desidratado_por_moido ?? null, (x) => formatarNumero(x, 4))}
                            </Linha>
                          </dl>
                        </div>
                      </td>
                      {secadoresVisiveis.map((s) => {
                        const cap = capacidade(erva.id, s.id);
                        const incompleta = cap !== null && capacidadeIncompleta(cap);
                        const editar = () => setEdicao({ tipo: 'capacidade', erva, secador: s, capacidade: cap });
                        return (
                          <td
                            key={s.id}
                            className={`border-b border-borda p-3 transition-opacity duration-200 ${apagada(erva.id, s.id) ? 'opacity-30' : ''}`}
                          >
                            {cap ? (
                              <div
                                className={`rounded-lg border bg-white shadow-suave transition-all duration-200 ease-suave hover:-translate-y-0.5 hover:shadow-elevada ${
                                  incompleta ? 'border-amber-300 border-l-4 border-l-amber-500' : 'border-borda border-l-4 border-l-verde-600'
                                }`}
                              >
                                <div className="px-3 py-1">
                                  <Parametros cap={cap} />
                                </div>
                                {podeGerenciar && (
                                  <div className="flex justify-end border-t border-borda px-2 py-1">
                                    <LinkEditar onClick={editar} />
                                  </div>
                                )}
                              </div>
                            ) : (
                              // Sem capacidade cadastrada: o motor não aloca a erva neste secador
                              <div className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-borda bg-fundo/50 p-3">
                                <Etiqueta>não opera</Etiqueta>
                                {podeGerenciar && <LinkEditar onClick={editar}>cadastrar</LinkEditar>}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {ervas.dados && ervasVisiveis.length === 0 && (
                  <tr>
                    <td className="px-4 py-10 text-center text-suave" colSpan={99}>
                      {todasErvas.length === 0 ? 'Nenhuma erva cadastrada.' : 'Nenhuma erva com esses filtros.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <Legenda
          itens={[
            {
              amostra: 'border border-borda border-l-4 border-l-verde-600 bg-white',
              rotulo: 'Bloco com borda verde',
              descricao: 'par completo, pronto para a simulação',
            },
            {
              amostra: 'border border-amber-300 border-l-4 border-l-amber-500 bg-white',
              rotulo: 'Não informado (âmbar)',
              descricao: 'vira pendência de parâmetro ausente ao simular; nada é suposto',
            },
            {
              amostra: 'border border-dashed border-suave bg-fundo',
              rotulo: 'Não opera (tracejado)',
              descricao: 'sem capacidade: o motor não manda essa erva para esse secador',
            },
            {
              amostra: (
                <span className="inline-flex size-4 items-center justify-center rounded-full bg-verde-100 text-[10px] font-bold text-verde-700">
                  1
                </span>
              ),
              rotulo: 'Prioridade',
              descricao: 'menor = secador preferido; vazio = vai para o de maior capacidade no dia',
            },
          ]}
        />
      </Card>
    </div>
  );
}
