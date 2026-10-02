/** Alertas calculados do contrato (view mc_v_alertas, Fase 5). Tudo que é número chega como TEXTO. */

export type TipoAlerta =
  | "acumulado_acima_previsto"
  | "prazo_perto_do_fim"
  | "valor_perto_do_previsto"
  | "valor_contrato_diferente"
  /** Fase 6: medição aprovada depois do aniversário da data-base sem relatório de reajuste. */
  | "medicao_sem_reajuste"
  /** Fase 6: o relatório de reajuste que vale na medição está com índices provisórios. */
  | "reajuste_provisorio";

export type GravidadeAlerta = "alta" | "media" | "baixa";

export interface AlertaLinha {
  /** Identificador estável da linha na tela (a view não tem chave própria). */
  chave: string;
  contratoId: string;
  codigo: string;
  tipo: string;
  gravidade: string;
  itemCodigo: string | null;
  unidade: string | null;
  valor: string | null;
  referencia: string | null;
  /** yyyy-mm-dd */
  data: string | null;
  comMotivo: boolean;
}
