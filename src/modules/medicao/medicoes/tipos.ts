/**
 * Formato da tela de Medições (Fase 4, Task 4): lista do contrato e sugestão da próxima.
 */

/**
 * Uma linha da lista de medições do contrato, montada em `queries.ts` a partir de `mc_medicoes`
 * (tabela), `mc_v_medicao_totais.valor` (D7: só EXIBIDO, nunca somado nem arredondado aqui — por
 * isso chega como TEXTO) e a contagem de `mc_lancamentos` não excluídos.
 */
export interface MedicaoLista {
  id: string;
  numero: number;
  periodoInicio: string;
  periodoFim: string;
  status: string;
  /** Texto do numeric; nulo é contrato ainda sem regra de arredondamento (spec 6.2). */
  valor: string | null;
  /** Lançamentos não excluídos desta medição. */
  lancamentos: number;
}

/**
 * jsonb de `fn_mc_medicao_sugestao`, passado como veio do banco (mesmo padrão de `MedicaoBoletim`
 * em boletim/tipos.ts): os nomes dos campos são os da RPC.
 */
export interface SugestaoMedicao {
  numero: number;
  /** Nulos quando o contrato informa o período à mão (`periodo_manual`): o banco não sugere datas. */
  periodo_inicio: string | null;
  periodo_fim: string | null;
  /** Contrato em que o período é digitado a cada medição. */
  periodo_manual: boolean;
  /** Nulo quando o contrato ainda não tem planilha vigente (a abertura vai recusar). */
  versao_numero: number | null;
  /** Fim da medição anterior; nulo na primeira medição do contrato. */
  depois_de: string | null;
}
