import { z } from "zod";
import { ACOES } from "@/config/recursos";

/** Schema do convite de novo usuário. */
export const convidarUsuarioSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, { error: "O nome precisa ter pelo menos 2 caracteres" }),
  email: z.email({ error: "Informe um email válido" }),
  perfilId: z.uuid({ error: "Perfil inválido" }).optional(),
});

export type ConvidarUsuarioInput = z.infer<typeof convidarUsuarioSchema>;

/** Schema da edição de nome e status do usuário. */
export const editarUsuarioSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, { error: "O nome precisa ter pelo menos 2 caracteres" }),
  ativo: z.boolean(),
});

export type EditarUsuarioInput = z.infer<typeof editarUsuarioSchema>;

/** Schema da matriz individual: pares recurso + ação. */
export const matrizSchema = z.array(
  z.object({
    recurso: z.string().min(1, { error: "Recurso inválido" }),
    acao: z.enum(ACOES, { error: "Ação inválida" }),
  }),
);

export type MatrizInput = z.infer<typeof matrizSchema>;
