/**
 * Formato do jsonb de `public.fn_mc_painel` (migration 20260927181327_mc_fase3a_boletim_painel).
 *
 * Todo numeric chega como TEXTO (ou nulo): dinheiro e porcentagem. A tela só formata esse texto;
 * nenhuma conta de dinheiro sai daqui (D7). Dinheiro e % nulos, na linha do contrato, são contrato
 * sem regra de arredondamento; nesse caso o contrato também não entra na soma do `total`.
 */

export interface MedicaoCorrentePainel {
  numero: number;
  status: string;
  periodo_inicio: string;
  periodo_fim: string;
  valor: string | null;
}

export interface ContratoPainel {
  id: string;
  codigo: string;
  nome_obra: string;
  contratante_nome: string | null;
  contratante_tipo: string;
  status: string;
  /** Número da versão vigente da planilha; nulo quando o contrato não tem versão vigente. */
  versao_numero: number | null;
  previsto: string | null;
  acumulado: string | null;
  saldo: string | null;
  pct_executado: string | null;
  /** Quantidade de medições do contrato (todas, não só até uma Nª). */
  medicoes: number;
  /** A medição de maior número; nulo quando o contrato ainda não tem medição. */
  corrente: MedicaoCorrentePainel | null;
}

export interface TotalPainel {
  previsto: string;
  acumulado: string;
  saldo: string;
  /** Nulo quando nenhum contrato do filtro tem regra de arredondamento (ou previsto zero). */
  pct_executado: string | null;
  /** Soma da medição corrente de cada contrato (não é um objeto: é só o dinheiro). */
  corrente: string;
}

export interface Painel {
  contratos: ContratoPainel[];
  total: TotalPainel;
}
