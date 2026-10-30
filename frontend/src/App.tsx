import Login from './components/Login';
import DashboardPCP from './components/DashboardPCP';
import GestaoDemandas from './components/GestaoDemandas';
import EntradaPrevisoes from './components/EntradaPrevisoes';
import MatrizCapacidade from './components/MatrizCapacidade';
import ImportacaoInfinity from './components/ImportacaoInfinity';

export default function App() {
  const path = window.location.pathname;

  // Rotas públicas
  if (path === '/login' || path === '/') return <Login />;

  // Layout restrito para o restante da aplicação
  return (
    <div className="min-h-screen bg-[#F9FAFB] flex flex-col md:flex-row">
      <aside className="w-full md:w-64 bg-[#006F44] text-[#FFFFFF] flex flex-col">
        <div className="p-6 text-xl font-bold border-b border-[#FFFFFF]/20">Nutrilite PCP</div>
        <nav className="flex-1 p-4 space-y-2">
          <a href="/dashboard" className="block px-4 py-2 rounded hover:bg-[#211E16]">Dashboard</a>
          <a href="/demandas" className="block px-4 py-2 rounded hover:bg-[#211E16]">Gestão de Demandas</a>
          <a href="/previsoes" className="block px-4 py-2 rounded hover:bg-[#211E16]">Entrada de Previsões</a>
          <a href="/matriz" className="block px-4 py-2 rounded hover:bg-[#211E16]">Matriz de Capacidade</a>
          <a href="/importacao-infinity" className="block px-4 py-2 rounded hover:bg-[#211E16]">Importação Infinity</a>
        </nav>
        <div className="p-4 border-t border-[#FFFFFF]/20">
          <button 
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' }); // Invalida o cookie de sessão
              window.location.href = '/login';
            }}
            className="w-full text-center py-2 bg-red-600 rounded hover:bg-red-700 transition-colors"
          >
            Sair
          </button>
        </div>
      </aside>
      <main className="flex-1 p-8 overflow-y-auto">
        {path === '/dashboard' && <DashboardPCP />}
        {path === '/demandas' && <GestaoDemandas />}
        {path === '/previsoes' && <EntradaPrevisoes />}
        {path === '/matriz' && <MatrizCapacidade />}
        {path === '/importacao-infinity' && <ImportacaoInfinity />}
      </main>
    </div>
  );
}