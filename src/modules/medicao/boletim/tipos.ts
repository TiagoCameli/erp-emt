/**
 * Formato do jsonb de `public.fn_mc_boletim` (migration 20260927181327_mc_fase3a_boletim_painel).
 *
 * Todo numeric chega como TEXTO (ou nulo): dinheiro, porcentagem, preço e quantidade. A tela só
 * formata esse texto; nenhuma conta de dinheiro sai daqui (D7). Dinheiro e % nulos = contrato sem
 * regra de arredondamento.
 *
 * Fase 6 (migration 20261002155515_mc_fase6a_reajuste): o reajuste do DNIT entra como dinheiro do
 * banco, também texto. `reajuste_medicao` é o da Nª e `reajuste_acumulado` o de 1ª..Nª, somas do
 * rateio do relatório que vale em cada medição; no total, a soma do total desses relatórios (o
 * lançamento manual, sem rateio, só aparece aí). Nulo = contrato sem regra de arredondamento.
 */

export interface ContratoBoletim {
  id: string;
  codigo: string;
  nome_obra: string;
  numero_contrato: string | null;
  contratante_nome: string | null;
  regra_arredondamento: string | null;
}

export interface VersaoBoletim {
  id: string;
  numero: number;
  vigente_desde: string;
}

export interface MedicaoBoletim {
  id: string;
  numero: number;
  periodo_inicio: string;
  periodo_fim: string;
  status: string;
  valor: string | null;
  /** Total do relatório de reajuste que vale na medição; nulo sem relatório (ou sem regra). */
  reajuste: string | null;
  /** "provisorio" | "definitivo" do relatório que vale; nulo sem relatório. */
  reajuste_situacao: string | null;
}

/** Quantidade efetiva por número da medição ("1", "2"...), só das medições 1..N. */
export type QtdsPorMedicao = Record<string, string | null>;

export interface LinhaBoletim {
  id: string;
  ordem: number;
  codigo: string;
  pai_id: string | null;
  nivel: number;
  descricao: string;
  unidade: string | null;
  tipo: "titulo" | "servico";
  item_id: string;
  preco_unitario: string | null;
  quantidade_prevista: string | null;
  qtds: QtdsPorMedicao;
  previsto: string | null;
  valor_medicao: string | null;
  acumulado: string | null;
  saldo: string | null;
  pct_executado: string | null;
  pct_a_medir: string | null;
  reajuste_medicao: string | null;
  reajuste_acumulado: string | null;
}

export interface ItemForaDaVersao {
  item_id: string;
  codigo: string;
  descricao: string;
  unidade: string | null;
  qtds: QtdsPorMedicao;
  valor_medicao: string | null;
  acumulado: string | null;
  reajuste_medicao: string | null;
  reajuste_acumulado: string | null;
}

export interface TotalBoletim {
  previsto: string | null;
  valor_medicao: string | null;
  acumulado: string | null;
  saldo: string | null;
  pct_executado: string | null;
  pct_a_medir: string | null;
  reajuste_medicao: string | null;
  reajuste_acumulado: string | null;
}

export interface Boletim {
  contrato: ContratoBoletim;
  versao: VersaoBoletim | null;
  /** Número N usado ("até a Nª"); nulo quando o contrato ainda não tem medição. */
  ate: number | null;
  /** Todas as medições do contrato, por número (não só as 1..N). */
  medicoes: MedicaoBoletim[];
  linhas: LinhaBoletim[];
  fora_da_versao: ItemForaDaVersao[];
  total: TotalBoletim;
}
