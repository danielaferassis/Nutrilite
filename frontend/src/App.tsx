import { ReactNode } from 'react';

import Login from './components/Login';
import DashboardPCP from './components/DashboardPCP';
import GestaoDemandas from './components/GestaoDemandas';
import EntradaPrevisoes from './components/EntradaPrevisoes';
import MatrizCapacidade from './components/MatrizCapacidade';
import ImportacaoInfinity from './components/ImportacaoInfinity';
import PlanoSecagem from './components/PlanoSecagem';
import Bloqueios from './components/Bloqueios';
import CronogramaRecebimentos from './components/CronogramaRecebimentos';
import GestaoUsuarios from './components/GestaoUsuarios';
import GestaoGrupos from './components/GestaoGrupos';
import PermissoesAcesso from './components/PermissoesAcesso';
import { Alerta } from './components/ui';
import { FeedbackProvider } from './feedback';
import { SessaoProvider, useSessao } from './sessao';

interface Rota {
  path: string;
  titulo: string;
  tela: ReactNode;
  /** Funcionalidade exigida para ver o link; sem ela a rota é aberta a qualquer usuário logado. */
  permissao?: string;
}

const ROTAS: Rota[] = [
  { path: '/dashboard', titulo: 'Dashboard', tela: <DashboardPCP /> },
  { path: '/demandas', titulo: 'Gestão de Demandas', tela: <GestaoDemandas /> },
  { path: '/previsoes', titulo: 'Entrada de Previsões', tela: <EntradaPrevisoes /> },
  { path: '/planos', titulo: 'Plano de Secagem', tela: <PlanoSecagem /> },
  { path: '/cronograma', titulo: 'Cronograma e Recebimentos', tela: <CronogramaRecebimentos /> },
  { path: '/bloqueios', titulo: 'Bloqueios de Secador', tela: <Bloqueios /> },
  { path: '/matriz', titulo: 'Matriz de Capacidade', tela: <MatrizCapacidade /> },
  { path: '/importacao-infinity', titulo: 'Importação Infinity', tela: <ImportacaoInfinity /> },
];

// Só aparecem para quem tem a permissão (o backend também exige a mesma)
const ROTAS_ADMINISTRACAO: Rota[] = [
  { path: '/usuarios', titulo: 'Usuários', tela: <GestaoUsuarios />, permissao: 'usuario.gerenciar' },
  { path: '/grupos', titulo: 'Grupos', tela: <GestaoGrupos />, permissao: 'grupo.gerenciar' },
  { path: '/permissoes', titulo: 'Permissões de Acesso', tela: <PermissoesAcesso />, permissao: 'grupo.gerenciar' },
];

function Link({ rota, atual }: { rota: Rota; atual: string }) {
  const ativo = rota.path === atual;
  return (
    <a
      href={rota.path}
      aria-current={ativo ? 'page' : undefined}
      className={`block px-4 py-2 rounded hover:bg-[#211E16] ${ativo ? 'bg-[#211E16]/60' : ''}`}
    >
      {rota.titulo}
    </a>
  );
}

function Navegacao({ atual }: { atual: string }) {
  const { pode } = useSessao();
  const administracao = ROTAS_ADMINISTRACAO.filter((r) => !r.permissao || pode(r.permissao));
  return (
    <nav className="flex-1 p-4 space-y-2">
      {ROTAS.map((r) => <Link key={r.path} rota={r} atual={atual} />)}
      {administracao.length > 0 && (
        <>
          <p className="px-4 pt-4 text-xs font-semibold uppercase tracking-wide text-[#FFFFFF]/60">
            Administração
          </p>
          {administracao.map((r) => <Link key={r.path} rota={r} atual={atual} />)}
        </>
      )}
    </nav>
  );
}

function Tela({ path }: { path: string }) {
  const { pode } = useSessao();
  const rota = [...ROTAS, ...ROTAS_ADMINISTRACAO].find((r) => r.path === path);
  if (!rota) return <Alerta tipo="aviso">Página não encontrada.</Alerta>;
  if (rota.permissao && !pode(rota.permissao)) {
    return <Alerta>Você não tem permissão para acessar {rota.titulo}.</Alerta>;
  }
  return <>{rota.tela}</>;
}

function UsuarioLogado() {
  const { sessao } = useSessao();
  return <p className="text-sm mb-3 text-[#FFFFFF]/80">{sessao?.usuario.nome}</p>;
}

export default function App() {
  const path = window.location.pathname;

  // Rotas públicas
  if (path === '/login' || path === '/') return <Login />;

  // Layout restrito para o restante da aplicação
  return (
    <SessaoProvider>
      <FeedbackProvider>
        <div className="min-h-screen bg-[#F9FAFB] flex flex-col md:flex-row">
          <aside className="w-full md:w-64 bg-[#006F44] text-[#FFFFFF] flex flex-col">
            <div className="p-6 text-xl font-bold border-b border-[#FFFFFF]/20">Nutrilite PCP</div>
            <Navegacao atual={path} />
            <div className="p-4 border-t border-[#FFFFFF]/20">
              <UsuarioLogado />
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
            <Tela path={path} />
          </main>
        </div>
      </FeedbackProvider>
    </SessaoProvider>
  );
}
