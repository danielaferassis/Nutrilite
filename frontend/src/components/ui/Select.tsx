import { SelectHTMLAttributes, forwardRef } from 'react';

import { useValidacaoPt } from './validacao';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

// Mesmo visual do Input
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, className = '', id, children, onInvalid, onInput, ...props }, ref) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
    const validacao = useValidacaoPt(ref, props.value);

    return (
      <div className="w-full flex flex-col gap-1">
        {label && (
          <label htmlFor={selectId} className="text-sm font-medium text-tinta">
            {label}
          </label>
        )}
        <select
          id={selectId}
          className={`
            w-full px-3 py-2 border rounded-lg text-sm text-tinta bg-white shadow-suave transition-all duration-200
            border-borda focus:outline-none focus:ring-2 focus:ring-lima-500/60 focus:border-verde-700
            hover:border-cinza disabled:bg-fundo disabled:text-suave disabled:cursor-not-allowed
            ${className}
          `}
          {...props}
          ref={validacao.ref}
          onInvalid={(e) => {
            validacao.aoInvalidar(e);
            onInvalid?.(e);
          }}
          onInput={(e) => {
            validacao.aoDigitar(e);
            onInput?.(e);
          }}
        >
          {children}
        </select>
      </div>
    );
  }
);

Select.displayName = 'Select';
