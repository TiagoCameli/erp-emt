import type { Escolhas } from "./siac/para-banco";
import type { CabecalhoSiac, IndiceSiac } from "./siac/ler-relatorio";
import type { Casamento, ItemCandidato } from "./de-para";

export type { Escolhas, IndiceSiac };

/**
 * Tipos do reajuste (Fase 6). D7: todo dinheiro, fator e índice chega do banco como TEXTO e só é
 * exibido ou comparado. Situação "provisorio" | "definitivo"; origem "siac" | "manual".
 */

/** O relatório que vale na medição (`mc_v_reajuste_medicao`). */
export interface ReajusteVigente {
  relatorioId: string;
  sequencia: number;
  origem: string;
  situacao: string;
  total: string;
  /** Total do anterior não excluído; null quando é o primeiro. */
  anteriorTotal: string | null;
  /** total - anterior (+ a receber, - a devolver), feito no banco; null quando é o primeiro. */
  diferenca: string | null;
}

/** Um relatório do histórico (todos, inclusive os excluídos). */
export interface RelatorioResumo {
  id: string;
  sequencia: number;
  origem: string;
  situacao: string;
  total: string;
  /** Valor a PI do DNIT (só SIAC). */
  valorPi: string | null;
  medicaoTipo: string | null;
  contratoTexto: string | null;
  periodoInicio: string | null;
  periodoFim: string | null;
  dataBase: string | null;
  processadoEm: string | null;
  criadoEm: string;
  criadoPorNome: string | null;
  arquivoId: string | null;
  arquivoNome: string | null;
  observacao: string | null;
  excluidoEm: string | null;
  excluidoPorNome: string | null;
  motivoExclusao: string | null;
}

export interface RateioItem {
  itemId: string;
  /** Código do item na planilha da medição (null se não achado). */
  codigo: string | null;
  valor: string;
  /** Peso do rateio: valor do item na medição no import. */
  valorBase: string;
}

export interface LinhaReajuste {
  id: string;
  ordem: number;
  grupo: string;
  grupoDescricao: string | null;
  codigo: string;
  descricao: string;
  unidade: string;
  precoUnitario: string;
  valorPi: string;
  fator: string;
  reajuste: string;
  rateio: RateioItem[];
}

export interface ReajusteMedicao {
  vigente: ReajusteVigente | null;
  relatorios: RelatorioResumo[];
  /** Linhas do relatório que vale (vazio no manual ou sem relatório). */
  linhas: LinhaReajuste[];
  /** Índices (I0, I1, K) do relatório que vale. */
  indices: IndiceSiac[];
}

/** PDF anexado à medição (`mc_reajuste`) que ainda não virou relatório. */
export interface PdfPendente {
  arquivoId: string;
  nome: string;
  criadoEm: string;
}

export interface ConfigReajuste {
  temReajuste: boolean;
  /** "aaaa-mm-dd" (dia 1) ou null. */
  dataBase: string | null;
  periodicidadeMeses: number;
  indiceDescricao: string | null;
}

export type SituacaoFiltroReajuste = "sem_relatorio" | "provisorio" | "definitivo";

/** Linha da aba Reajuste: medição enviada ou aprovada com o reajuste que vale (ou nenhum). */
export interface LinhaListaReajuste {
  medicaoId: string;
  contratoId: string;
  contratoCodigo: string;
  contratoNome: string;
  numero: number;
  periodoInicio: string;
  periodoFim: string;
  status: string;
  relatorioId: string | null;
  sequencia: number | null;
  origem: string | null;
  situacao: string | null;
  total: string | null;
  diferenca: string | null;
  relatorios: number;
}

/** Uma linha da prévia devolvida por `fn_mc_reajuste_importar` (números como texto). */
export interface LinhaPrevia {
  ordem: number;
  grupo: string;
  codigo: string;
  descricao: string;
  unidade: string;
  preco_unitario: string;
  valor_pi: string;
  fator: string;
  reajuste: string;
  itens: string[];
  destino: string | null;
  valor_nosso: string;
  rateio: { item_id: string; valor_base: string; valor: string }[] | null;
  pendencia: string | null;
}

/** Resposta de `fn_mc_reajuste_importar` (prévia ou gravação). */
export interface PreviaReajuste {
  linhas: LinhaPrevia[];
  pendencias: number;
  total: string;
  valor_pi: string;
  situacao: string;
  medicao_valor: string | null;
  anterior: { id: string; sequencia: number; origem: string; situacao: string; total: string } | null;
  diferenca: string | null;
  relatorio_id?: string;
  sequencia?: number;
}

/** O que `lerPdfSiac` devolve para a tela montar a prévia. */
export interface LeituraSiac {
  ok: true;
  cabecalho: CabecalhoSiac;
  avisos: string[];
  escolhas: Escolhas;
  origem: Record<string, Casamento["origem"]>;
  conferir: string[];
  candidatos: ItemCandidato[];
  previa: PreviaReajuste;
}
