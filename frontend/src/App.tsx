import {
  CalendarDays,
  ChartLine,
  CircleSlash,
  Grid3x3,
  KeyRound,
  LayoutDashboard,
  Leaf,
  ListChecks,
  LogOut,
  LucideIcon,
  Menu,
  Sprout,
  Upload,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import { ReactNode, useState } from 'react';

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
  icone: LucideIcon;
  /** Grupo no menu lateral. */
  grupo: string;
  /** Funcionalidade exigida para ver o link; sem ela a rota é aberta a qualquer usuário logado. */
  permissao?: string;
}

const ROTAS: Rota[] = [
  { path: '/dashboard', titulo: 'Dashboard', tela: <DashboardPCP />, icone: LayoutDashboard, grupo: 'Visão geral' },
  { path: '/demandas', titulo: 'Gestão de Demandas', tela: <GestaoDemandas />, icone: ChartLine, grupo: 'Planejamento' },
  { path: '/previsoes', titulo: 'Entrada de Previsões', tela: <EntradaPrevisoes />, icone: Sprout, grupo: 'Planejamento' },
  { path: '/planos', titulo: 'Plano de Secagem', tela: <PlanoSecagem />, icone: CalendarDays, grupo: 'Planejamento' },
  { path: '/cronograma', titulo: 'Cronograma e Recebimentos', tela: <CronogramaRecebimentos />, icone: ListChecks, grupo: 'Planejamento' },
  { path: '/bloqueios', titulo: 'Bloqueios de Secador', tela: <Bloqueios />, icone: CircleSlash, grupo: 'Planejamento' },
  { path: '/matriz', titulo: 'Matriz de Capacidade', tela: <MatrizCapacidade />, icone: Grid3x3, grupo: 'Cadastros e dados' },
  { path: '/importacao-infinity', titulo: 'Importação Infinity', tela: <ImportacaoInfinity />, icone: Upload, grupo: 'Cadastros e dados' },
];

// Só aparecem para quem tem a permissão (o backend também exige a mesma)
const ROTAS_ADMINISTRACAO: Rota[] = [
  { path: '/usuarios', titulo: 'Usuários', tela: <GestaoUsuarios />, icone: UserCog, grupo: 'Administração', permissao: 'usuario.gerenciar' },
  { path: '/grupos', titulo: 'Grupos', tela: <GestaoGrupos />, icone: Users, grupo: 'Administração', permissao: 'grupo.gerenciar' },
  { path: '/permissoes', titulo: 'Permissões de Acesso', tela: <PermissoesAcesso />, icone: KeyRound, grupo: 'Administração', permissao: 'grupo.gerenciar' },
];

function Link({ rota, atual }: { rota: Rota; atual: string }) {
  const ativo = rota.path === atual;
  const Icone = rota.icone;
  return (
    <a
      href={rota.path}
      aria-current={ativo ? 'page' : undefined}
      className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-200 ${
        ativo ? 'bg-white/12 font-semibold text-white' : 'text-white/80 hover:bg-white/8 hover:text-white'
      }`}
    >
      {/* Marcador lima do item ativo, colado na borda do menu */}
      {ativo && <span aria-hidden="true" className="absolute -left-3 top-2 bottom-2 w-1 rounded-r bg-lima-500" />}
      <Icone aria-hidden="true" className="size-[18px] shrink-0" />
      {rota.titulo}
    </a>
  );
}

function Navegacao({ atual }: { atual: string }) {
  const { pode } = useSessao();
  const visiveis = [...ROTAS, ...ROTAS_ADMINISTRACAO.filter((r) => !r.permissao || pode(r.permissao))];
  const grupos = [...new Set(visiveis.map((r) => r.grupo))];
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
      {grupos.map((grupo) => (
        <div key={grupo} className="space-y-1">
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-white/50">{grupo}</p>
          {visiveis.filter((r) => r.grupo === grupo).map((r) => <Link key={r.path} rota={r} atual={atual} />)}
        </div>
      ))}
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

const iniciais = (nome: string) =>
  nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');

function UsuarioLogado() {
  const { sessao } = useSessao();
  const nome = sessao?.usuario.nome ?? '';
  return (
    <div className="flex items-center gap-3 rounded-lg bg-white/6 p-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-lima-500 text-sm font-bold text-verde-900">
        {iniciais(nome) || '·'}
      </div>
      <p className="min-w-0 flex-1 truncate text-sm font-medium text-white">{nome}</p>
      <button
        type="button"
        title="Sair"
        aria-label="Sair"
        onClick={async () => {
          await fetch('/api/auth/logout', { method: 'POST' }); // Invalida o cookie de sessão
          window.location.href = '/login';
        }}
        className="rounded-md p-1.5 text-white/70 transition-colors hover:bg-red-600 hover:text-white"
      >
        <LogOut aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}

export default function App() {
  const path = window.location.pathname;
  // Menu do celular (no computador ele fica sempre aberto)
  const [menuAberto, setMenuAberto] = useState(false);

  // Rotas públicas
  if (path === '/login' || path === '/') return <Login />;

  // Layout restrito para o restante da aplicação
  return (
    <SessaoProvider>
      <FeedbackProvider>
        <div className="min-h-screen bg-fundo md:flex">
          <aside className="flex flex-col bg-verde-900 text-white md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0">
            <div className="flex items-center justify-between px-5 py-5">
              <a href="/dashboard" className="flex items-center gap-2.5 text-base font-bold">
                <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-lima-500 to-verde-600">
                  <Leaf aria-hidden="true" className="size-[18px]" />
                </span>
                Nutrilite PCP
              </a>
              <button
                type="button"
                aria-label={menuAberto ? 'Fechar menu' : 'Abrir menu'}
                aria-expanded={menuAberto}
                onClick={() => setMenuAberto(!menuAberto)}
                className="rounded-md p-1.5 hover:bg-white/10 md:hidden"
              >
                {menuAberto ? <X className="size-5" /> : <Menu className="size-5" />}
              </button>
            </div>
            <div className={`${menuAberto ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col md:flex`}>
              <Navegacao atual={path} />
              <div className="p-3">
                <UsuarioLogado />
              </div>
            </div>
          </aside>
          <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
            {/* Cada tela entra com um leve deslizar */}
            <div key={path} className="mx-auto max-w-7xl animate-entra">
              <Tela path={path} />
            </div>
          </main>
        </div>
      </FeedbackProvider>
    </SessaoProvider>
  );
}
