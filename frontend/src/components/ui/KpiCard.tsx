import { ReactNode, useEffect, useState } from 'react';

interface KpiCardProps {
  titulo: string;
  /** Texto pronto do valor (ex.: "78%", "n/a", "não informada"). */
  valor: ReactNode;
  detalhe?: ReactNode;
  /** 0–100: desenha a barra de progresso. null/undefined = sem barra. */
  progresso?: number | null;
  /** Destaque ao lado do título (ex.: uma Etiqueta). */
  extra?: ReactNode;
}

/** Indicador em destaque: valor grande, barra que se enche ao aparecer e detalhe. */
export const KpiCard = ({ titulo, valor, detalhe, progresso, extra }: KpiCardProps) => {
  // A barra começa vazia e anima até o valor
  const [largura, setLargura] = useState(0);
  useEffect(() => {
    const quadro = requestAnimationFrame(() => setLargura(Math.max(0, Math.min(100, progresso ?? 0))));
    return () => cancelAnimationFrame(quadro);
  }, [progresso]);

  return (
    <div className="rounded-xl border border-borda bg-white p-4 shadow-suave transition-all duration-300 ease-suave hover:-translate-y-0.5 hover:shadow-elevada">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-suave">{titulo}</p>
        {extra}
      </div>
      <p className="mt-1.5 text-2xl font-bold tabular-nums text-tinta">{valor}</p>
      {progresso !== undefined && progresso !== null && (
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-fundo" aria-hidden="true">
          <div
            className="h-full rounded-full bg-gradient-to-r from-verde-700 to-lima-500 transition-[width] duration-1000 ease-suave"
            style={{ width: `${largura}%` }}
          />
        </div>
      )}
      {detalhe && <div className="mt-2 text-xs text-suave">{detalhe}</div>}
    </div>
  );
};
