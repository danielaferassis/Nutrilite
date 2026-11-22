import { CSSProperties, ReactNode } from 'react';

/*
 * Fundo animado do login, claro e discreto ("névoa"): off-white com leve tom de
 * sálvia, granulado fino, linhas finas de onda que correm de lado (como fios de
 * vento) e folhas das ervas do sistema caindo devagar. Só SVG + CSS (keyframes onda, cai e
 * balanca em index.css), sem biblioteca. Quem pede menos movimento vê as linhas
 * paradas e sem folhas.
 */

// Um período de onda em 1440 px; repetido duas vezes, o translateX(-50%) emenda sem salto
const periodo = (altura: number, amplitude: number, desloc = 0) =>
  `C${240 + desloc},${altura - amplitude} ${480 + desloc},${altura + amplitude} ${720 + desloc},${altura} ` +
  `C${960 + desloc},${altura - amplitude} ${1200 + desloc},${altura + amplitude} ${1440 + desloc},${altura}`;
const linha = (altura: number, amplitude: number) =>
  `M0,${altura} ${periodo(altura, amplitude)} ${periodo(altura, amplitude, 1440)}`;

// Feixe de linhas: alturas e amplitudes próximas formam a "fita" ondulada
const LINHAS = Array.from({ length: 9 }, (_, i) => ({
  d: linha(150 + i * 9, 34 + i * 4),
  duracao: `${30 + i * 3}s`,
  // No fundo claro as linhas precisam de mais opacidade que no verde para aparecer
  opacidade: 0.1 + (i % 3) * 0.05,
}));

/*
 * Silhuetas simples (viewBox 24x24), uma por erva principal, no tom de cada uma.
 * A folha genérica alterna verde da marca e lima, como antes.
 */
type Tipo = 'folha' | 'agriao' | 'camomila' | 'salsa' | 'picao';

// Folíolo de salsa: cunha com a ponta recortada, saindo da base (12, 21)
const FOLIOLO_SALSA =
  'M12 21 L12 13 C9.5 12.5 7.5 10 8 7 L9.6 8 L9.6 5.4 L11 6.4 L12 3.5 L13 6.4 L14.4 5.4 L14.4 8 L16 7 C16.5 10 14.5 12.5 12 13 Z';

const DESENHOS: Record<Tipo, (lima: boolean) => ReactNode> = {
  folha: (lima) => (
    <path fill={lima ? 'rgb(132 189 0 / .55)' : 'rgb(0 111 68 / .3)'} d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
  ),
  // Agrião: folíolos redondos em volta do talo, verde escuro
  agriao: () => (
    <g fill="rgb(38 104 58 / .45)">
      <path d="M12 22 V9" stroke="rgb(38 104 58 / .45)" strokeWidth="1.2" fill="none" />
      <circle cx="12" cy="6" r="4" />
      <circle cx="7" cy="12" r="2.8" />
      <circle cx="17" cy="12" r="2.8" />
      <circle cx="8.5" cy="17.5" r="2" />
      <circle cx="15.5" cy="17.5" r="2" />
    </g>
  ),
  // Camomila: pétalas brancas com contorno leve (para aparecer no fundo claro) e miolo amarelo
  camomila: () => (
    <g>
      {Array.from({ length: 10 }, (_, k) => (
        <ellipse key={k} cx="12" cy="6.2" rx="1.9" ry="4.2" transform={`rotate(${k * 36} 12 12)`} fill="#fff" stroke="rgb(0 111 68 / .22)" strokeWidth=".5" />
      ))}
      <circle cx="12" cy="12" r="3.2" fill="rgb(232 178 20 / .85)" />
    </g>
  ),
  // Salsa: três folíolos recortados, verde vivo
  salsa: () => (
    <g fill="rgb(52 140 60 / .45)">
      {[-42, 0, 42].map((g) => (
        <path key={g} d={FOLIOLO_SALSA} transform={`rotate(${g} 12 13)`} />
      ))}
    </g>
  ),
  // Picão-preto: folha estreita de borda serrilhada, verde-oliva
  picao: () => (
    <path
      fill="rgb(118 140 40 / .5)"
      d="M12 2 L13 4.5 L14.3 4.4 L14.2 7 L15.4 7.4 L14.9 10 L16 10.8 L15 13.2 L15.8 14.4 L14.4 16.4 L14.6 17.8 L12.6 19.4 L12.4 22 L11.6 22 L11.4 19.4 L9.4 17.8 L9.6 16.4 L8.2 14.4 L9 13.2 L8 10.8 L9.1 10 L8.6 7.4 L9.8 7 L9.7 4.4 L11 4.5 Z"
    />
  ),
};

// Ordem de sorteio: a folha genérica aparece mais; cada erva aparece algumas vezes
const TIPOS: Tipo[] = ['folha', 'agriao', 'camomila', 'folha', 'salsa', 'picao'];

// Pseudoaleatório determinístico (parte fracionária de um seno grande): espalha sem alinhar
const FOLHAS = Array.from({ length: 26 }, (_, i) => {
  const r = (n: number) => {
    const x = Math.sin((i + 1) * 12.9898 + n * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  const tipo = TIPOS[i % TIPOS.length];
  return {
    tipo,
    esquerda: `${Math.round(r(1) * 100)}%`,
    // As ervas têm mais detalhe e pedem um tamanho um pouco maior que a folha simples
    tamanho: (tipo === 'folha' ? 20 : 26) + Math.round(r(2) * 12),
    queda: 22 + r(3) * 14,
    // Atraso negativo: ao abrir a tela as folhas já estão no meio da queda
    atraso: -r(4) * 30,
    balanco: 4 + r(5) * 3,
    giro: Math.round(r(6) * 360),
    lima: i % 4 === 0,
  };
});

// Ruído fractal em SVG, repetido como textura
const GRAO =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E" +
  "%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E" +
  "%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.6'/%3E%3C/svg%3E\")";

/** Fundo da tela de login: gradiente claro com toques de lima e verde nos cantos */
export const FUNDO_LOGIN =
  'radial-gradient(ellipse 80% 60% at 75% 0%, rgb(132 189 0 / .07), transparent 60%), ' +
  'radial-gradient(ellipse 70% 60% at 10% 100%, rgb(0 111 68 / .08), transparent 60%), ' +
  'linear-gradient(160deg, #f7f8f4, #edf1ea 55%, #e6ece3)';

export default function FundoLogin() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Granulado fino: tira o aspecto "chapado" do gradiente */}
      <div className="absolute inset-0 opacity-50 mix-blend-soft-light" style={{ backgroundImage: GRAO }} />

      {/* Linhas de onda */}
      <div className="absolute inset-x-0 bottom-[8vh] h-[38vh]">
        {LINHAS.map((l) => (
          <svg
            key={l.duracao}
            viewBox="0 0 2880 320"
            preserveAspectRatio="none"
            className="absolute inset-y-0 left-0 h-full w-[200%] animate-onda motion-reduce:animate-none"
            style={{ animationDuration: l.duracao }}
          >
            <path d={l.d} fill="none" stroke="var(--color-verde-700)" strokeOpacity={l.opacidade} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </svg>
        ))}
      </div>

      {/* Folhas caindo */}
      <div className="absolute inset-0 motion-reduce:hidden">
        {FOLHAS.map((f, i) => (
          <div
            key={i}
            className="absolute top-0 animate-cai"
            style={{ left: f.esquerda, animationDuration: `${f.queda}s`, animationDelay: `${f.atraso}s` } as CSSProperties}
          >
            <div className="animate-balanca" style={{ animationDuration: `${f.balanco}s` }}>
              <svg viewBox="0 0 24 24" width={f.tamanho} height={f.tamanho} style={{ transform: `rotate(${f.giro}deg)` }}>
                {DESENHOS[f.tipo](f.lima)}
              </svg>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
