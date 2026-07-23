import { z } from "zod";

/** Tolerância de arredondamento na soma dos percentuais (fecha em 100%). */
const TOLERANCIA_SOMA_PERCENTUAL = 0.01;

/** Uma parcela: quantos dias após a data base e qual fração do valor total. */
export const parcelaCondicaoSchema = z.object({
  diasOffset: z
    .number({ error: "Informe os dias" })
    .int({ error: "Dias deve ser um número inteiro" })
    .min(0, { error: "Dias não pode ser negativo" }),
  percentual: z
    .number({ error: "Informe o percentual" })
    .positive({ error: "O percentual precisa ser maior que zero" })
    .max(100, { error: "O percentual não pode passar de 100" }),
});

export type ParcelaCondicaoInput = z.infer<typeof parcelaCondicaoSchema>;

/**
 * Schema da condição de pagamento: descrição + parcelas (dias, %).
 * A soma dos percentuais precisa fechar em 100 e não pode haver duas
 * parcelas com o mesmo número de dias.
 */
export const condicaoPagamentoSchema = z
  .object({
    descricao: z
      .string()
      .trim()
      .min(2, { error: "A descrição precisa ter pelo menos 2 caracteres" })
      .max(120, { error: "A descrição pode ter no máximo 120 caracteres" }),
    ativo: z.boolean().default(true),
    parcelas: z
      .array(parcelaCondicaoSchema)
      .min(1, { error: "Informe pelo menos uma parcela" }),
  })
  .refine(
    (dados) => {
      const soma = dados.parcelas.reduce((acc, p) => acc + p.percentual, 0);
      return Math.abs(soma - 100) <= TOLERANCIA_SOMA_PERCENTUAL;
    },
    {
      error: "A soma dos percentuais das parcelas precisa ser 100%",
      path: ["parcelas"],
    },
  )
  .refine(
    (dados) => {
      const dias = dados.parcelas.map((p) => p.diasOffset);
      return new Set(dias).size === dias.length;
    },
    {
      error: "Não pode haver duas parcelas com o mesmo número de dias",
      path: ["parcelas"],
    },
  );

/** Saída validada: use nas server actions. */
export type CondicaoPagamentoInput = z.infer<typeof condicaoPagamentoSchema>;

/** Entrada do formulário (ativo opcional por causa do default): use no react-hook-form. */
export type CondicaoPagamentoFormInput = z.input<
  typeof condicaoPagamentoSchema
>;
