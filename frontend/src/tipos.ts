// Formato das respostas da API (backend/app/schemas.py).
// Decimais do banco (kg, horas do cadastro) chegam como texto, ex.: "100.000".
// Valores calculados pelo motor (alocações, KPIs) chegam como número.

export type Estagio = 'fresco' | 'desidratado' | 'moido';
export type Origem = 'fazenda_propria' | 'procompete' | 'pd';
export type StatusPlano = 'rascunho' | 'aprovado' | 'substituido';
export type TipoPendencia = 'param_ausente' | 'capacidade_excedida' | 'atraso' | 'saldo_nao_alocado';

export interface UsuarioResumo {
  id: number;
  nome: string;
}

export interface SessaoAtual {
  usuario: Usuario;
  permissoes: string[];
}

// --- Controle de acesso ---

export interface Funcionalidade {
  id: number;
  codigo: string;
  nome: string;
  descricao: string | null;
  modulo: string | null;
  ativo: boolean;
}

export interface Grupo {
  id: number;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
  funcionalidades: Funcionalidade[];
}

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  ativo: boolean;
  ultimo_login: string | null;
  criado_em: string;
  atualizado_em: string;
  grupos: { id: number; nome: string }[];
}

export interface Erva {
  id: number;
  codigo: string;
  nome: string;
  ativo: boolean;
  regime_horas_dia: string | null;
  espera_maxima_dias: number | null;
}

export interface Secador {
  id: number;
  codigo: string;
  nome: string;
  ativo: boolean;
}

export interface Capacidade {
  id: number;
  erva_id: number;
  secador_id: number;
  modo: 'continuo' | 'por_carga' | null;
  kg_fresco_por_hora: string | null;
  kg_por_carga: string | null;
  horas_por_carga: string | null;
  setup_inicial_h: string | null;
  setup_final_h: string | null;
  setup_diario_h: string | null;
  setup_dentro_do_regime: boolean | null;
  prioridade: number | null;
}

export interface Rendimento {
  id: number;
  erva_id: number;
  /** Kg de fresco para 1 kg desidratado. */
  fresco_por_desidratado: string | null;
  /** Kg desidratado para 1 kg moído. */
  desidratado_por_moido: string | null;
}

type Resumo = Pick<Erva, 'id' | 'codigo' | 'nome'>;

export interface Demanda {
  id: number;
  erva: Resumo;
  kg: string;
  estagio: Estagio;
  prazo: string;
  reserva_kg: string;
  prioridade: number;
  observacao: string | null;
  criado_por: UsuarioResumo;
}

export interface Previsao {
  id: number;
  erva: Resumo;
  origem: Origem;
  data_chegada: string;
  kg_fresco: string;
  observacao: string | null;
  /** Já tem recebimento: não pode mais ser alterada nem removida. */
  recebida: boolean;
  criado_por: UsuarioResumo;
}

export interface Bloqueio {
  id: number;
  secador: Resumo;
  inicio: string;
  fim: string;
  motivo: string;
  criado_por: UsuarioResumo;
}

export interface Necessidade {
  demanda_id: string;
  erva: string;
  kg_meta: number;
  estagio_meta: Estagio;
  kg_fresco: number;
  prazo: string;
}

export interface Alocacao {
  secador: string;
  erva: string;
  dia: string;
  kg_fresco: number;
  horas_secagem: number;
  horas_setup: number;
  lote_id: string;
  demanda_id: string | null;
}

export interface Pendencia {
  tipo: TipoPendencia;
  mensagem: string;
  erva: string | null;
  secador: string | null;
  lote_id: string | null;
  demanda_id: string | null;
  kg: number | null;
}

// Valores null = "não aplicável" (denominador zero), nunca 0
export interface Kpis {
  horas_ocupadas?: Record<string, number>;
  horas_disponiveis?: Record<string, number>;
  ocupacao_planejada_pct?: Record<string, number | null>;
  saldo_nao_alocado_kg?: Record<string, number>;
}

export interface ResultadoSimulacao {
  inicio: string;
  fim: string;
  viavel: boolean;
  necessidades: Necessidade[];
  alocacoes: Alocacao[];
  pendencias: Pendencia[];
  kpis: Kpis;
  avisos: string[];
}

export interface PlanoResumo {
  id: number;
  versao: number;
  status: StatusPlano;
  inicio: string;
  fim: string;
  viavel: boolean;
  observacao: string | null;
  criado_por: UsuarioResumo;
  criado_em: string;
  aprovado_por: UsuarioResumo | null;
  aprovado_em: string | null;
}

export interface PlanoDetalhe extends PlanoResumo, ResultadoSimulacao {
  parametros: { dias_operacao: number[] | null; [chave: string]: unknown };
}

export type SituacaoChegada = 'recebida' | 'aguardando' | 'atrasada' | 'nao_prevista';

export interface Recebimento {
  id: number;
  previsao_id: number | null;
  erva: Resumo;
  origem: Origem;
  data_recebimento: string;
  kg_fresco: string;
  observacao: string | null;
  registrado_por: UsuarioResumo;
}

export interface Chegada {
  previsao_id: number | null;
  erva: Resumo;
  origem: Origem;
  data_prevista: string | null;
  kg_previsto: string | null;
  recebimentos: Recebimento[];
  kg_recebido: string;
  desvio_kg: string | null;
  situacao: SituacaoChegada;
}

export interface Cronograma {
  de: string;
  ate: string;
  hoje: string;
  planos: PlanoResumo[];
  alocacoes: (Alocacao & { plano_id: number; versao: number })[];
  chegadas: Chegada[];
}
