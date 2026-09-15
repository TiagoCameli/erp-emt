import { z } from "zod";

import { CASAS_DINHEIRO } from "@/lib/casas-decimais";
import { idSchemaCom } from "@/lib/id";
import { casasDecimais, paraNumero } from "@/modules/rh/percentual";

/** Data yyyy-MM-dd. */
const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Dinheiro digitado em pt-BR, não negativo, NUMERIC(14,2).
 *
 * Usa o `paraNumero` de `@/modules/rh/percentual`, que lê ponto como milhar e
 * vírgula como decimal, e devolve NaN quando o agrupamento do ponto é inválido
 * (é o que impede "0.5" de virar 5). NÃO usar o de `rh/parametros-folha`.
 */
const dinheiroSchema = z
  .union([z.string(), z.number()])
  .transform((valor, ctx) => {
    const numero = typeof valor === "number" ? valor : paraNumero(valor.trim());

    if (!Number.isFinite(numero)) {
      ctx.addIssue({ code: "custom", message: "Valor inválido" });
      return z.NEVER;
    }
    if (numero < 0) {
      ctx.addIssue({ code: "custom", message: "O valor não pode ser negativo" });
      return z.NEVER;
    }
    if (casasDecimais(numero) > CASAS_DINHEIRO) {
      ctx.addIssue({
        code: "custom",
        message: "O valor aceita no máximo 2 casas decimais",
      });
      return z.NEVER;
    }

    return numero;
  });

/** Dinheiro opcional: campo em branco vale zero. */
const dinheiroOpcionalSchema = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((valor) => {
    if (valor === null || valor === undefined) return "0";
    if (typeof valor === "number") return valor;
    return valor.trim() === "" ? "0" : valor;
  })
  .pipe(dinheiroSchema);

/**
 * Texto obrigatório de motivo. O `trim` do Zod corta espaço, tab e quebra de
 * linha, o mesmo conjunto do `btrim(x, E' \t\r\n')` das RPCs.
 */
const motivoTextoSchema = z
  .string()
  .trim()
  .min(1, { error: "Informe o motivo" })
  .max(500, { error: "Máximo de 500 caracteres" });

/**
 * Gerar o lote. Só ano, parcela e vencimento.
 *
 * Não há percentual nem chave de desconto: desde 14/09/2026 o app não calcula
 * 13º. O lote nasce com todo colaborador ativo dos três vínculos, zerado, e
 * quem monta digita cada valor.
 */
export const gerarLoteSchema = z.object({
  ano: z
    .number({ error: "Informe o ano" })
    .int({ error: "Ano inválido" })
    .min(2000, { error: "Ano inválido" })
    .max(2100, { error: "Ano inválido" }),
  parcela: z.union([z.literal(1), z.literal(2)], {
    error: "A parcela é 1 ou 2",
  }),
  dataVencimento: z
    .union([z.string(), z.null()])
    .transform((valor) => {
      if (valor === null) return null;
      const texto = valor.trim();
      return texto === "" ? null : texto;
    })
    .refine((valor) => valor === null || DATA_REGEX.test(valor), {
      error: "Data de vencimento inválida",
    })
    .optional()
    .default(null),
});

/**
 * Editar a linha: os três valores que a pessoa digita.
 *
 * O líquido NÃO entra aqui: ele é a subtração dos três, mantida por trigger no
 * banco. Mandar o líquido junto criaria dois donos do mesmo número.
 */
export const editarItemSchema = z
  .object({
    itemId: idSchemaCom("Item inválido"),
    bruto: dinheiroSchema,
    inss: dinheiroOpcionalSchema,
    irrf: dinheiroOpcionalSchema,
  })
  .refine((dados) => dados.inss + dados.irrf <= dados.bruto, {
    error: "Os descontos passam do bruto: o líquido ficaria negativo",
    path: ["inss"],
  });

export const tirarDoLoteSchema = z.object({
  itemId: idSchemaCom("Item inválido"),
});

export const adicionarAoLoteSchema = z.object({
  loteId: idSchemaCom("Lote inválido"),
  colaboradorId: idSchemaCom("Selecione o colaborador"),
});

/**
 * Vencimento do lote. `null` apaga a data escolhida e volta ao padrão do
 * banco (20/12 do ano do 13º), que é o único jeito de desfazer sem regerar.
 */
export const definirVencimentoSchema = z.object({
  loteId: idSchemaCom("Lote inválido"),
  dataVencimento: z
    .union([z.string(), z.null()])
    .transform((valor) => {
      if (valor === null) return null;
      const texto = valor.trim();
      return texto === "" ? null : texto;
    })
    .refine((valor) => valor === null || DATA_REGEX.test(valor), {
      error: "Data de vencimento inválida",
    }),
});

export const motivoSchema = z.object({
  loteId: idSchemaCom("Lote inválido"),
  motivo: motivoTextoSchema,
});

export const loteIdSchema = z.object({
  loteId: idSchemaCom("Lote inválido"),
});

/**
 * Schema do FORMULÁRIO de gerar: tudo string, sem transform.
 *
 * Separado do `gerarLoteSchema` de propósito: aquele transforma e tem
 * `.default(null)`, o que faz o tipo de entrada diferir do de saída, e o React
 * Hook Form usa UM tipo só para os dois lados.
 */
export const gerarLoteFormSchema = z.object({
  ano: z.string().min(1, { error: "Informe o ano" }),
  parcela: z.enum(["1", "2"], { error: "A parcela é 1 ou 2" }),
  dataVencimento: z.string(),
});

export type GerarLoteFormInput = z.infer<typeof gerarLoteFormSchema>;

/** Converte o formulário de gerar no input de servidor. */
export function gerarLoteFormParaInput(dados: GerarLoteFormInput): unknown {
  return {
    ano: Number(dados.ano),
    parcela: Number(dados.parcela),
    dataVencimento: dados.dataVencimento,
  };
}

/** Schema do FORMULÁRIO de editar a linha: tudo string. */
export const editarItemFormSchema = z.object({
  bruto: z.string().min(1, { error: "Informe o bruto" }),
  inss: z.string(),
  irrf: z.string(),
});

export type EditarItemFormInput = z.infer<typeof editarItemFormSchema>;

/** Status do lote, na ordem do ciclo de vida. */
export const STATUS_LOTE = [
  "rascunho",
  "pendente_aprovacao",
  "aprovado",
  "rejeitado",
] as const;

export type StatusLote = (typeof STATUS_LOTE)[number];

export const ROTULO_STATUS_LOTE: Record<StatusLote, string> = {
  rascunho: "Rascunho",
  pendente_aprovacao: "Pendente de aprovação",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
};
