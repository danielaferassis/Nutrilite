import { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export const Button = ({ children, variant = 'primary', className = '', ...props }: ButtonProps) => {
  const styles: Record<ButtonVariant, string> = {
    primary: 'bg-verde-700 text-white shadow-suave hover:bg-verde-600 hover:shadow-elevada border border-transparent',
    secondary: 'bg-white text-tinta border border-borda hover:bg-verde-50 hover:border-cinza',
    danger: 'bg-red-600 text-white shadow-suave hover:bg-red-700 border border-transparent',
  };

  const baseStyles =
    'px-4 py-2 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 ' +
    'transition-all duration-200 ease-suave active:scale-[.97] ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-lima-500 focus-visible:ring-offset-2 ' +
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 [&_svg]:size-4';

  return (
    <button className={`${baseStyles} ${styles[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
};
