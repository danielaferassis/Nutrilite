import { LoaderCircle, LucideIcon } from 'lucide-react';
import { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonTamanho = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  tamanho?: ButtonTamanho;
  /** Ícone à esquerda do texto. */
  icone?: LucideIcon;
  /** Mostra o giro de carregamento e bloqueia o clique. */
  carregando?: boolean;
  /**
   * Em telas estreitas mostra só o ícone (o texto continua para leitores de
   * tela e no title). Usado nas ações das linhas de tabela.
   */
  compacto?: boolean;
}

const VARIANTES: Record<ButtonVariant, string> = {
  primary:
    'bg-verde-700 text-white shadow-suave border border-transparent hover:bg-verde-600 hover:shadow-elevada hover:-translate-y-px',
  secondary: 'bg-white text-tinta border border-borda shadow-suave hover:bg-verde-50 hover:border-cinza hover:-translate-y-px',
  danger: 'bg-red-600 text-white shadow-suave border border-transparent hover:bg-red-700 hover:shadow-elevada hover:-translate-y-px',
  ghost: 'bg-transparent text-verde-700 border border-transparent hover:bg-verde-50',
};

const TAMANHOS: Record<ButtonTamanho, string> = {
  sm: 'px-2.5 py-1.5 text-xs gap-1.5 [&_svg]:size-3.5',
  md: 'px-4 py-2 text-sm gap-2 [&_svg]:size-4',
  lg: 'px-5 py-2.5 text-base gap-2 [&_svg]:size-5',
};

export const Button = ({
  children,
  variant = 'primary',
  tamanho = 'md',
  icone: Icone,
  carregando = false,
  compacto = false,
  className = '',
  disabled,
  title,
  ...props
}: ButtonProps) => {
  const base =
    'inline-flex items-center justify-center rounded-lg font-semibold whitespace-nowrap select-none ' +
    'transition-all duration-200 ease-suave active:scale-[.97] active:translate-y-0 ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-lima-500 focus-visible:ring-offset-2 ' +
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 disabled:hover:translate-y-0 disabled:hover:shadow-suave';

  // No modo compacto o texto vira title para quem passa o mouse no ícone
  const dica = title ?? (compacto && typeof children === 'string' ? children : undefined);

  return (
    <button
      className={`${base} ${VARIANTES[variant]} ${TAMANHOS[tamanho]} ${className}`}
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      title={dica}
      {...props}
    >
      {carregando ? (
        <LoaderCircle aria-hidden="true" className="animate-spin" />
      ) : (
        Icone && <Icone aria-hidden="true" />
      )}
      {compacto && Icone ? <span className="sr-only sm:not-sr-only">{children}</span> : children}
    </button>
  );
};
