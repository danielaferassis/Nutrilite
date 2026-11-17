import { Truck } from 'lucide-react';

import { DIAS_SEMANA, formatarKg } from '../formatar';
import { Cronograma as CronogramaT, SituacaoChegada } from '../tipos';
import { CORES_ERVA } from './ResultadoPlano';
import { Legenda } from './ui';

// Datas ISO sem passar pelo fuso do navegador
const utc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const DIA_MS = 86_400_000;
// 0 = segunda … 6 = domingo (mesma convenção do backend)
const diaSemana = (d: string) => (new Date(utc(d)).getUTCDay() + 6) % 7;

const COR_CHEGADA: Record<SituacaoChegada, string> = {
  recebida: 'border-verde-600/40 bg-verde-50 text-verde-700',
  aguardando: 'border-borda bg-white text-suave',
  atrasada: 'border-red-300 bg-red-50 text-red-700',
  nao_prevista: 'border-blue-200 bg-blue-50 text-blue-800',
};

/**
 * Calendário do período: semanas de segunda a domingo; em cada dia, o plano que
 * vale, o que cada secador seca e as chegadas de erva fresca.
 */
export default function CalendarioCronograma({ dados }: { dados: CronogramaT }) {
  // Semanas inteiras: da segunda antes de `de` ao domingo depois de `ate`
  const primeiro = utc(dados.de) - diaSemana(dados.de) * DIA_MS;
  const ultimo = utc(dados.ate) + (6 - diaSemana(dados.ate)) * DIA_MS;
  const dias: string[] = [];
  for (let t = primeiro; t <= ultimo; t += DIA_MS) dias.push(iso(t));

  const ervas = [...new Set(dados.alocacoes.map((a) => a.erva))].sort();
  const cor = (erva: string) => CORES_ERVA[ervas.indexOf(erva) % CORES_ERVA.length];

  const planoDoDia = (d: string) => dados.vigencia.find((t) => t.inicio <= d && d <= t.fim);
  // Secagem do dia somada por secador × erva (cada alocação é um lote/demanda)
  const secagem = (d: string) => {
    const soma = new Map<string, { secador: string; erva: string; kg: number }>();
    dados.alocacoes
      .filter((a) => a.dia === d)
      .forEach((a) => {
        const chave = `${a.secador}|${a.erva}`;
        const item = soma.get(chave) ?? { secador: a.secador, erva: a.erva, kg: 0 };
        item.kg += Number(a.kg_fresco);
        soma.set(chave, item);
      });
    return [...soma.values()].sort((a, b) => a.secador.localeCompare(b.secador));
  };
  // Chegada aparece no dia previsto; a não prevista, no dia em que chegou
  const chegadas = (d: string) =>
    dados.chegadas.filter((c) => (c.data_prevista ?? c.recebimentos[0]?.data_recebimento) === d);

  return (
    <div>
      {/* Cabeçalho dos dias da semana (só no computador) */}
      <div className="mb-1.5 hidden grid-cols-7 gap-1.5 md:grid">
        {DIAS_SEMANA.map((d) => (
          <div key={d} className="px-1 text-center text-xs font-semibold uppercase tracking-wide text-suave">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-1.5 md:grid-cols-7">
        {dias.map((d) => {
          const fora = d < dados.de || d > dados.ate;
          const hoje = d === dados.hoje;
          const plano = planoDoDia(d);
          const itens = secagem(d);
          const cheg = chegadas(d);
          const vazio = itens.length === 0 && cheg.length === 0;
          return (
            <div
              key={d}
              // No celular a agenda mostra só os dias do período que têm algo
              className={`min-h-28 flex-col gap-1 rounded-lg border p-1.5 transition-shadow duration-200 hover:shadow-suave ${
                fora ? 'hidden border-transparent bg-fundo/40 opacity-50 md:flex' : vazio ? 'hidden bg-white md:flex' : 'flex bg-white'
              } ${hoje ? 'border-verde-600 ring-2 ring-lima-500/40' : 'border-borda'}`}
            >
              <div className="flex items-center justify-between gap-1 px-0.5">
                <span className={`text-xs font-semibold ${hoje ? 'text-verde-700' : 'text-tinta'}`}>
                  <span className="md:hidden">{DIAS_SEMANA[diaSemana(d)]}, </span>
                  {d.slice(8, 10)}/{d.slice(5, 7)}
                  {hoje && <span className="ml-1 rounded bg-verde-700 px-1 text-[10px] text-white">hoje</span>}
                </span>
                {plano && (
                  <span title={`Vale o plano v${plano.versao}`} className="rounded bg-verde-100 px-1.5 text-[10px] font-bold text-verde-700">
                    v{plano.versao}
                  </span>
                )}
              </div>
              {itens.map((i) => (
                <div
                  key={`${i.secador}-${i.erva}`}
                  title={`${i.secador}: ${i.erva}, ${formatarKg(i.kg)} de fresco`}
                  className="rounded-md px-1.5 py-1 text-[11px] leading-tight text-white shadow-suave transition-transform duration-200 hover:-translate-y-px"
                  style={{ backgroundColor: cor(i.erva) }}
                >
                  <b className="block truncate">{i.secador} · {i.erva}</b>
                  <span className="opacity-90">{formatarKg(i.kg)}</span>
                </div>
              ))}
              {cheg.map((c, k) => (
                <div
                  key={`c${c.previsao_id ?? 'np'}-${k}`}
                  title={`Chegada de ${c.erva.nome}${c.kg_previsto ? `: ${formatarKg(c.kg_previsto)} previstos` : ''}`}
                  className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] ${COR_CHEGADA[c.situacao]}`}
                >
                  <Truck aria-hidden="true" className="size-3 shrink-0" />
                  <span className="truncate">
                    {c.erva.nome} {formatarKg(c.kg_previsto ?? c.kg_recebido)}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {/* No celular os dias vazios somem; sem nenhum dia com conteúdo, avisa */}
      {dados.alocacoes.length === 0 && dados.chegadas.length === 0 && (
        <p className="text-center text-sm text-suave md:hidden">Nenhuma secagem ou chegada no período.</p>
      )}
      <Legenda
        itens={[
          ...ervas.map((erva, i) => ({
            amostra: <span className="block size-3 rounded-sm" style={{ backgroundColor: cor(erva) }} />,
            rotulo: erva,
            descricao: i === 0 ? 'cada bloco: secador · erva · kg de fresco' : undefined,
          })),
          { amostra: 'bg-verde-100', rotulo: 'v1, v2…', descricao: 'plano aprovado que vale no dia' },
          { amostra: 'border border-borda bg-white', rotulo: 'Caminhão', descricao: 'chegada de erva fresca prevista' },
          { amostra: 'bg-verde-50 border border-verde-600/40', rotulo: 'Chegada verde', descricao: 'recebida' },
          { amostra: 'bg-red-50 border border-red-300', rotulo: 'Chegada vermelha', descricao: 'não chegou' },
        ]}
      />
    </div>
  );
}
