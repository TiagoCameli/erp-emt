import { z } from "zod";

import { idSchema } from "@/lib/id";
import { normalizarNumeroDigitado } from "@/lib/numero-digitado";
import { ehNumeroAmbiguo } from "@/modules/medicao/_shared/numero-ambiguo";

/**
 * Validação do reajuste (Fase 6). O banco confere tudo de novo (`fn_mc_reajuste_importar`,
 * `fn_mc_reajuste_manual`, `fn_mc_reajuste_config_salvar`); aqui só evita mandar lixo e deixa a
 * mensagem no campo. Ids por `idSchema` (os da carga do L09/L10 vêm de md5 e `z.uuid()` recusaria).
 */

/** Itens que recebem cada linha do SIAC (chave `grupo|codigo`, "4,0|60112") e o destino escolhido. */
export const escolhasSchema = z.record(
  z.string().regex(/^\d+,\d+\|\d+$/),
  z.object({ itens: z.array(idSchema).max(20), destino: idSchema.nullable() }),
);

export const SENTIDOS_REAJUSTE = ["positivo", "negativo"] as const;
export type SentidoReajuste = (typeof SENTIDOS_REAJUSTE)[number];
export const SITUACOES_REAJUSTE = ["provisorio", "definitivo"] as const;
export type SituacaoReajuste = (typeof SITUACOES_REAJUSTE)[number];

export const MENSAGEM_VALOR_MANUAL = "Informe o valor do reajuste, até 2 casas";

function mensagemAmbiguo(limpo: string): string {
  return `Número ambíguo: "${limpo}". Use vírgula decimal (${limpo.replace(".", ",")}) ou escreva sem separador de milhar (${limpo.replace(".", "")})`;
}

/**
 * Valor digitado no `InputMoeda` ("1.234,56", sem sinal) + o sentido -> texto com PONTO para a RPC
 * ("1234.56" ou "-1234.56"), sem passar por Number (D7). Zero vai sem sinal. "1.234" é recusado como
 * no colar (pode ser 1234 ou 1,234). Null quando não é um número de até 2 casas.
 */
export function valorManualParaBanco(valor: string, sentido: SentidoReajuste): string | null {
  const limpo = (valor ?? "").trim();
  if (limpo === "" || ehNumeroAmbiguo(limpo)) return null;
  const normalizado = normalizarNumeroDigitado(limpo, 2);
  if (normalizado === null) return null;
  const comPonto = normalizado.replace(",", ".");
  if (/^0+(\.0+)?$/.test(comPonto)) return "0";
  return sentido === "negativo" ? `-${comPonto}` : comPonto;
}

/** Lançamento manual (sem relatório SIAC). O valor sai pronto para a RPC. */
export const manualSchema = z
  .object({
    valor: z.string(),
    sentido: z.enum(SENTIDOS_REAJUSTE, { error: "Escolha se o reajuste é positivo ou negativo" }),
    situacao: z.enum(SITUACOES_REAJUSTE, { error: "Escolha a situação dos índices: provisório ou definitivo" }),
    observacao: z.string().trim().max(500, "A observação tem no máximo 500 caracteres").default(""),
    arquivoId: idSchema.nullable(),
  })
  .superRefine((d, ctx) => {
    const limpo = (d.valor ?? "").trim();
    if (ehNumeroAmbiguo(limpo)) ctx.addIssue({ code: "custom", path: ["valor"], message: mensagemAmbiguo(limpo) });
    else if (valorManualParaBanco(d.valor, d.sentido) === null) ctx.addIssue({ code: "custom", path: ["valor"], message: MENSAGEM_VALOR_MANUAL });
  })
  .transform((d) => ({ ...d, valor: valorManualParaBanco(d.valor, d.sentido) as string }));
export type ManualInput = z.input<typeof manualSchema>;

/**
 * O formulário do lançamento manual na tela: os mesmos textos do `manualSchema`, mas cada campo se
 * valida sozinho (o `superRefine` do objeto só roda quando sentido e situação já passaram, e a tela
 * precisa dizer tudo que falta de uma vez). Os valores vão crus para a action, que usa o
 * `manualSchema`; o anexo vazio ("") vira null no envio.
 */
export const manualFormSchema = z.object({
  valor: z.string().superRefine((valor, ctx) => {
    const limpo = (valor ?? "").trim();
    if (ehNumeroAmbiguo(limpo)) ctx.addIssue({ code: "custom", message: mensagemAmbiguo(limpo) });
    else if (valorManualParaBanco(valor, "positivo") === null) ctx.addIssue({ code: "custom", message: MENSAGEM_VALOR_MANUAL });
  }),
  sentido: z.string().refine((v) => (SENTIDOS_REAJUSTE as readonly string[]).includes(v), "Escolha se o reajuste é positivo ou negativo"),
  situacao: z
    .string()
    .refine((v) => (SITUACOES_REAJUSTE as readonly string[]).includes(v), "Escolha a situação dos índices: provisório ou definitivo"),
  observacao: z.string().max(500, "A observação tem no máximo 500 caracteres"),
  arquivoId: z.string(),
});
export type ManualFormInput = z.input<typeof manualFormSchema>;

/** Seção Reajuste do contrato: data-base em mês ("aaaa-mm"), obrigatória com reajuste. */
export const configSchema = z
  .object({
    temReajuste: z.boolean({ error: "Informe se o contrato tem reajuste" }),
    dataBase: z
      .string()
      .trim()
      .regex(/^(\d{4}-(0[1-9]|1[0-2]))?$/, "Data-base inválida: informe mês e ano"),
    periodicidadeMeses: z
      .number({ error: "Periodicidade inválida: de 1 a 120 meses" })
      .int("Periodicidade inválida: de 1 a 120 meses")
      .min(1, "Periodicidade inválida: de 1 a 120 meses")
      .max(120, "Periodicidade inválida: de 1 a 120 meses"),
    indiceDescricao: z.string().trim().max(200, "O índice tem no máximo 200 caracteres").default(""),
  })
  .superRefine((d, ctx) => {
    if (d.temReajuste && d.dataBase === "") {
      ctx.addIssue({ code: "custom", path: ["dataBase"], message: "Informe o mês da data-base do reajuste" });
    }
  });
export type ConfigReajusteInput = z.input<typeof configSchema>;
