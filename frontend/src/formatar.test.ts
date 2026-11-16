import { describe, expect, it } from 'vitest';

import { diasSubstituidos } from './formatar';

const h = (inicio: string, fim: string) => ({ inicio: `2026-12-${inicio}`, fim: `2026-12-${fim}` });

describe('diasSubstituidos', () => {
  it('anterior inteiro dentro do novo: substituição completa', () => {
    expect(diasSubstituidos(h('01', '10'), h('03', '07'))).toBeNull();
    expect(diasSubstituidos(h('01', '07'), h('01', '07'))).toBeNull();
  });

  it('sobreposição parcial: só os dias em comum', () => {
    expect(diasSubstituidos(h('05', '14'), h('01', '07'))).toEqual({ de: '2026-12-05', ate: '2026-12-07' });
    expect(diasSubstituidos(h('01', '04'), h('03', '09'))).toEqual({ de: '2026-12-03', ate: '2026-12-04' });
  });

  it('novo no meio do anterior: só o miolo', () => {
    expect(diasSubstituidos(h('04', '06'), h('01', '10'))).toEqual({ de: '2026-12-04', ate: '2026-12-06' });
  });
});
