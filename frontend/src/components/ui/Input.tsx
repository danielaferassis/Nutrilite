import { InputHTMLAttributes, forwardRef } from 'react';

import { PADRAO_EMAIL, useValidacaoPt } from './validacao';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

// Utilização do forwardRef para permitir a integração fluída com bibliotecas de formulários (ex: React Hook Form)
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', id, onInvalid, onInput, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
    const validacao = useValidacaoPt(ref, props.value ?? props.checked);
    const pattern = props.pattern ?? (props.type === 'email' ? PADRAO_EMAIL : undefined);

    return (
      <div className="w-full flex flex-col gap-1">
        {label && (
          <label 
            htmlFor={inputId} 
            className="text-sm font-medium text-tinta"
          >
            {label}
          </label>
        )}
        <input
          id={inputId}
          className={`
            w-full px-3 py-2 border rounded-lg text-sm text-tinta bg-white shadow-suave transition-all duration-200
            placeholder:text-suave/70 focus:outline-none focus:ring-2
            disabled:bg-fundo disabled:text-suave disabled:cursor-not-allowed
            ${error
              ? 'border-red-500 focus:ring-red-500/40'
              : 'border-borda focus:ring-lima-500/60 focus:border-verde-700 hover:border-cinza'
            }
            ${className}
          `}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : undefined}
          {...props}
          ref={validacao.ref}
          pattern={pattern}
          onInvalid={(e) => {
            validacao.aoInvalidar(e);
            onInvalid?.(e);
          }}
          onInput={(e) => {
            validacao.aoDigitar(e);
            onInput?.(e);
          }}
        />
        {error && (
          <span id={`${inputId}-error`} className="text-xs text-red-600 mt-1">
            {error}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';