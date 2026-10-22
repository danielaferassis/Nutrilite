import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { logger } from '../logger';

export function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');
    setLoading(true);

    try {
      // Endpoint validado pela documentação do backend[cite: 4]
      await api.login({ email, senha });
      logger.info('Autenticação realizada com sucesso.'); // Log seguro[cite: 4, 37]
      navigate('/dashboard');
    } catch (error) {
      setErro('Credenciais inválidas. Verifique seu e-mail e senha.');
      logger.error('Falha de autenticação', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '400px', margin: '100px auto', padding: '20px', border: '1px solid #ccc', borderRadius: '8px' }}>
      <h2>Acesso ao Sistema Nutrilite</h2>
      {erro && <p style={{ color: 'red' }}>{erro}</p>}
      <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <label>
          E-mail Corporativo:
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: '100%' }} />
        </label>
        <label>
          Senha:
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required style={{ width: '100%' }} />
        </label>
        <button type="submit" disabled={loading} style={{ padding: '10px', background: '#0056b3', color: 'white' }}>
          {loading ? 'Autenticando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}