import { z } from "zod";

/** Tipos de fornecedor: pessoa física ou jurídica. */
export const TIPOS_FORNECEDOR = ["pf", "pj"] as const;
export type TipoFornecedor = (typeof TIPOS_FORNECEDOR)[number];

/** Rótulos dos tipos para a UI. */
export const ROTULO_TIPO: Record<TipoFornecedor, string> = {
  pf: "Pessoa física",
  pj: "Pessoa jurídica",
};

/**
 * Schema do formulário de fornecedor (mensagens pt-BR). Campos opcionais
 * aceitam string vazia; o action normaliza vazio para null antes de gravar.
 * Sem transform/default para manter input igual a output (react-hook-form).
 */
export const fornecedorSchema = z.object({
  tipo: z.enum(TIPOS_FORNECEDOR, { error: "Escolha o tipo do fornecedor" }),
  razaoSocial: z
    .string()
    .trim()
    .min(2, { error: "A razão social precisa ter pelo menos 2 caracteres" })
    .max(255, { error: "Use no máximo 255 caracteres" }),
  nomeFantasia: z
    .string()
    .trim()
    .max(255, { error: "Use no máximo 255 caracteres" }),
  cnpjCpf: z
    .string()
    .trim()
    .max(255, { error: "Use no máximo 255 caracteres" }),
  inscricaoEstadual: z
    .string()
    .trim()
    .max(255, { error: "Use no máximo 255 caracteres" }),
  email: z
    .union([z.literal(""), z.email({ error: "Informe um email válido" })]),
  telefone: z
    .string()
    .trim()
    .max(255, { error: "Use no máximo 255 caracteres" }),
  cidade: z
    .string()
    .trim()
    .max(255, { error: "Use no máximo 255 caracteres" }),
  uf: z
    .union([
      z.literal(""),
      z
        .string()
        .trim()
        .length(2, { error: "A UF precisa ter 2 letras" }),
    ]),
  endereco: z
    .string()
    .trim()
    .max(255, { error: "Use no máximo 255 caracteres" }),
  observacoes: z
    .string()
    .trim()
    .max(2000, { error: "Use no máximo 2000 caracteres" }),
  ativo: z.boolean(),
});

export type FornecedorInput = z.infer<typeof fornecedorSchema>;
