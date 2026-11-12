import { describe, expect, it, vi } from 'vitest';

import { ERRO_CONEXAO, ErroApi, apiFetch, query } from './api';
import { Resposta, instalarApiFalsa } from './test/apiFalsa';

describe('query', () => {
  it('ignora filtros vazios', () => {
    expect(query({ erva_id: '', prazo_de: '2026-12-01', prazo_ate: null })).toBe('?prazo_de=2026-12-01');
    expect(query({ origem: undefined })).toBe('');
  });
});

describe('apiFetch', () => {
  it('usa a mensagem do backend quando ela vem como texto', async () => {
    instalarApiFalsa({
      'DELETE /previsoes/1': new Resposta(409, { detail: 'Previsão já recebida não pode ser alterada nem removida' }),
    });

    await expect(apiFetch('/previsoes/1', { method: 'DELETE' })).rejects.toMatchObject({
      status: 409,
      message: 'Previsão já recebida não pode ser alterada nem removida',
    });
  });

  it('junta as mensagens de validação (422) sem repetir', async () => {
    const detail = [
      { loc: ['body', 'kg'], msg: 'Kg deve ser maior que 0.' },
      { loc: ['body', 'reserva_kg'], msg: 'Kg deve ser maior que 0.' },
      { loc: ['body', 'prazo'], msg: 'Prazo é obrigatório.' },
    ];
    instalarApiFalsa({ 'POST /demandas': new Resposta(422, { detail }) });

    await expect(apiFetch('/demandas', { method: 'POST', body: '{}' })).rejects.toThrow(
      'Kg deve ser maior que 0. Prazo é obrigatório.'
    );
  });

  it('sem mensagem no corpo, usa um texto em português pelo status', async () => {
    instalarApiFalsa({ 'GET /demandas': new Resposta(403) });

    await expect(apiFetch('/demandas')).rejects.toThrow('Você não tem permissão para esta ação.');
  });

  it('falha de rede vira mensagem de conexão', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const erro = await apiFetch('/demandas').catch((e) => e);
    expect(erro).toBeInstanceOf(ErroApi);
    expect(erro.message).toBe(ERRO_CONEXAO);
  });

  it('204 devolve null', async () => {
    instalarApiFalsa({ 'DELETE /demandas/1': null });

    await expect(apiFetch('/demandas/1', { method: 'DELETE' })).resolves.toBeNull();
  });
});
