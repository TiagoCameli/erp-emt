import { z } from "zod";

/**
 * Cadastro da pilha: só nome e observações. Material, saldo e status são do banco
 * (`fn_estoque_atualizar_pilha`): a pilha zerada fica inativa sozinha, não há
 * "Desativar" na tela.
 */
export const pilhaSchema = z.object({
  nome: z.string().trim().min(1, { error: "Informe o nome da pilha" }).max(120, { error: "Máximo de 120 caracteres" }),
  observacoes: z.string().trim().max(500, { error: "Máximo de 500 caracteres" }),
});

export type PilhaInput = z.infer<typeof pilhaSchema>;
