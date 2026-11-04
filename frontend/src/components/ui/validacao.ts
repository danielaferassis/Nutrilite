import { FormEvent, ForwardedRef, useCallback, useEffect, useRef } from 'react';

import { formatarData } from '../../formatar';

type Campo = HTMLInputElement | HTMLSelectElement;

// O type="email" do navegador aceita "nome@empresa" (sem ponto), o backend não
export const PADRAO_EMAIL = '[^@\\s]+@[^@\\s]+\\.[^@\\s]+';
const MSG_EMAIL = 'Informe um e-mail válido, como nome@empresa.com.br.';

const casasDecimais = (step: string) => (step.includes('.') ? step.split('.')[1].length : 0);

const limite = (el: HTMLInputElement, valor: string) =>
  el.type === 'date' ? formatarData(valor) : valor.replace('.', ',');

/** Mensagem em português para o motivo de o campo estar inválido. */
export function mensagemDeValidacao(el: Campo): string {
  const v = el.validity;
  if (el instanceof HTMLSelectElement) return 'Selecione uma opção.';
  const email = el.type === 'email';

  if (v.valueMissing) {
    if (el.type === 'checkbox') return 'Marque esta opção para continuar.';
    if (el.type === 'file') return 'Selecione um arquivo.';
    return 'Preencha este campo.';
  }
  if (v.badInput) {
    if (el.type === 'number') return 'Informe um número válido (use vírgula ou ponto para decimais).';
    if (el.type === 'date') return 'Informe uma data completa e válida.';
    return 'O valor informado não é válido.';
  }
  if (v.typeMismatch || v.patternMismatch) {
    if (email) return MSG_EMAIL;
    if (el.type === 'url') return 'Informe um endereço válido, como https://exemplo.com.br.';
    return el.title || 'O valor não está no formato esperado.';
  }
  if (v.tooShort) {
    return `Use pelo menos ${el.minLength} caracteres (agora são ${el.value.length}).`;
  }
  if (v.tooLong) return `Use no máximo ${el.maxLength} caracteres.`;
  if (v.rangeUnderflow) {
    return el.type === 'date'
      ? `Informe uma data a partir de ${limite(el, el.min)}.`
      : `O valor deve ser maior ou igual a ${limite(el, el.min)}.`;
  }
  if (v.rangeOverflow) {
    return el.type === 'date'
      ? `Informe uma data até ${limite(el, el.max)}.`
      : `O valor deve ser menor ou igual a ${limite(el, el.max)}.`;
  }
  if (v.stepMismatch) {
    const casas = casasDecimais(el.step);
    if (el.type === 'number' && /^0?\.0*1$|^1$/.test(el.step)) {
      return casas === 0 ? 'Informe um número inteiro.' : `Use no máximo ${casas} casa(s) decimal(is).`;
    }
    return `Informe um valor em intervalos de ${el.step.replace('.', ',')}.`;
  }
  return 'O valor informado não é válido.';
}

/**
 * Troca as mensagens de validação do navegador (que seguem o idioma dele)
 * por mensagens em português. Devolve o ref a usar no elemento e os handlers.
 */
export function useValidacaoPt<T extends Campo>(ref: ForwardedRef<T>, valor: unknown) {
  const interno = useRef<T | null>(null);

  const juntarRef = useCallback(
    (el: T | null) => {
      interno.current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) ref.current = el;
    },
    [ref]
  );

  // Valor mudou (digitação ou setState): volta a valer só a validação do navegador,
  // senão a mensagem antiga continuaria bloqueando o envio
  useEffect(() => {
    interno.current?.setCustomValidity('');
  }, [valor]);

  const aoInvalidar = (e: FormEvent<T>) => {
    const el = e.currentTarget;
    el.setCustomValidity('');
    if (!el.validity.valid) el.setCustomValidity(mensagemDeValidacao(el));
  };

  const aoDigitar = (e: FormEvent<T>) => e.currentTarget.setCustomValidity('');

  return { ref: juntarRef, aoInvalidar, aoDigitar };
}
