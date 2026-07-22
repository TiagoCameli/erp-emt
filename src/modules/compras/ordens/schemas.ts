import { z } from "zod";

/**
 * Status de ordem de compra, igual ao check do banco. O app só transita
 * rascunho > pendente_aprovacao > aprovado/rejeitado e cancelado.
 */
export const STATUS_OC = [
  "rascunho",
  "pendente_aprovacao",
  "aprovado",
  "rejeitado",
  "cancelado",
] as const;

export type StatusOcSchema = (typeof STATUS_OC)[number];

/** Quantidade NUMERIC(14,3): positiva, no máximo 3 casas. */
const quantidadeSchema = z
  .number({ error: "Quantidade inválida" })
  .positive({ error: "A quantidade precisa ser maior que zero" })
  .max(99999999999.999, { error: "Quantidade acima do permitido" });

/** Preço unitário NUMERIC(14,2): não negativo, no máximo 2 casas. */
const precoSchema = z
  .number({ error: "Preço inválido" })
  .min(0, { error: "O preço não pode ser negativo" })
  .max(999999999999.99, { error: "Preço acima do permitido" });

/** Texto opcional: vazio vira undefined para não gravar string em branco. */
function textoOpcional(maximo: number) {
  return z
    .string()
    .trim()
    .max(maximo, { error: `Máximo de ${maximo} caracteres` })
    .optional()
    .transform((valor) => (valor === "" ? undefined : valor));
}

/** Item da OC validado no servidor: tipos já coeridos. */
export const ocItemSchema = z.object({
  insumoId: z.uuid({ error: "Insumo inválido" }),
  quantidade: quantidadeSchema,
  precoUnitario: precoSchema,
  centroCustoId: z.uuid({ error: "Centro de custo inválido" }),
});

export type OcItemInput = z.infer<typeof ocItemSchema>;

/** Schema da OC validado no servidor (criar e editar). */
export const ordemCompraSchema = z.object({
  fornecedorId: z.uuid({ error: "Fornecedor inválido" }),
  condicaoPagamento: textoOpcional(120),
  cotacaoId: z.uuid({ error: "Cotação inválida" }).optional(),
  dataEmissao: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Data de emissão inválida" }),
  observacoes: textoOpcional(2000),
  itens: z
    .array(ocItemSchema)
    .min(1, { error: "Adicione ao menos um item à ordem de compra" }),
});

export type OrdemCompraInput = z.infer<typeof ordemCompraSchema>;

/**
 * Insumo-linha no formulário (client), dentro de um grupo de centro de custo.
 * Quantidade e preço continuam como string para casar input/output do
 * react-hook-form; a coerção real acontece no submit antes de chamar a action.
 */
export const ocInsumoFormSchema = z.object({
  insumoId: z.uuid({ error: "Selecione o insumo" }),
  quantidade: z
    .string()
    .trim()
    .refine(
      (valor) => {
        const numero = Number(valor.replace(",", "."));
        return valor !== "" && !Number.isNaN(numero) && numero > 0;
      },
      { error: "Informe uma quantidade maior que zero" },
    ),
  precoUnitario: z
    .string()
    .trim()
    .refine(
      (valor) => {
        const numero = Number(valor.replace(",", "."));
        return valor !== "" && !Number.isNaN(numero) && numero >= 0;
      },
      { error: "Informe um preço válido" },
    ),
});

export type OcInsumoFormInput = z.infer<typeof ocInsumoFormSchema>;

/**
 * Grupo de centro de custo com seus insumos (client). A hierarquia da tela é
 * centro de custo > insumos. Um insumo não repete dentro do mesmo grupo.
 */
export const ocGrupoCentroCustoFormSchema = z
  .object({
    centroCustoId: z.uuid({ error: "Selecione o centro de custo" }),
    insumos: z
      .array(ocInsumoFormSchema)
      .min(1, { error: "Adicione ao menos um insumo neste centro de custo" }),
  })
  .superRefine((grupo, ctx) => {
    const vistos = new Set<string>();
    grupo.insumos.forEach((insumo, i) => {
      if (!insumo.insumoId) return;
      if (vistos.has(insumo.insumoId)) {
        ctx.addIssue({
          code: "custom",
          message: "Insumo repetido neste centro de custo",
          path: ["insumos", i, "insumoId"],
        });
      }
      vistos.add(insumo.insumoId);
    });
  });

export type OcGrupoCentroCustoFormInput = z.infer<
  typeof ocGrupoCentroCustoFormSchema
>;

/**
 * Schema do formulário da OC (client). Os itens são agrupados por centro de
 * custo; cada centro aparece uma única vez. No submit os grupos são achatados
 * na lista plana de itens que a action espera (ver ordemCompraSchema).
 */
export const ordemCompraFormSchema = z.object({
  fornecedorId: z.uuid({ error: "Selecione o fornecedor" }),
  condicaoPagamento: z
    .string()
    .trim()
    .max(120, { error: "Máximo de 120 caracteres" }),
  cotacaoId: z.uuid().optional(),
  dataEmissao: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Informe a data de emissão" }),
  observacoes: z
    .string()
    .trim()
    .max(2000, { error: "Máximo de 2000 caracteres" }),
  centrosCusto: z
    .array(ocGrupoCentroCustoFormSchema)
    .min(1, { error: "Adicione ao menos um centro de custo" })
    .superRefine((grupos, ctx) => {
      const vistos = new Set<string>();
      grupos.forEach((grupo, i) => {
        if (!grupo.centroCustoId) return;
        if (vistos.has(grupo.centroCustoId)) {
          ctx.addIssue({
            code: "custom",
            message: "Centro de custo repetido",
            path: [i, "centroCustoId"],
          });
        }
        vistos.add(grupo.centroCustoId);
      });
    }),
});

export type OrdemCompraFormInput = z.infer<typeof ordemCompraFormSchema>;
