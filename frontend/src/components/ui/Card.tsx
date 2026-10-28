import React, { HTMLAttributes } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const Card = ({ children, className = '', ...props }: CardProps) => {
  return (
    <div 
      className={`bg-[#FFFFFF] border border-[#C7C8CA] rounded-lg shadow-sm p-5 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};