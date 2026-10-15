import { z } from "zod";

/**
 * Cadastro da pilha: nome, local (a localidade do Frete), insumo e observações. O frete que
 * chega num local entra na pilha ativa daquele insumo ali. A unidade é a do cadastro do insumo
 * (BRITA 1 em t e PEDRA BRITADA N. 1 em m³ são insumos diferentes). Saldo e status são do
 * banco (`fn_estoque_atualizar_pilha`): a pilha zerada fica inativa sozinha, não há
 * "Desativar" na tela.
 */
export const pilhaSchema = z.object({
  insumoId: z
    .string()
    .trim()
    .refine((valor) => z.guid().safeParse(valor).success, { error: "Escolha o insumo da pilha" }),
  localidadeId: z
    .string()
    .trim()
    .refine((valor) => z.guid().safeParse(valor).success, { error: "Escolha o local da pilha" }),
  nome: z.string().trim().min(1, { error: "Informe o nome da pilha" }).max(120, { error: "Máximo de 120 caracteres" }),
  observacoes: z.string().trim().max(500, { error: "Máximo de 500 caracteres" }),
});

export type PilhaInput = z.infer<typeof pilhaSchema>;
