import { Archive, CalendarCheck, Check, Eye, FilePen, History, Lock, Trash2 } from 'lucide-react';
import { ReactNode, useState } from 'react';

import { formatarData, formatarDataHora, sobrepostos } from '../formatar';
import { PlanoResumo } from '../tipos';
import { Button, CabecalhoCard, Card, Etiqueta, EtiquetaCor, SkeletonTabela } from './ui';

type Aba = 'vigentes' | 'rascunhos' | 'historico';

const periodo = (p: { inicio: string; fim: string }) => `${formatarData(p.inicio)} a ${formatarData(p.fim)}`;
const curto = (iso: string) => formatarData(iso).slice(0, 5);

/** Aprovados depois de `p` que cobrem algum dia dele: são eles que tiram dias de vigor de `p`. */
const assumiramDias = (p: PlanoResumo, todos: PlanoResumo[]) =>
  sobrepostos(
    p,
    todos.filter((x) => x.aprovado_em && p.aprovado_em && x.aprovado_em > p.aprovado_em)
  );

/** Situação em linguagem direta, em vez de só "Aprovado"/"Substituído". */
function situacao(p: PlanoResumo, todos: PlanoResumo[], hoje: string): { rotulo: string; cor: EtiquetaCor; detalhe?: string } {
  if (p.status === 'rascunho') return { rotulo: 'Rascunho', cor: 'cinza', detalhe: 'Salvo, mas ainda não vale. Aprove para entrar no Cronograma.' };
  const novos = assumiramDias(p, todos);
  const nomes = novos.map((x) => `${periodo(x)} (v${x.versao})`).join(', ');
  if (p.status === 'substituido') {
    return { rotulo: 'Substituído', cor: 'amarelo', detalhe: `Todos os dias passaram para o plano ${nomes || 'aprovado depois dele'}.` };
  }
  const emParte = novos.length > 0 ? ` Alguns dias passaram para ${nomes}.` : '';
  if (p.fim < hoje) return { rotulo: 'Executado', cor: 'cinza', detalhe: `Valeu até ${formatarData(p.fim)}.${emParte}` };
  if (p.inicio > hoje) return { rotulo: `Começa em ${curto(p.inicio)}`, cor: 'azul', detalhe: `Aprovado; passa a valer em ${formatarData(p.inicio)}.${emParte}` };
  return { rotulo: novos.length ? 'Em vigor (em parte)' : 'Em vigor', cor: 'verde', detalhe: novos.length ? emParte.trim() : 'É o plano que vale hoje.' };
}

interface PlanosSalvosProps {
  planos: PlanoResumo[] | null;
  carregando: boolean;
  hoje: string;
  abertoId?: number;
  podeAprovar: boolean;
  podeExcluir: boolean;
  aoVer: (p: PlanoResumo) => void;
  aoAprovar: (p: PlanoResumo) => void;
  aoExcluir: (p: PlanoResumo) => void;
}

/**
 * Planos salvos em três abas: os que valem (ou vão valer), os rascunhos e o
 * histórico. Cada plano mostra o período em destaque e a situação por extenso.
 */
export default function PlanosSalvos({
  planos,
  carregando,
  hoje,
  abertoId,
  podeAprovar,
  podeExcluir,
  aoVer,
  aoAprovar,
  aoExcluir,
}: PlanosSalvosProps) {
  const todos = planos ?? [];
  const grupos: Record<Aba, PlanoResumo[]> = {
    vigentes: todos.filter((p) => p.status === 'aprovado' && p.fim >= hoje).sort((a, b) => a.inicio.localeCompare(b.inicio)),
    rascunhos: todos.filter((p) => p.status === 'rascunho'),
    historico: todos.filter((p) => p.status === 'substituido' || (p.status === 'aprovado' && p.fim < hoje)),
  };
  const [escolhida, setEscolhida] = useState<Aba | null>(null);
  // Sem escolha do usuário: abre na primeira aba que tem plano
  const aba: Aba = escolhida ?? (grupos.vigentes.length ? 'vigentes' : grupos.rascunhos.length ? 'rascunhos' : 'historico');

  const ABAS: { id: Aba; rotulo: string; icone: typeof History }[] = [
    { id: 'vigentes', rotulo: 'Em vigor e próximos', icone: CalendarCheck },
    { id: 'rascunhos', rotulo: 'Rascunhos', icone: FilePen },
    { id: 'historico', rotulo: 'Histórico', icone: Archive },
  ];
  const VAZIO: Record<Aba, ReactNode> = {
    vigentes: 'Nenhum plano aprovado vale hoje ou nos próximos dias.',
    rascunhos: 'Nenhum rascunho. Simule e salve um período acima.',
    historico: 'Nada no histórico ainda.',
  };

  return (
    <Card>
      <CabecalhoCard icone={History} titulo="Planos salvos" descricao="Cada plano cobre um período. Só um plano aprovado vale em cada dia: o aprovado por último." />

      <div role="tablist" aria-label="Planos salvos" className="mb-4 flex gap-1 overflow-x-auto rounded-lg bg-fundo p-1">
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={aba === a.id}
            onClick={() => setEscolhida(a.id)}
            className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold transition-all duration-200 ${
              aba === a.id ? 'bg-white text-verde-700 shadow-suave' : 'text-suave hover:text-tinta'
            }`}
          >
            <a.icone aria-hidden="true" className="size-4" />
            {a.rotulo}
            <span className={`rounded-full px-1.5 text-xs ${aba === a.id ? 'bg-verde-100 text-verde-700' : 'bg-white text-suave'}`}>
              {grupos[a.id].length}
            </span>
          </button>
        ))}
      </div>

      {carregando && !planos ? (
        <SkeletonTabela linhas={3} />
      ) : grupos[aba].length === 0 ? (
        <p className="rounded-lg border border-dashed border-borda bg-fundo px-4 py-8 text-center text-sm text-suave">{VAZIO[aba]}</p>
      ) : (
        <ul role="tabpanel" className="space-y-2">
          {grupos[aba].map((p) => {
            const s = situacao(p, todos, hoje);
            return (
              <li
                key={p.id}
                className={`flex flex-col gap-3 rounded-lg border p-3 transition-all duration-200 hover:shadow-suave sm:flex-row sm:items-center sm:p-4 animate-entra ${
                  abertoId === p.id ? 'border-verde-600 bg-verde-50' : 'border-borda bg-white'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-bold text-tinta">{periodo(p)}</span>
                    <Etiqueta cor={s.cor}>{s.rotulo}</Etiqueta>
                    {!p.viavel && <Etiqueta cor="vermelho">com pendências</Etiqueta>}
                  </div>
                  {s.detalhe && <p className="mt-0.5 text-[13px] text-texto">{s.detalhe}</p>}
                  <p className="mt-1 text-xs text-suave">
                    Versão {p.versao} deste período · criado por {p.criado_por.nome} em {formatarDataHora(p.criado_em)}
                    {p.aprovado_por && ` · aprovado por ${p.aprovado_por.nome} em ${formatarDataHora(p.aprovado_em!)}`}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2 [&>button]:flex-1 sm:[&>button]:flex-none">
                  <Button variant="secondary" tamanho="sm" icone={Eye} onClick={() => aoVer(p)}>Ver</Button>
                  {podeAprovar && p.status === 'rascunho' && (
                    <Button tamanho="sm" icone={Check} onClick={() => aoAprovar(p)}>Aprovar</Button>
                  )}
                  {p.status === 'rascunho' ? (
                    podeExcluir && (
                      <Button variant="secondary" tamanho="sm" icone={Trash2} onClick={() => aoExcluir(p)}>Excluir</Button>
                    )
                  ) : (
                    <span
                      title="Planos aprovados ficam guardados para rastreabilidade (o que valeu, quem aprovou e quando). Só rascunhos podem ser excluídos."
                      className="hidden items-center gap-1 px-2 text-xs text-suave sm:inline-flex"
                    >
                      <Lock aria-hidden="true" className="size-3.5" />
                      guardado
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

    </Card>
  );
}
