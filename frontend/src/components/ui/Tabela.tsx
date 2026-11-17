import { ArrowDown, ArrowUp, ChevronsUpDown, Filter, FilterX, Inbox } from 'lucide-react';
import { ReactNode, useMemo, useState } from 'react';

import { SkeletonTabela } from './Skeleton';

export interface Coluna<T> {
  titulo: string;
  valor: (linha: T) => ReactNode;
  /** Texto da célula para filtrar e ordenar. Sem ele a coluna não filtra nem ordena. */
  texto?: (linha: T) => string;
  /** Chave de ordenação quando o texto não serve (datas ISO, números). */
  ordenar?: (linha: T) => string | number;
  /** "opcoes" = lista com os valores que existem na coluna; "texto" = busca por trecho. */
  filtro?: 'texto' | 'opcoes';
  alinhar?: 'direita';
}

interface TabelaProps<T> {
  colunas: Coluna<T>[];
  linhas: T[];
  chave: (linha: T) => string | number;
  /** Botões da linha (última coluna, sem título). */
  acoes?: (linha: T) => ReactNode;
  carregando?: boolean;
  vazio?: string;
  /** Mostra o botão "Filtrar" (filtro por coluna). Padrão: sim, se houver coluna filtrável. */
  filtravel?: boolean;
  /** Classe extra da linha (ex.: destacar atrasos). */
  classeLinha?: (linha: T) => string;
  /** Nome da tabela para leitores de tela (e para achá-la nos testes). */
  rotulo?: string;
}

type Ordem = { coluna: number; sentido: 'asc' | 'desc' } | null;

const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const comparar = (a: string | number, b: string | number) =>
  typeof a === 'number' && typeof b === 'number'
    ? a - b
    : String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' });

/**
 * Tabela padrão do sistema: cabeçalho fixo, linhas com destaque ao passar o
 * mouse, ordenação clicando no título e filtro por coluna. Filtra e ordena só o
 * que já está na tela; os filtros que vão ao servidor (período etc.) ficam fora.
 */
export function Tabela<T>({
  colunas,
  linhas,
  chave,
  acoes,
  carregando = false,
  vazio = 'Nenhum registro.',
  filtravel,
  classeLinha,
  rotulo,
}: TabelaProps<T>) {
  const [ordem, setOrdem] = useState<Ordem>(null);
  const [filtros, setFiltros] = useState<Record<number, string>>({});
  const [mostrarFiltros, setMostrarFiltros] = useState(false);

  const podeFiltrar = filtravel ?? colunas.some((c) => c.texto);
  const ativos = Object.values(filtros).filter((v) => v !== '').length;

  // Valores distintos das colunas com filtro por lista
  const opcoes = useMemo(
    () =>
      colunas.map((c) =>
        c.texto && c.filtro === 'opcoes'
          ? [...new Set(linhas.map((l) => c.texto!(l)))].sort((a, b) => comparar(a, b))
          : []
      ),
    [colunas, linhas]
  );

  const visiveis = useMemo(() => {
    let resultado = linhas.filter((l) =>
      colunas.every((c, i) => {
        const busca = filtros[i];
        if (!busca || !c.texto) return true;
        return c.filtro === 'opcoes' ? c.texto(l) === busca : normalizar(c.texto(l)).includes(normalizar(busca));
      })
    );
    if (ordem) {
      const c = colunas[ordem.coluna];
      const valor = c.ordenar ?? c.texto!;
      resultado = [...resultado].sort((a, b) => comparar(valor(a), valor(b)) * (ordem.sentido === 'asc' ? 1 : -1));
    }
    return resultado;
  }, [linhas, colunas, filtros, ordem]);

  // Recarregar com dados já na tela não pisca: o esqueleto é só para a primeira carga
  if (carregando && linhas.length === 0) return <SkeletonTabela />;

  const alternarOrdem = (i: number) =>
    setOrdem((o) =>
      o?.coluna !== i ? { coluna: i, sentido: 'asc' } : o.sentido === 'asc' ? { coluna: i, sentido: 'desc' } : null
    );

  return (
    <div>
      {podeFiltrar && linhas.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-suave" aria-live="polite">
            {visiveis.length === linhas.length
              ? `${linhas.length} registro(s)`
              : `${visiveis.length} de ${linhas.length} registro(s)`}
          </p>
          <div className="flex gap-2">
            {ativos > 0 && (
              <button
                type="button"
                onClick={() => setFiltros({})}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-suave transition-colors hover:bg-fundo hover:text-tinta"
              >
                <FilterX aria-hidden="true" className="size-3.5" />
                Limpar filtros
              </button>
            )}
            <button
              type="button"
              aria-expanded={mostrarFiltros}
              onClick={() => setMostrarFiltros(!mostrarFiltros)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all duration-200 ${
                mostrarFiltros || ativos
                  ? 'border-verde-700 bg-verde-50 text-verde-700'
                  : 'border-borda bg-white text-tinta hover:border-cinza hover:bg-verde-50'
              }`}
            >
              <Filter aria-hidden="true" className="size-3.5" />
              Filtrar por coluna
              {ativos > 0 && (
                <span className="rounded-full bg-verde-700 px-1.5 text-[10px] leading-4 text-white">{ativos}</span>
              )}
            </button>
          </div>
        </div>
      )}

      <div className="-mx-1 overflow-x-auto px-1">
        <table aria-label={rotulo} className="w-full border-separate border-spacing-0 text-left text-sm tabular-nums">
          <thead>
            <tr>
              {colunas.map((c, i) => {
                const ordenavel = !!(c.ordenar ?? c.texto);
                const sentido = ordem?.coluna === i ? ordem.sentido : null;
                const Seta = sentido === 'asc' ? ArrowUp : sentido === 'desc' ? ArrowDown : ChevronsUpDown;
                return (
                  <th
                    key={c.titulo || i}
                    aria-sort={sentido === 'asc' ? 'ascending' : sentido === 'desc' ? 'descending' : undefined}
                    className={`sticky top-0 whitespace-nowrap border-b border-borda bg-white px-3 py-2.5 text-xs font-semibold text-suave ${
                      c.alinhar === 'direita' ? 'text-right' : ''
                    }`}
                  >
                    {ordenavel ? (
                      <button
                        type="button"
                        onClick={() => alternarOrdem(i)}
                        className={`group inline-flex items-center gap-1 rounded transition-colors hover:text-tinta ${sentido ? 'text-tinta' : ''}`}
                      >
                        {c.titulo}
                        <Seta
                          aria-hidden="true"
                          className={`size-3.5 transition-opacity ${sentido ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'}`}
                        />
                      </button>
                    ) : (
                      c.titulo
                    )}
                  </th>
                );
              })}
              {acoes && <th className="sticky top-0 border-b border-borda bg-white px-3 py-2.5" />}
            </tr>
            {mostrarFiltros && (
              <tr className="animate-entra">
                {colunas.map((c, i) => (
                  <th key={c.titulo || i} className="border-b border-borda bg-fundo/60 px-2 py-2 font-normal">
                    {c.texto &&
                      (c.filtro === 'opcoes' ? (
                        <select
                          aria-label={`Filtrar ${c.titulo}`}
                          value={filtros[i] ?? ''}
                          onChange={(e) => setFiltros({ ...filtros, [i]: e.target.value })}
                          className="w-full min-w-24 rounded-md border border-borda bg-white px-2 py-1 text-xs text-tinta focus:border-verde-700 focus:outline-none focus:ring-2 focus:ring-lima-500/50"
                        >
                          <option value="">Todos</option>
                          {opcoes[i].map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input
                          type="search"
                          aria-label={`Filtrar ${c.titulo}`}
                          placeholder="Buscar…"
                          value={filtros[i] ?? ''}
                          onChange={(e) => setFiltros({ ...filtros, [i]: e.target.value })}
                          className="w-full min-w-20 rounded-md border border-borda bg-white px-2 py-1 text-xs text-tinta placeholder:text-suave/70 focus:border-verde-700 focus:outline-none focus:ring-2 focus:ring-lima-500/50"
                        />
                      ))}
                  </th>
                ))}
                {acoes && <th className="border-b border-borda bg-fundo/60" />}
              </tr>
            )}
          </thead>
          <tbody>
            {visiveis.map((linha) => (
              <tr key={chave(linha)} className={`group/linha transition-colors hover:bg-verde-50 ${classeLinha?.(linha) ?? ''}`}>
                {colunas.map((c, i) => (
                  <td
                    key={c.titulo || i}
                    className={`border-b border-borda px-3 py-3 text-texto group-last/linha:border-b-0 ${
                      c.alinhar === 'direita' ? 'text-right' : ''
                    }`}
                  >
                    {c.valor(linha)}
                  </td>
                ))}
                {acoes && (
                  <td className="border-b border-borda px-3 py-2 group-last/linha:border-b-0">
                    <div className="flex justify-end gap-1.5">{acoes(linha)}</div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Fora da área que rola de lado: no celular a mensagem fica visível e centrada */}
      {visiveis.length === 0 && (
        <div className="px-4 py-10 text-center text-sm text-suave">
          <Inbox aria-hidden="true" className="mx-auto mb-2 size-8 text-cinza" />
          {linhas.length === 0 ? vazio : 'Nenhum registro com esses filtros.'}
        </div>
      )}
    </div>
  );
}
