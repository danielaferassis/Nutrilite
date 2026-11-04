import { FormEvent, useState } from 'react';

import { apiFetch, textoDoErro } from '../api';
import { logger } from '../logger';
import { Alerta, Button, Card, Input } from './ui';

export default function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    try {
      await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, senha }),
      });
      logger.info('Login bem-sucedido');
      window.location.href = '/dashboard';
    } catch (err) {
      // O backend já diferencia senha errada (401) de excesso de tentativas (429)
      setErro(textoDoErro(err));
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F9FAFB] px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <p className="text-3xl font-bold text-[#006F44]">Nutrilite PCP</p>
          <p className="text-sm text-gray-500 mt-1">Planejamento da secagem de ervas</p>
        </div>

        <Card className="p-8">
          <h1 className="text-lg font-semibold text-[#211E16] mb-6">Entrar no sistema</h1>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {erro && <Alerta>{erro}</Alerta>}
            <Input
              label="E-mail"
              type="email"
              autoComplete="username"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              label="Senha"
              type="password"
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
            />
            <Button type="submit" className="w-full mt-2" disabled={enviando}>
              {enviando ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
