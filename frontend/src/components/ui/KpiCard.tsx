import { LucideIcon } from 'lucide-react';
import { ReactNode, useEffect, useState } from 'react';

import { Barra, TEXTO_TOM, TomBarra } from './Barra';

interface KpiCardProps {
  titulo: string;
  /** Valor pronto (ex.: "78%", "n/a"). Número inteiro conta de 0 até ele ao aparecer. */
  valor: ReactNode;
  /** Texto menor depois do valor (ex.: "de 4"). */
  unidade?: string;
  detalhe?: ReactNode;
  /** 0–100: desenha a barra de progresso. null/undefined = sem barra. */
  progresso?: number | null;
  /** Cor da barra e do valor. Padrão: gradiente da marca. */
  tom?: TomBarra;
  /** Destaque ao lado do título (ex.: uma Etiqueta). */
  extra?: ReactNode;
  icone?: LucideIcon;
}

/** Inteiro conta de 0 até o alvo (0,9 s, desacelerando). */
function Contagem({ alvo }: { alvo: number }) {
  const [atual, setAtual] = useState(0);
  useEffect(() => {
    const reduzido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduzido || alvo === 0 || typeof requestAnimationFrame === 'undefined') {
      setAtual(alvo);
      return;
    }
    const t0 = performance.now();
    let quadro = 0;
    const passo = (t: number) => {
      const p = Math.min(1, (t - t0) / 900);
      setAtual(Math.round(alvo * (1 - Math.pow(1 - p, 3))));
      if (p < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [alvo]);
  return <>{atual}</>;
}

/** Indicador em destaque: valor grande, barra que se enche ao aparecer e detalhe. */
export const KpiCard = ({ titulo, valor, unidade, detalhe, progresso, tom = 'marca', extra, icone: Icone }: KpiCardProps) => (
  <div className="rounded-xl border border-borda bg-white p-4 shadow-suave transition-all duration-300 ease-suave hover:-translate-y-0.5 hover:shadow-elevada animate-entra">
    <div className="flex items-start justify-between gap-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-suave">
        {Icone && <Icone aria-hidden="true" className="size-3.5 shrink-0" />}
        {titulo}
      </p>
      {extra}
    </div>
    <p className={`mt-1.5 text-2xl font-bold tabular-nums sm:text-[28px] ${tom === 'marca' ? 'text-tinta' : TEXTO_TOM[tom]}`}>
      {typeof valor === 'number' && Number.isInteger(valor) ? <Contagem alvo={valor} /> : valor}
      {unidade && <small className="ml-1 text-sm font-medium text-suave">{unidade}</small>}
    </p>
    {progresso !== undefined && progresso !== null && (
      <div className="mt-2.5">
        <Barra valor={progresso} tom={tom} />
      </div>
    )}
    {detalhe && <div className="mt-2 text-xs text-suave">{detalhe}</div>}
  </div>
);
