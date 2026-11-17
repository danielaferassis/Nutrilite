import { CircleCheck, Leaf } from 'lucide-react';
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
    <div className="min-h-screen bg-fundo lg:grid lg:grid-cols-2">
      {/* Painel da marca (só em telas largas) */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-verde-900 via-verde-700 to-verde-600 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden="true" className="absolute -right-24 -top-24 size-96 rounded-full bg-lima-500/20 blur-3xl" />
        <div aria-hidden="true" className="absolute -bottom-32 -left-16 size-96 rounded-full bg-white/5 blur-2xl" />
        <div className="relative flex items-center gap-3 text-lg font-bold">
          <span className="flex size-10 items-center justify-center rounded-xl bg-white/15">
            <Leaf aria-hidden="true" className="size-5" />
          </span>
          Nutrilite PCP
        </div>
        <div className="relative max-w-md animate-entra">
          <h2 className="text-4xl font-bold leading-tight tracking-tight">
            A erva fresca não espera. O plano também não.
          </h2>
          <ul className="mt-8 space-y-4 text-white/85">
            {[
              'Demanda, oferta prevista e capacidade dos secadores num só lugar',
              'Conflitos apontados antes de a erva chegar',
              'Plano aprovado com versão e rastreabilidade',
            ].map((texto) => (
              <li key={texto} className="flex gap-3">
                <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-lima-500" />
                {texto}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/60">Planejamento da secagem de ervas · Ubajara-CE</p>
      </div>

      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm animate-entra">
          <div className="text-center mb-6 lg:hidden">
            <p className="text-3xl font-bold text-verde-700">Nutrilite PCP</p>
            <p className="text-sm text-suave mt-1">Planejamento da secagem de ervas</p>
          </div>

          <Card className="p-8 shadow-elevada">
            <h1 className="text-xl font-bold text-tinta">Entrar no sistema</h1>
            <p className="mt-1 mb-6 text-sm text-suave">Use o e-mail e a senha cadastrados pelo administrador.</p>

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
    </div>
  );
}
