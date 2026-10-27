import React, { useState } from 'react';
import { Lock, Mail, ShieldCheck } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // A chamada para api.login(credenciais) será implementada aqui
    console.log('Autenticando:', email);
  };

  return (
    // Fundo da página com textura leve e centralização absoluta (Flexbox)
    <div className="min-h-screen bg-[#f4f4f5] flex items-center justify-center p-4 font-sans">
      
      {/* Contêiner do formulário com profundidade (shadow) e cantos arredondados */}
      <div className="max-w-md w-full bg-white rounded-xl shadow-xl border border-gray-200 p-8">
        
        {/* Cabeçalho do Login */}
        <div className="text-center mb-8 flex flex-col items-center">
          <div className="bg-[#006F44] p-3 rounded-full mb-4 shadow-sm">
            <ShieldCheck size={32} className="text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 tracking-tight">Acesso ao Sistema</h2>
          <p className="text-sm text-gray-500 mt-2">
            Insira suas credenciais corporativas para continuar.
          </p>
        </div>

        {/* Formulário com espaçamento consistente (space-y) */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              E-mail Corporativo
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail size={18} className="text-gray-400" />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#84BD00] focus:border-[#84BD00] transition-colors text-gray-900 bg-gray-50 focus:bg-white sm:text-sm"
                placeholder="nome@nutrilite.com.br"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Senha
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock size={18} className="text-gray-400" />
              </div>
              <input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#84BD00] focus:border-[#84BD00] transition-colors text-gray-900 bg-gray-50 focus:bg-white sm:text-sm"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-[#006F44] hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-700 transition-all active:scale-[0.98]"
          >
            Entrar de forma segura
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-gray-400 border-t pt-4">
          Ambiente protegido e monitorado. Sujeito às políticas de governança e proteção de dados (LGPD).
        </div>
      </div>
    </div>
  );
}