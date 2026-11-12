/**
 * Corpo do PATCH com só os campos que mudaram em relação ao registro original.
 *
 * Mandar o formulário inteiro faria o backend revalidar o que não mudou: por
 * exemplo, uma demanda de erva que foi desativada não poderia mais ter o prazo
 * corrigido, porque o erva_id reenviado seria recusado.
 */
export function camposAlterados<T extends Record<string, unknown>>(novo: T, original: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(novo).filter(([campo, valor]) => !mesmoValor(valor, original[campo]))
  ) as Partial<T>;
}

// Decimais chegam da API como texto ("120.000") e o input pode devolver "120"
const mesmoValor = (a: unknown, b: unknown) => {
  if (a === b) return true;
  if (typeof a === 'string' && typeof b === 'string' && a.trim() !== '' && b.trim() !== '') {
    const [x, y] = [Number(a), Number(b)];
    // Datas ("2026-12-01") e textos viram NaN e caem na comparação exata acima
    return !Number.isNaN(x) && !Number.isNaN(y) && x === y;
  }
  return false;
};
