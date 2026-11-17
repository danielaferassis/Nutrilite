import { useEffect, useState } from 'react';

export type TomBarra = 'marca' | 'bom' | 'atencao' | 'critico' | 'neutro';

const TONS: Record<TomBarra, string> = {
  marca: 'bg-gradient-to-r from-verde-700 to-lima-500',
  bom: 'bg-verde-600',
  atencao: 'bg-amber-500',
  critico: 'bg-red-600',
  neutro: 'bg-cinza',
};

/** Classe de texto que combina com cada tom (para o número ao lado da barra). */
export const TEXTO_TOM: Record<TomBarra, string> = {
  marca: 'text-tinta',
  bom: 'text-verde-700',
  atencao: 'text-amber-700',
  critico: 'text-red-700',
  neutro: 'text-suave',
};

/**
 * Tom de um percentual em que "mais é melhor" (aderência, pontualidade, OEE).
 * As faixas são só visuais (não entram em cálculo nenhum) e aparecem na legenda da tela.
 */
export const tomPorFaixa = (pct: number | null, bom = 90, atencao = 70): TomBarra =>
  pct === null ? 'neutro' : pct >= bom ? 'bom' : pct >= atencao ? 'atencao' : 'critico';

interface BarraProps {
  /** 0–100 (o que passar disso fica cheio). null = sem valor: barra vazia. */
  valor: number | null;
  tom?: TomBarra;
  /** Marca vertical (ex.: uma meta), em %. */
  marca?: number | null;
  altura?: 'fina' | 'media';
  rotulo?: string;
}

/** Barra de progresso que se enche ao aparecer. */
export const Barra = ({ valor, tom = 'marca', marca = null, altura = 'fina', rotulo }: BarraProps) => {
  const [largura, setLargura] = useState(0);
  useEffect(() => {
    const quadro = requestAnimationFrame(() => setLargura(Math.max(0, Math.min(100, valor ?? 0))));
    return () => cancelAnimationFrame(quadro);
  }, [valor]);

  return (
    <div
      role={rotulo ? 'img' : undefined}
      aria-label={rotulo}
      aria-hidden={rotulo ? undefined : true}
      className={`relative w-full overflow-hidden rounded-full bg-fundo ring-1 ring-inset ring-borda/60 ${altura === 'fina' ? 'h-1.5' : 'h-2.5'}`}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-1000 ease-suave ${TONS[tom]}`}
        style={{ width: `${largura}%` }}
      />
      {marca !== null && (
        <span className="absolute inset-y-0 w-0.5 bg-tinta/70" style={{ left: `${Math.min(100, marca)}%` }} />
      )}
    </div>
  );
};
