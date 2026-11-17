import { Leaf } from 'lucide-react';
import { useState } from 'react';

/**
 * Ramo de folhas do logo Nutrilite, procurado em ordem em frontend/public/.
 * Um SVG oficial, se vier, passa na frente do PNG. Sem nenhum, aparece a folha provisória.
 */
const ARQUIVOS = ['/logo-nutrilite.svg', '/logo-nutrilite.png'];

/** Logo completo (ramo + "nutrilite"), para o login. Sem o arquivo, cai no ramo + nome. */
export const LogoCompleto = ({ altura = 44 }: { altura?: number }) => {
  const [falhou, setFalhou] = useState(false);
  if (falhou) {
    return (
      <span className="flex items-center gap-2 text-2xl font-bold text-verde-700">
        <Logo tamanho={altura} />
        Nutrilite
      </span>
    );
  }
  return (
    <img
      src="/logo-nutrilite-completo.png"
      alt="Nutrilite"
      onError={() => setFalhou(true)}
      className="w-auto max-w-full object-contain"
      style={{ height: altura }}
    />
  );
};

interface LogoProps {
  /** Lado do quadrado em px. */
  tamanho?: number;
  /** Fundo claro atrás do logo (para usar sobre o verde escuro). */
  comFundo?: boolean;
  className?: string;
}

/** Logo da Nutrilite. */
export const Logo = ({ tamanho = 32, comFundo = false, className = '' }: LogoProps) => {
  const [tentativa, setTentativa] = useState(0);
  const arquivo = ARQUIVOS[tentativa];
  const moldura = comFundo ? 'bg-white p-1 shadow-suave' : '';

  if (!arquivo) {
    return (
      <span
        aria-hidden="true"
        className={`flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-lima-500 to-verde-600 text-white ${className}`}
        style={{ width: tamanho, height: tamanho }}
      >
        <Leaf style={{ width: tamanho * 0.56, height: tamanho * 0.56 }} />
      </span>
    );
  }
  return (
    <img
      src={arquivo}
      alt="Nutrilite"
      width={tamanho}
      height={tamanho}
      onError={() => setTentativa((t) => t + 1)}
      className={`shrink-0 rounded-lg object-contain ${moldura} ${className}`}
      style={{ width: tamanho, height: tamanho }}
    />
  );
};
