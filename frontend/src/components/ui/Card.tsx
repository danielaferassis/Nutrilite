import React, { HTMLAttributes } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const Card = ({ children, className = '', ...props }: CardProps) => {
  return (
    <div
      className={`bg-white border border-borda rounded-xl shadow-suave p-5 transition-shadow duration-300 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
