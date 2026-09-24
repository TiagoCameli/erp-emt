import type { TipoFrete } from "@/modules/frete/fretes/schemas";

/**
 * Tipos da aba Fretes que a tela e o servidor dividem. Módulo puro (sem banco), para o
 * componente de cliente importar sem puxar `server-only`.
 */

export interface Opcao {
  id: string;
  nome: string;
}

/** Uma linha da lista de fretes, já com os nomes dos cadastros. */
export interface FreteLinha {
  id: string;
  tipo: TipoFrete;
  /** Dia da saída, yyyy-mm-dd. */
  data: string;
  /** Dia da chegada, yyyy-mm-dd, ou nulo ("sem chegada"). */
  dataChegada: string | null;
  centroCustoId: string | null;
  obraNome: string | null;
  origemId: string;
  origemNome: string;
  destinoId: string;
  destinoNome: string;
  transportadoraId: string;
  transportadoraNome: string;
  motorista: string;
  placaCarreta: string | null;
  insumoId: string;
  insumoNome: string;
  pesoToneladas: number;
  kmRodados: number;
  valorTkm: number;
  valorTotal: number;
  valorMaterial: number;
  /** valor do material ÷ peso (zero sem peso). */
  precoUnitario: number;
  notaFiscal: string | null;
  notaFiscal2: string | null;
  observacoes: string | null;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
  updatedBy: string | null;
  excluidoEm: string | null;
  motivoExclusao: string | null;
}

/** Opções do formulário de frete. */
export interface OpcoesFrete {
  /** Localidades ativas (origem e destino). */
  localidades: Opcao[];
  /** Fornecedores marcados como transportadora ou dono de tanque, ativos. */
  transportadoras: Opcao[];
  /** Insumos ativos. */
  insumos: Opcao[];
  /** Raízes de obra do centro de custo. */
  obras: Opcao[];
}
