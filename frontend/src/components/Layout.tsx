import React from 'react';
import { LogOut, Leaf } from 'lucide-react';
// Caso use React Router: import { Link, useLocation } from 'react-router-dom';

export default function Layout({ children }: { children: React.ReactNode }) {
  // Simulando a rota ativa. Em produção, use useLocation() do React Router.
  const path = window.location.pathname;

  const navItems = [
    { label: 'Dashboard PCP', href: '/dashboard' },
    { label: 'Gestão de Demandas', href: '/demandas' },
    { label: 'Entrada do Campo', href: '/entradas' },
    { label: 'Cadastros e Regras', href: '/cadastros' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-[#211E16]">
      {/* Cabeçalho Oficial Nutrilite */}
      <header className="bg-[#FFFFFF] border-b border-[#C7C8CA] shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            
            {/* Logo / Branding */}
            <div className="flex items-center gap-2">
              <Leaf className="text-[#84BD00]" size={28} fill="currentColor" />
              <span className="text-2xl font-serif text-[#006F44] tracking-tight lowercase">
                nutrilite&trade;
              </span>
            </div>

            {/* Menu de Navegação Limpo (Sem bordas quadradas) */}
            <nav className="hidden md:flex space-x-8">
              {navItems.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors duration-200 ${
                    path === item.href
                      ? 'border-[#006F44] text-[#006F44]' // Aba ativa
                      : 'border-transparent text-[#211E16] hover:border-[#84BD00] hover:text-[#84BD00]' // Aba inativa
                  }`}
                >
                  {item.label}
                </a>
              ))}
            </nav>

            {/* Perfil e Saída */}
            <div className="flex items-center gap-4">
              <span className="text-xs text-[#C7C8CA] hidden sm:block">Ambiente de Homologação (VPS)</span>
              <button className="flex items-center gap-2 text-sm font-medium text-[#211E16] hover:text-[#006F44] transition-colors">
                <LogOut size={18} />
                Sair
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Área de renderização das telas internas */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}