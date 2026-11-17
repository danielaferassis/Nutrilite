import { CSSProperties } from 'react';

/*
 * Fundo animado do login, em tom sóbrio: linhas finas de onda que correm de lado
 * (como fios de vento) e poucas folhas pequenas caindo devagar. Só SVG + CSS
 * (keyframes onda, cai e balanca em index.css), sem biblioteca. Quem pede menos
 * movimento vê as linhas paradas e sem folhas.
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
  opacidade: 0.05 + (i % 3) * 0.035,
}));

// Pseudoaleatório determinístico (parte fracionária de um seno grande): espalha sem alinhar
const FOLHAS = Array.from({ length: 9 }, (_, i) => {
  const r = (n: number) => {
    const x = Math.sin((i + 1) * 12.9898 + n * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  return {
    esquerda: `${Math.round(r(1) * 100)}%`,
    tamanho: 10 + Math.round(r(2) * 7),
    queda: 22 + r(3) * 14,
    // Atraso negativo: ao abrir a tela as folhas já estão no meio da queda
    atraso: -r(4) * 30,
    balanco: 4 + r(5) * 3,
    giro: Math.round(r(6) * 360),
    cor: i % 3 === 0 ? 'text-lima-500/25' : 'text-white/15',
  };
});

export default function FundoLogin() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Luz suave no alto e sombra na base: profundidade sem chamar atenção */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_-10%,rgb(132_189_0/0.12),transparent_55%)]" />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/20 to-transparent" />

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
            <path d={l.d} fill="none" stroke="white" strokeOpacity={l.opacidade} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </svg>
        ))}
      </div>

      {/* Folhas caindo */}
      <div className="absolute inset-0 motion-reduce:hidden">
        {FOLHAS.map((f, i) => (
          <div
            key={i}
            className={`absolute top-0 animate-cai ${f.cor}`}
            style={{ left: f.esquerda, animationDuration: `${f.queda}s`, animationDelay: `${f.atraso}s` } as CSSProperties}
          >
            <div className="animate-balanca" style={{ animationDuration: `${f.balanco}s` }}>
              <svg viewBox="0 0 24 24" width={f.tamanho} height={f.tamanho} style={{ transform: `rotate(${f.giro}deg)` }}>
                <path fill="currentColor" d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
              </svg>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
