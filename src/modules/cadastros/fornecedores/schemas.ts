import { z } from "zod";

import { CASAS_TAXA } from "@/lib/casas-decimais";
import { validarCnpjCpf } from "@/lib/documentos";
import { normalizarNumeroDigitado } from "@/lib/numero-digitado";

/**
 * Taxa por litro digitada (pt-BR, "0,3000") em número. Vazio vira null.
 * Usa o mesmo normalizador do `InputPreco`, que é o que o campo mostra: o ponto
 * de milhar e a vírgula decimal são lidos do mesmo jeito dos dois lados.
 */
export function taxaLitroParaNumero(texto: string): number | null {
  const normalizado = normalizarNumeroDigitado(texto, CASAS_TAXA);
  return normalizado === null ? null : Number(normalizado.replace(",", "."));
}

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
    .max(255, { error: "Use no máximo 255 caracteres" })
    .refine((valor) => !/^\d+$/.test(valor.replace(/\s/g, "")), {
      error:
        "Razão social não pode ser só números — confira se o CNPJ caiu na coluna errada",
    }),
  nomeFantasia: z
    .string()
    .trim()
    .max(255, { error: "Use no máximo 255 caracteres" }),
  cnpjCpf: z
    .string()
    .trim()
    .max(255, { error: "Use no máximo 255 caracteres" })
    .refine((valor) => validarCnpjCpf(valor), {
      error: "CNPJ/CPF deve ter 11 ou 14 dígitos",
    }),
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
  // Frete e combustível (Fase 1 da migração do Gestão Obras, 22/09/2026).
  // Transportadora tem conta corrente no Frete; dono de tanque recebe o crédito
  // quando uma carreta abastece no tanque dele.
  ehTransportadora: z.boolean(),
  ehDonaDeTanque: z.boolean(),
  taxaLitroPadrao: z
    .string()
    .trim()
    .refine((valor) => valor === "" || taxaLitroParaNumero(valor) !== null, {
      error: `Informe a taxa em R$ por litro, com até ${CASAS_TAXA} casas decimais`,
    }),
  ativo: z.boolean(),
});

export type FornecedorInput = z.infer<typeof fornecedorSchema>;
