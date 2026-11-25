import { LogIn } from 'lucide-react';
import { FormEvent, useState } from 'react';

import { apiFetch, textoDoErro } from '../api';
import { logger } from '../logger';
import { NOME_SISTEMA } from '../marca';
import FundoLogin, { FUNDO_LOGIN } from './FundoLogin';
import { Alerta, Button, Input, LogoCompleto } from './ui';

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
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12"
      style={{ background: FUNDO_LOGIN }}
    >
      <FundoLogin />

      <div className="relative w-full max-w-md animate-surge">
        <div className="relative overflow-hidden rounded-xl border border-verde-700/15 bg-white p-10 shadow-[0_1px_2px_rgb(33_30_22/0.05),0_20px_50px_-16px_rgb(20_50_30/0.25)] ring-4 ring-white/60">
          {/* Faixa da marca no topo: separa o cartão do fundo claro sem pesar */}
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-verde-700 via-verde-600 to-lima-500" />
          <div className="mb-7 flex flex-col items-center gap-2 text-center">
            <h1 aria-label={NOME_SISTEMA} className="flex flex-col items-center gap-2">
              <LogoCompleto altura={44} />
              <span className="text-sm font-semibold uppercase tracking-[0.3em] text-suave">PCP</span>
            </h1>
          </div>

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
            <Button type="submit" tamanho="lg" icone={LogIn} carregando={enviando} className="mt-2 w-full">
              {enviando ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
