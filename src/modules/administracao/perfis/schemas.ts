import { z } from "zod";

import { ACOES } from "@/config/recursos";

/** Schema do formulário de perfil (criar e editar nome e descrição). */
export const perfilSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, { error: "O nome precisa ter pelo menos 2 caracteres" }),
  descricao: z
    .string()
    .trim()
    .max(500, { error: "A descrição pode ter no máximo 500 caracteres" })
    .optional(),
});

export type PerfilInput = z.infer<typeof perfilSchema>;

/** Uma permissão da matriz do perfil: recurso + ação. */
export const permissaoPerfilSchema = z.object({
  recurso: z.string().min(1, { error: "Recurso inválido" }),
  acao: z.enum(ACOES, { error: "Ação inválida" }),
});

export type PermissaoPerfilInput = z.infer<typeof permissaoPerfilSchema>;

/** Conjunto completo de permissões enviado ao salvar a matriz do perfil. */
export const permissoesPerfilSchema = z.array(permissaoPerfilSchema);

export type PermissoesPerfilInput = z.infer<typeof permissoesPerfilSchema>;
