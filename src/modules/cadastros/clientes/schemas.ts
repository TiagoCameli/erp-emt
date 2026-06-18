import { z } from "zod";

/** Tipo de pessoa do cliente: física ou jurídica. */
export const TIPOS_CLIENTE = ["pf", "pj"] as const;
export type TipoCliente = (typeof TIPOS_CLIENTE)[number];

/**
 * Texto opcional do formulário: aceita string vazia ou null no input.
 * A normalização para null (quando vazio) acontece na server action,
 * antes de gravar. Manter input e output iguais é o que o zodResolver
 * do react-hook-form exige.
 */
function textoOpcional(max: number, mensagemMax: string) {
  return z
    .string()
    .trim()
    .max(max, mensagemMax)
    .nullable()
    .or(z.literal(""));
}

/** Schema do formulário de cliente, compartilhado entre client e server. */
export const clienteSchema = z.object({
  tipo: z.enum(TIPOS_CLIENTE, {
    message: "Selecione o tipo de cliente",
  }),
  nome: z
    .string()
    .trim()
    .min(1, "Informe o nome ou a razão social")
    .max(255, "Use no máximo 255 caracteres"),
  nome_fantasia: textoOpcional(255, "Use no máximo 255 caracteres"),
  cpf_cnpj: textoOpcional(20, "Use no máximo 20 caracteres"),
  inscricao_estadual: textoOpcional(30, "Use no máximo 30 caracteres"),
  email: z
    .string()
    .trim()
    .max(255, "Use no máximo 255 caracteres")
    .email("Informe um email válido")
    .nullable()
    .or(z.literal("")),
  telefone: textoOpcional(30, "Use no máximo 30 caracteres"),
  cidade: textoOpcional(255, "Use no máximo 255 caracteres"),
  uf: z
    .string()
    .trim()
    .toUpperCase()
    .length(2, "A UF tem 2 letras")
    .nullable()
    .or(z.literal("")),
  endereco: textoOpcional(255, "Use no máximo 255 caracteres"),
  observacoes: textoOpcional(2000, "Use no máximo 2000 caracteres"),
  ativo: z.boolean(),
});

export type ClienteInput = z.infer<typeof clienteSchema>;

/** Valores padrão do formulário ao criar um cliente novo. */
export const clientePadrao: ClienteInput = {
  tipo: "pj",
  nome: "",
  nome_fantasia: "",
  cpf_cnpj: "",
  inscricao_estadual: "",
  email: "",
  telefone: "",
  cidade: "",
  uf: "",
  endereco: "",
  observacoes: "",
  ativo: true,
};

/** Converte texto opcional vazio em null para gravar no banco. */
export function paraNuloSeVazio(valor: string | null | undefined): string | null {
  if (valor === null || valor === undefined) return null;
  const limpo = valor.trim();
  return limpo.length > 0 ? limpo : null;
}
