import { useState } from 'react';
import { api } from '../api'; // Certifique-se de que a interface Previsao está exportada aqui
import { logger } from '../logger';

export function EntradaPrevisoes() {
  const [cultura, setCultura] = useState('');
  const [volume, setVolume] = useState('');
  const [semana, setSemana] = useState('');
  const [loading, setLoading] = useState(false); // Adição de estado de carregamento

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      // Uso do método de domínio tipado ao invés do .post() genérico
      await api.enviarPrevisao({ 
        cultura, 
        volume_kg: Number(volume), // Garantir que o nome da propriedade bate com a API
        semana 
      });
      
      // Log seguro: não expõe dados estratégicos da indústria no console do navegador[cite: 4, 5]
      logger.info('Previsão submetida com sucesso para o servidor.');
      alert('Previsão enviada com sucesso para análise do PCP.');
      
      // Limpeza do formulário após sucesso
      setCultura('');
      setVolume('');
      setSemana('');
    } catch (error) {
      logger.error('Erro ao registrar previsão no servidor', error);
      alert('Ocorreu um erro ao enviar a previsão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h2>Lançamento de Previsões de Colheita</h2>
      <p>Interface exclusiva para Fazenda Própria, Procompete e P&D.</p>
      
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <label>Tipo de Erva/Cultura:
          <select value={cultura} onChange={(e) => setCultura(e.target.value)} required>
            <option value="">Selecione...</option>
            <option value="Agrião">Agrião</option>
            <option value="Camomila">Camomila</option>
            <option value="Picão-preto">Picão-preto</option>
            <option value="Salsa">Salsa</option>
          </select>
        </label>

        <label>Volume Previsto (Kg):
          <input type="number" min="1" value={volume} onChange={(e) => setVolume(e.target.value)} required disabled={loading} />
        </label>

        <label>Semana/Data Estimada:
          {/* Validações futuras de regex podem ser aplicadas aqui para garantir o formato W32 */}
          <input type="text" placeholder="Ex: W32" value={semana} onChange={(e) => setSemana(e.target.value)} required disabled={loading} />
        </label>

        <button type="submit" disabled={loading} style={{ padding: '10px', background: loading ? '#ccc' : '#0056b3', color: 'white', border: 'none' }}>
          {loading ? 'Registrando...' : 'Registrar Previsão'}
        </button>
      </form>
    </div>
  );
}