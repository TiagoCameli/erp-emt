import { z } from "zod";

import { idSchemaCom } from "@/lib/id";

/** Tipos válidos de categoria financeira (plano de contas gerencial). */
export const TIPOS_CATEGORIA_FINANCEIRA = ["receita", "despesa"] as const;

export type TipoCategoriaFinanceira =
  (typeof TIPOS_CATEGORIA_FINANCEIRA)[number];

/** Rótulos em pt-BR de cada tipo, para exibição e filtro. */
export const ROTULO_TIPO_CATEGORIA_FINANCEIRA: Record<
  TipoCategoriaFinanceira,
  string
> = {
  receita: "Receita",
  despesa: "Despesa",
};

/**
 * Onde a categoria entra no DRE. Não é o mesmo eixo que `tipo`: `tipo` diz o
 * SINAL (receita soma, despesa subtrai) e a natureza diz se aquele dinheiro é
 * RESULTADO ou só patrimônio trocando de lugar.
 *
 * - `operacional`: a obra. Receita de medição, custo, despesa. É o resultado.
 * - `financeira`: juros ganhos, tarifa, IOF. É resultado, mas não é da obra.
 * - `movimentacao`: principal de aplicação, resgate, empréstimo recebido.
 *   **Não é resultado.** Aplicar R$ 1 milhão à noite e resgatar na manhã
 *   seguinte não é despesa de R$ 1 milhão seguida de receita de R$ 1 milhão —
 *   é o mesmo dinheiro indo e voltando. Enquanto isso contava como resultado, a
 *   varredura automática da conta respondia por 31,7% da "receita" de 2026.
 */
export const NATUREZAS_CATEGORIA_FINANCEIRA = [
  "operacional",
  "financeira",
  "movimentacao",
] as const;

export type NaturezaCategoriaFinanceira =
  (typeof NATUREZAS_CATEGORIA_FINANCEIRA)[number];

/** Rótulos em pt-BR de cada natureza, para o formulário e a listagem. */
export const ROTULO_NATUREZA_CATEGORIA_FINANCEIRA: Record<
  NaturezaCategoriaFinanceira,
  string
> = {
  operacional: "Operacional",
  financeira: "Financeira",
  movimentacao: "Movimentação",
};

/**
 * O que cada natureza faz no relatório, em uma linha. Vai no formulário, ao
 * lado do campo: quem cadastra categoria precisa saber que "movimentação" tira
 * a linha do resultado, e isso não se adivinha do rótulo.
 */
export const AJUDA_NATUREZA_CATEGORIA_FINANCEIRA: Record<
  NaturezaCategoriaFinanceira,
  string
> = {
  operacional: "Entra no resultado da obra: medição, custo, despesa.",
  financeira: "Entra no resultado, fora da obra: juros, tarifa, IOF.",
  movimentacao:
    "Fica fora do resultado: principal de aplicação, resgate, empréstimo.",
};

/** Schema do formulário de categoria financeira. */
export const categoriaFinanceiraSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, { error: "O nome precisa ter pelo menos 2 caracteres" })
    .max(120, { error: "O nome pode ter no máximo 120 caracteres" }),
  tipo: z.enum(TIPOS_CATEGORIA_FINANCEIRA, { error: "Escolha um tipo válido" }),
  natureza: z
    .enum(NATUREZAS_CATEGORIA_FINANCEIRA, {
      error: "Escolha uma natureza válida",
    })
    .default("operacional"),
  paiId: idSchemaCom("Categoria pai inválida").nullable().default(null),
  ativo: z.boolean().default(true),
});

export type CategoriaFinanceiraInput = z.infer<typeof categoriaFinanceiraSchema>;
