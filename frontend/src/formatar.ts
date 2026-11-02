import { Estagio, Origem, SituacaoChegada, StatusPlano, TipoPendencia } from './tipos';

/** "2026-12-01" → "01/12/2026". Sem `new Date`, que desloca o dia pelo fuso. */
export const formatarData = (iso: string) => {
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
};

export const formatarDataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR');

export const formatarNumero = (valor: number | string, casas = 1) =>
  Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: casas });

export const formatarKg = (valor: number | string) => `${formatarNumero(valor)} kg`;

export const formatarHoras = (valor: number | string) => `${formatarNumero(valor)} h`;

/** Data local de hoje em ISO (yyyy-mm-dd), somando `dias`. */
export const hojeIso = (dias = 0) => {
  const data = new Date();
  data.setDate(data.getDate() + dias);
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
};

export const ROTULO_ESTAGIO: Record<Estagio, string> = {
  fresco: 'Fresco',
  desidratado: 'Desidratado',
  moido: 'Moído',
};

export const ROTULO_ORIGEM: Record<Origem, string> = {
  fazenda_propria: 'Fazenda Própria',
  procompete: 'Procompete',
  pd: 'P&D',
};

export const ROTULO_STATUS: Record<StatusPlano, string> = {
  rascunho: 'Rascunho',
  aprovado: 'Aprovado',
  substituido: 'Substituído',
};

export const ROTULO_PENDENCIA: Record<TipoPendencia, string> = {
  param_ausente: 'Parâmetro ausente',
  capacidade_excedida: 'Capacidade excedida',
  atraso: 'Atraso',
  saldo_nao_alocado: 'Saldo não alocado',
};

// date.weekday() do Python: 0 = segunda … 6 = domingo
export const DIAS_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export const ROTULO_SITUACAO: Record<SituacaoChegada, string> = {
  recebida: 'Recebida',
  aguardando: 'Aguardando',
  atrasada: 'Não chegou',
  nao_prevista: 'Não prevista',
};

/** Planos aprovados que um novo aprovado vai substituir (horizontes que se cruzam). */
export const sobrepostos = <T extends { inicio: string; fim: string }>(novo: T, aprovados: T[]) =>
  aprovados.filter((p) => p !== novo && p.inicio <= novo.fim && p.fim >= novo.inicio);
