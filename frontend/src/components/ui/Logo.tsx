import { NOME_EMPRESA } from '../../marca';

/** Logo completo (marca + nome), para o login. Provisório: marcador + nome da empresa. */
export const LogoCompleto = ({ altura = 44 }: { altura?: number }) => (
  <span className="flex items-center gap-2 text-2xl font-bold text-verde-700">
    <Logo tamanho={altura} />
    {NOME_EMPRESA}
  </span>
);

interface LogoProps {
  /** Lado do quadrado em px. */
  tamanho?: number;
  /** Fundo claro atrás do logo (para usar sobre o verde escuro). */
  comFundo?: boolean;
  className?: string;
}

/** Marcador de posição do logo, até o oficial ser liberado. */
export const Logo = ({ tamanho = 32, comFundo = false, className = '' }: LogoProps) => {
  const cores = comFundo ? 'border-cinza bg-white text-suave shadow-suave' : 'border-suave/50 text-suave';
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 select-none items-center justify-center rounded-lg border border-dashed font-bold tracking-wider ${cores} ${className}`}
      style={{ width: tamanho, height: tamanho, fontSize: Math.max(8, tamanho * 0.26) }}
    >
      LOGO
    </span>
  );
};
