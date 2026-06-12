import { z } from "zod";

/** Schema do formulário de login (email + senha). */
export const loginSchema = z.object({
  email: z.email({ error: "Informe um email válido" }),
  senha: z
    .string()
    .min(8, { error: "A senha precisa ter pelo menos 8 caracteres" }),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** Schema da definição de senha no primeiro acesso (convite) ou recuperação. */
export const definirSenhaSchema = z
  .object({
    senha: z
      .string()
      .min(8, { error: "A senha precisa ter pelo menos 8 caracteres" }),
    confirmacao: z
      .string()
      .min(8, { error: "A confirmação precisa ter pelo menos 8 caracteres" }),
  })
  .refine((dados) => dados.senha === dados.confirmacao, {
    error: "As senhas não coincidem",
    path: ["confirmacao"],
  });

export type DefinirSenhaInput = z.infer<typeof definirSenhaSchema>;
