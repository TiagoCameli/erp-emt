import { z } from "zod";

import { CASAS_DINHEIRO } from "@/lib/casas-decimais";
import { idSchemaCom } from "@/lib/id";
import { casasDecimais, paraNumero } from "@/modules/rh/percentual";

/**
 * Casas do percentual DIGITADO. A coluna `percentual` é numeric(7,4) e este
 * schema divide por 100, o que acrescenta duas casas: digitar "33,333" viraria
 * 0,33333 e o banco arredondaria para 0,3333 sem avisar ninguém.
 */
const CASAS_PERCENTUAL_DIGITADO = 2;

/** Data yyyy-MM-dd. */
const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Percentual da parcela: entra como o número que o Tiago digita (50, 33,33) e
 * sai como a fração que o banco guarda (0,5). O check da coluna é
 * `percentual > 0 and percentual <= 1`, então mandar 50 cru faria o banco
 * recusar com erro de constraint em vez de uma mensagem que diz o que houve.
 *
 * Usa o `paraNumero` de `@/modules/rh/percentual`, que lê pt-BR (ponto é
 * milhar, vírgula é decimal) e devolve NaN quando o agrupamento do ponto é
 * inválido. NÃO usar o de `rh/parametros-folha/schemas.ts`: aquele segue com
 * a versão antiga de propósito, e nela "0.5" vira 5.
 */
const percentualSchema = z
  .union([z.string(), z.number()])
  .transform((valor, ctx) => {
    const numero = typeof valor === "number" ? valor : paraNumero(valor.trim());

    if (!Number.isFinite(numero)) {
      ctx.addIssue({ code: "custom", message: "Percentual inválido" });
      return z.NEVER;
    }
    if (numero <= 0 || numero > 100) {
      ctx.addIssue({
        code: "custom",
        message: "O percentual tem que estar entre 0 e 100",
      });
      return z.NEVER;
    }
    if (casasDecimais(numero) > CASAS_PERCENTUAL_DIGITADO) {
      ctx.addIssue({
        code: "custom",
        message: `O percentual aceita no máximo ${CASAS_PERCENTUAL_DIGITADO} casas decimais`,
      });
      return z.NEVER;
    }

    // O round fecha o erro de ponto flutuante da divisão (33,33/100 não é
    // exatamente 0,3333 em binário) antes de o número virar numeric(7,4).
    return Math.round((numero / 100) * 10_000) / 10_000;
  });

/** Dinheiro digitado em pt-BR, não negativo, NUMERIC(14,2). */
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

/**
 * Texto obrigatório de motivo. O `trim` do Zod corta espaço, tab e quebra de
 * linha, que é o mesmo conjunto do `btrim(x, E' \t\r\n')` das RPCs: sem isso
 * um motivo feito só de tab passaria aqui e seria recusado lá no banco, com
 * mensagem pior.
 */
const motivoTextoSchema = z
  .string()
  .trim()
  .min(1, { error: "Informe o motivo" })
  .max(500, { error: "Máximo de 500 caracteres" });

export const gerarLoteSchema = z.object({
  ano: z
    .number({ error: "Informe o ano" })
    .int({ error: "Ano inválido" })
    .min(2000, { error: "Ano inválido" })
    .max(2100, { error: "Ano inválido" }),
  parcela: z.union([z.literal(1), z.literal(2)], {
    error: "A parcela é 1 ou 2",
  }),
  percentual: percentualSchema,
  comDesconto: z.boolean(),
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

export type GerarLoteInput = z.input<typeof gerarLoteSchema>;

export const editarItemSchema = z.object({
  itemId: idSchemaCom("Item inválido"),
  valor: dinheiroSchema,
});

export const motivoSchema = z.object({
  loteId: idSchemaCom("Lote inválido"),
  motivo: motivoTextoSchema,
});

export const loteIdSchema = z.object({
  loteId: idSchemaCom("Lote inválido"),
});

/** Status do lote, na ordem em que aparecem no ciclo de vida. */
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

/**
 * Schema do FORMULÁRIO: tudo string, sem transform.
 *
 * É separado do `gerarLoteSchema` de propósito. Aquele transforma (percentual
 * vira fração, vencimento vazio vira null) e tem `.default(null)`, o que faz o
 * tipo de entrada diferir do de saída. O React Hook Form usa UM tipo só para
 * os dois lados, e um resolver com input ≠ output quebra a tipagem do
 * `useForm` e o comportamento dos campos.
 *
 * Aqui só se valida o que dá para validar sem converter. A conversão de
 * verdade acontece no servidor, onde `gerarLoteSchema` roda de novo sobre o
 * que chegou.
 */
export const gerarLoteFormSchema = z.object({
  ano: z.string().min(1, { error: "Informe o ano" }),
  parcela: z.enum(["1", "2"], { error: "A parcela é 1 ou 2" }),
  percentual: z.string().min(1, { error: "Informe o percentual" }),
  comDesconto: z.boolean(),
  dataVencimento: z.string(),
});

export type GerarLoteFormInput = z.infer<typeof gerarLoteFormSchema>;

/** Converte o formulário no input de servidor. */
export function gerarLoteFormParaInput(dados: GerarLoteFormInput): unknown {
  return {
    ano: Number(dados.ano),
    parcela: Number(dados.parcela),
    percentual: dados.percentual,
    comDesconto: dados.comDesconto,
    dataVencimento: dados.dataVencimento,
  };
}

/** Sugestão de percentual por parcela, em pontos percentuais. */
export const PERCENTUAL_SUGERIDO: Record<"1" | "2", string> = {
  // Metade na 1ª é o usual. Na 2ª o padrão é 100%: o abatimento do que a 1ª
  // pagou é feito pela RPC, então 50% aqui daria líquido zero, e isso não pode
  // passar por descuido em dezembro.
  "1": "50",
  "2": "100",
};
