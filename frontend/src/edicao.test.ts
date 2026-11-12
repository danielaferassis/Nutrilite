import { describe, expect, it } from 'vitest';

import { camposAlterados } from './edicao';

describe('camposAlterados', () => {
  it('devolve só os campos que mudaram', () => {
    const original = { erva_id: 1, kg: '120.000', prazo: '2026-12-10', observacao: null };
    const novo = { erva_id: 1, kg: '120.000', prazo: '2026-12-15', observacao: null };

    expect(camposAlterados(novo, original)).toEqual({ prazo: '2026-12-15' });
  });

  it('não acusa mudança quando o decimal só muda de formato', () => {
    // A API manda "120.000"; o input pode devolver "120"
    expect(camposAlterados({ kg: '120' }, { kg: '120.000' })).toEqual({});
    expect(camposAlterados({ kg: '120.5' }, { kg: '120.000' })).toEqual({ kg: '120.5' });
  });

  it('trata limpar a observação como mudança', () => {
    expect(camposAlterados({ observacao: null }, { observacao: 'chuva' })).toEqual({ observacao: null });
  });

  it('compara datas como texto, não como número', () => {
    expect(camposAlterados({ inicio: '2026-12-01' }, { inicio: '2026-12-01' })).toEqual({});
    expect(camposAlterados({ inicio: '2026-12-02' }, { inicio: '2026-12-01' })).toEqual({ inicio: '2026-12-02' });
  });

  it('campo vazio não é igual a zero', () => {
    expect(camposAlterados({ reserva_kg: '' }, { reserva_kg: '0' })).toEqual({ reserva_kg: '' });
  });
});
