import React, { useState } from 'react';
import { LayoutDashboard, Target, Sprout, Settings, LogOut, Menu } from 'lucide-react';

// Importação dos ecrãs previamente desenvolvidos
import Login from './components/Login';
import DashboardPCP from './components/DashboardPCP';
import GestaoDemandas from './components/GestaoDemandas';
import EntradaPrevisoes from './components/EntradaPrevisoes';
import MatrizCapacidade from './components/MatrizCapacidade';

export default function App() {
  // Simulação de estado global de Autenticação (Sessão) e Roteamento
  const [isAuth, setIsAuth] = useState(false);
  const [telaAtiva, setTelaAtiva] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Barreira de segurança: impede o acesso a dados sem autenticação (LGPD)
  if (!isAuth) {
    return (
      <div onClick={() => setIsAuth(true)}>
        <Login />
      </div>
    );
  }

  const renderScreen = () => {
    switch (telaAtiva) {
      case 'dashboard': return <DashboardPCP />;
      case 'demandas': return <GestaoDemandas />;
      case 'previsoes': return <EntradaPrevisoes />;
      case 'cadastros': return <MatrizCapacidade />;
      default: return <DashboardPCP />;
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f4f5] flex">
      {/* Sidebar de Navegação - Identidade Visual */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-[#006F44] text-white transition-all duration-300 flex flex-col shadow-xl`}>
        <div className="h-16 flex items-center justify-between px-4 border-b border-green-800">
          {sidebarOpen && <span className="font-bold text-lg tracking-wider">SI NUTRILITE</span>}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1 hover:bg-green-700 rounded">
            <Menu size={24} />
          </button>
        </div>
        
        <nav className="flex-1 py-4 space-y-2 px-2">
          <NavItem icone={<LayoutDashboard />} label="Dashboard PCP" ativo={telaAtiva === 'dashboard'} onClick={() => setTelaAtiva('dashboard')} open={sidebarOpen} />
          <NavItem icone={<Target />} label="Gestão de Demandas" ativo={telaAtiva === 'demandas'} onClick={() => setTelaAtiva('demandas')} open={sidebarOpen} />
          <NavItem icone={<Sprout />} label="Entrada do Campo" ativo={telaAtiva === 'previsoes'} onClick={() => setTelaAtiva('previsoes')} open={sidebarOpen} />
          <NavItem icone={<Settings />} label="Cadastros e Regras" ativo={telaAtiva === 'cadastros'} onClick={() => setTelaAtiva('cadastros')} open={sidebarOpen} />
        </nav>

        <div className="p-4 border-t border-green-800">
          <button onClick={() => setIsAuth(false)} className="flex items-center gap-3 w-full p-2 hover:bg-green-700 rounded text-red-200 hover:text-white transition-colors">
            <LogOut size={20} />
            {sidebarOpen && <span>Sair do Sistema</span>}
          </button>
        </div>
      </aside>

      {/* Área Principal de Renderização */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white shadow-sm flex items-center px-6">
          <h2 className="text-xl font-semibold text-[#211E16]">Ambiente de Homologação (VPS)</h2>
        </header>
        <div className="flex-1 overflow-auto p-4">
          {renderScreen()}
        </div>
      </main>
    </div>
  );
}

// Correção aplicada ao namespace: utilização de React.ReactNode em vez de JSX.Element
function NavItem({ icone, label, ativo, onClick, open }: { icone: React.ReactNode, label: string, ativo: boolean, onClick: () => void, open: boolean }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3 rounded-md transition-colors ${ativo ? 'bg-[#84BD00] text-[#211E16] font-medium' : 'text-gray-100 hover:bg-green-800'}`}
      title={label}
    >
      {icone}
      {open && <span className="whitespace-nowrap">{label}</span>}
    </button>
  );
}