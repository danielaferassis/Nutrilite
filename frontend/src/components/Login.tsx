import React, { useState } from 'react';
import { Card, Input, Button } from './ui';
import { apiFetch } from '../api';
import { logger } from '../logger';

export default function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, senha })
      });
      logger.info('Login bem-sucedido');
      window.location.href = '/dashboard';
    } catch (err: any) {
      setErro('Credenciais inválidas ou conta bloqueada por múltiplas tentativas.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB]">
      <Card className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-[#006F44] mb-6 text-center">Acesso ao Sistema</h1>
        {erro && <div className="bg-red-50 text-red-700 p-3 rounded mb-4 text-sm">{erro}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input 
            label="E-mail Corporativo" 
            type="email" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            required 
          />
          <Input 
            label="Senha" 
            type="password" 
            value={senha} 
            onChange={(e) => setSenha(e.target.value)} 
            required 
          />
          <Button type="submit" variant="primary" className="w-full mt-2">
            Entrar
          </Button>
        </form>
      </Card>
    </div>
  );
}