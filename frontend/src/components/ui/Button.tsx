import { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export const Button = ({ children, variant = 'primary', className = '', ...props }: ButtonProps) => {
  const styles: Record<ButtonVariant, string> = {
    primary: 'bg-[#006F44] text-[#FFFFFF] hover:bg-[#211E16] border border-transparent',
    secondary: 'bg-[#F9FAFB] text-[#211E16] border border-[#C7C8CA] hover:border-[#84BD00] hover:text-[#84BD00]',
    danger: 'bg-red-600 text-[#FFFFFF] hover:bg-red-800 border border-transparent'
  };

  const baseStyles = 'px-4 py-2 rounded-md font-medium transition-colors duration-200 flex items-center justify-center gap-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#84BD00] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <button 
      className={`${baseStyles} ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};