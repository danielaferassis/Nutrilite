import { useEffect, useState, type FormEvent } from 'react'
import { api } from './api' // Presume-se que api.ts contenha auth.me(), auth.login(), etc.
import { logger } from './logger'
// Importe seus componentes de domínio real aqui, ex: Dashboard, ImportacoesList
// import ImportacoesList from './components/ImportacoesList'

export default function App() {
  const [status, setStatus] = useState('verificando...')
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')

  useEffect(() => {
    // 1. Verifica a saúde da API
    api.health()
      .then((data) => setStatus(data.status))
      .catch(() => {
        logger.warn('API indisponível')
        setStatus('offline')
      })

    // 2. Verifica a sessão atual do usuário
    api.getMe()
      .then((user) => {
        logger.info(`Usuário autenticado: ${user.email}`)
        setIsAuthenticated(true)
      })
      .catch(() => {
        logger.info('Nenhuma sessão ativa encontrada.')
        setIsAuthenticated(false)
      })
  }, [])

  async function handleLogin(event: FormEvent) {
    event.preventDefault()
    if (!email.trim() || !senha.trim()) return

    try {
      await api.login({ email, senha })
      logger.info('Login realizado com sucesso')
      setIsAuthenticated(true)
    } catch (error) {
      logger.error('Falha na autenticação', error)
      alert('Credenciais inválidas ou erro no servidor.')
    }
  }

  async function handleLogout() {
    await api.logout()
    setIsAuthenticated(false)
  }

  if (isAuthenticated === null) {
    return <main><p>Carregando estado da aplicação...</p></main>
  }

  return (
    <main>
      <h1>Nutrilite - Planejamento de Secagem</h1>
      <p>Status da API: <strong>{status}</strong></p>

      {!isAuthenticated ? (
        <section className="login-section">
          <h2>Acesso ao Sistema</h2>
          <form onSubmit={handleLogin}>
            <input 
              type="email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              placeholder="E-mail corporativo" 
            />
            <input 
              type="password" 
              value={senha} 
              onChange={(e) => setSenha(e.target.value)} 
              placeholder="Senha" 
            />
            <button type="submit">Entrar</button>
          </form>
        </section>
      ) : (
        <section className="dashboard-section">
          <header>
            <button onClick={handleLogout}>Sair</button>
          </header>
          {/* A partir daqui, você renderizará os componentes de negócio exigidos */}
          {/* Exemplo: <ImportacoesList /> ou <PlanejamentoDashboard /> */}
          <p>Bem-vindo ao painel de controle do PCP.</p>
        </section>
      )}
    </main>
  )
}
