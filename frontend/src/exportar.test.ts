import { describe, expect, it } from 'vitest';

import { dataCsv, gerarCsv, numeroCsv } from './exportar';

const BOM = '﻿';

describe('gerarCsv', () => {
  it('usa ";" e linhas CRLF, começando pelo BOM para o Excel ler os acentos', () => {
    const csv = gerarCsv([{ erva: 'Agrião', kg: 1234.5 }], [
      { titulo: 'Erva', valor: (l) => l.erva },
      { titulo: 'Kg', valor: (l) => numeroCsv(l.kg) },
    ]);

    expect(csv).toBe(`${BOM}Erva;Kg\r\nAgrião;1234,5\r\n`);
  });

  it('põe entre aspas o texto com ";", aspas ou quebra de linha', () => {
    const csv = gerarCsv([{ t: 'a;b' }, { t: 'diz "oi"' }, { t: 'linha1\nlinha2' }], [{ titulo: 'T', valor: (l) => l.t }]);

    expect(csv.split('\r\n').slice(1, 4)).toEqual(['"a;b"', '"diz ""oi"""', '"linha1\nlinha2"']);
  });

  it('neutraliza texto que o Excel leria como fórmula, mas mantém números negativos', () => {
    const csv = gerarCsv([{ t: '=HYPERLINK("x")' }, { t: '@SOMA(A1)' }, { t: numeroCsv(-300) }], [
      { titulo: 'T', valor: (l) => l.t },
    ]);

    expect(csv.split('\r\n').slice(1, 4)).toEqual(['"\'=HYPERLINK(""x"")"', "'@SOMA(A1)", '-300']);
  });

  it('vazio fica vazio, nunca zero', () => {
    const csv = gerarCsv([{ v: null }], [{ titulo: 'V', valor: (l) => numeroCsv(l.v) }]);

    expect(csv).toBe(`${BOM}V\r\n\r\n`);
  });
});

describe('formatos', () => {
  it('número com vírgula decimal, sem milhar e no máximo 3 casas', () => {
    expect(numeroCsv('120.000')).toBe('120');
    expect(numeroCsv(1234567.8915)).toBe('1234567,892');
    expect(numeroCsv(undefined)).toBe('');
  });

  it('data no formato dd/mm/aaaa', () => {
    expect(dataCsv('2026-12-05')).toBe('05/12/2026');
    expect(dataCsv(null)).toBe('');
  });
});
