import type { StatusPadrao } from "@/components/canonicos";

/**
 * Rótulos e badges das rescisões. Só dado, sem `use server`: importado tanto
 * por Server Component quanto por componente de cliente.
 */

/** Tipo de rescisão. Os quatro que o Tiago declarou em 29/08/2026. */
export type TipoRescisao =
  | "sem_justa_causa"
  | "pedido_demissao"
  | "termino_experiencia"
  | "justa_causa";

/** Situação do aviso prévio nesta rescisão. */
export type AvisoRescisao =
  | "indenizado"
  | "trabalhado"
  | "nao_cumprido"
  | "nao_se_aplica";

export type StatusRescisao =
  | "rascunho"
  | "pendente_aprovacao"
  | "aprovado"
  | "rejeitado";

export const TIPOS_RESCISAO = [
  "sem_justa_causa",
  "pedido_demissao",
  "termino_experiencia",
  "justa_causa",
] as const satisfies readonly TipoRescisao[];

export const AVISOS_RESCISAO = [
  "indenizado",
  "trabalhado",
  "nao_cumprido",
  "nao_se_aplica",
] as const satisfies readonly AvisoRescisao[];

export const ROTULO_TIPO_RESCISAO: Record<TipoRescisao, string> = {
  sem_justa_causa: "Demissão sem justa causa",
  pedido_demissao: "Pedido de demissão",
  termino_experiencia: "Término de contrato de experiência",
  justa_causa: "Justa causa",
};

export const ROTULO_AVISO: Record<AvisoRescisao, string> = {
  indenizado: "Indenizado",
  trabalhado: "Trabalhado",
  nao_cumprido: "Não cumprido",
  nao_se_aplica: "Não se aplica",
};

export const STATUS_RESCISAO: Record<
  StatusRescisao,
  { rotulo: string; badge: StatusPadrao }
> = {
  rascunho: { rotulo: "Rascunho", badge: "rascunho" },
  pendente_aprovacao: {
    rotulo: "Pendente de aprovação",
    badge: "pendente_aprovacao",
  },
  aprovado: { rotulo: "Aprovada", badge: "aprovado" },
  rejeitado: { rotulo: "Rejeitada", badge: "rejeitado" },
};

/**
 * Quais avisos cada tipo admite. É a MESMA regra que `fn_gerar_rescisao`
 * aplica, e está aqui para o formulário só oferecer o que o banco aceita —
 * sem isto o usuário escolheria uma combinação e levaria um erro depois de
 * preencher a tela inteira.
 *
 * Duplicação consciente e do tipo barato: a lista é declarativa, o banco
 * continua sendo quem recusa, e o teste `formato.test.ts` trava as duas
 * pontas contra a matriz declarada pelo Tiago.
 */
export const AVISOS_POR_TIPO: Record<TipoRescisao, readonly AvisoRescisao[]> = {
  sem_justa_causa: ["indenizado", "trabalhado"],
  pedido_demissao: ["trabalhado", "nao_cumprido"],
  termino_experiencia: ["nao_se_aplica"],
  justa_causa: ["nao_se_aplica"],
};

/**
 * As verbas que cada tipo gera, na ordem em que o documento as mostra. Serve
 * à tela para explicar o que vai aparecer ANTES de gerar; quem constrói de
 * verdade é `fn_gerar_rescisao`.
 */
export const VERBAS_POR_TIPO: Record<TipoRescisao, readonly string[]> = {
  sem_justa_causa: [
    "Aviso prévio indenizado (se indenizado)",
    "13º proporcional",
    "Férias vencidas + 1/3",
    "Férias proporcionais + 1/3",
    "Multa do FGTS",
  ],
  pedido_demissao: [
    "13º proporcional",
    "Férias vencidas + 1/3",
    "Férias proporcionais + 1/3",
    "Aviso não cumprido, como desconto (se não cumprir)",
  ],
  termino_experiencia: [
    "13º proporcional",
    "Férias vencidas + 1/3",
    "Férias proporcionais + 1/3",
  ],
  justa_causa: ["Férias vencidas + 1/3"],
};
