/**
 * Exportação de tabelas para CSV no formato que o Excel em português abre
 * direto: separador ";", vírgula decimal, datas dd/mm/aaaa e UTF-8 com BOM
 * (sem o BOM o Excel troca os acentos).
 */

export interface Coluna<T> {
  titulo: string;
  valor: (linha: T) => string | number | null | undefined;
}

const SEPARADOR = ';';

/** Número com vírgula decimal e sem separador de milhar ("1234,5"). */
export const numeroCsv = (valor: number | string | null | undefined) =>
  valor === null || valor === undefined || valor === ''
    ? ''
    : Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 3, useGrouping: false });

/** Data ISO (aaaa-mm-dd) como dd/mm/aaaa. */
export const dataCsv = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

const celula = (valor: string | number | null | undefined) => {
  let texto = valor === null || valor === undefined ? '' : String(valor);
  // Texto que começa com = + @ seria lido pelo Excel como fórmula (injeção de fórmula).
  // O "-" fica de fora: é o sinal dos números negativos (ex.: desvio de -300 kg).
  if (/^[=+@\t\r]/.test(texto)) texto = `'${texto}`;
  return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
};

export function gerarCsv<T>(linhas: T[], colunas: Coluna<T>[]): string {
  const cabecalho = colunas.map((c) => celula(c.titulo)).join(SEPARADOR);
  const corpo = linhas.map((linha) => colunas.map((c) => celula(c.valor(linha))).join(SEPARADOR));
  return '﻿' + [cabecalho, ...corpo].join('\r\n') + '\r\n';
}

/** Faz o navegador baixar `conteudo` como `nomeArquivo`. */
export function baixarCsv(nomeArquivo: string, conteudo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  link.click();
  URL.revokeObjectURL(url);
}
