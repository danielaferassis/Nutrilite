import { SelectHTMLAttributes, forwardRef } from 'react';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

// Mesmo visual do Input
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, className = '', id, children, ...props }, ref) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full flex flex-col gap-1">
        {label && (
          <label htmlFor={selectId} className="text-sm font-medium text-[#211E16]">
            {label}
          </label>
        )}
        <select
          id={selectId}
          ref={ref}
          className={`
            w-full px-3 py-2 border rounded-md text-sm text-[#211E16] bg-[#FFFFFF] transition-colors
            border-[#C7C8CA] focus:outline-none focus:ring-2 focus:ring-[#84BD00] focus:border-transparent
            hover:border-[#84BD00] disabled:bg-gray-100 disabled:cursor-not-allowed
            ${className}
          `}
          {...props}
        >
          {children}
        </select>
      </div>
    );
  }
);

Select.displayName = 'Select';
