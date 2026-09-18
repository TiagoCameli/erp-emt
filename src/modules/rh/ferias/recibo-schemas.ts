import { z } from "zod";

import { CASAS_DINHEIRO } from "@/lib/casas-decimais";
import { idSchemaCom } from "@/lib/id";
import { STATUS_FERIAS } from "@/modules/rh/ferias/schemas";
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

/** Data obrigatória yyyy-MM-dd. */
function dataObrigatoria(erro: string) {
  return z.string().trim().regex(DATA_REGEX, { error: erro });
}

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
 * Lançar férias: cria o registro de gozo E o recibo numa tacada só.
 *
 * As datas de gozo são OBRIGATÓRIAS aqui, ao contrário do cadastro de férias,
 * onde "só programada" é estado legítimo. O motivo é dinheiro: a data de
 * início do gozo define a competência e o vencimento da conta a pagar, então
 * um recibo sem ela não teria em que mês ser lançado.
 *
 * O app NÃO calcula: bruto, INSS e IRRF são digitados. O líquido não entra
 * aqui, é a subtração dos três, mantida por trigger no banco. Mandar o líquido
 * junto criaria dois donos do mesmo número.
 */
export const lancarFeriasSchema = z
  .object({
    colaboradorId: idSchemaCom("Selecione o colaborador"),
    periodoAquisitivoInicio: dataObrigatoria(
      "Início do período aquisitivo inválido",
    ),
    periodoAquisitivoFim: dataObrigatoria("Fim do período aquisitivo inválido"),
    dataInicio: dataObrigatoria("Informe o início do gozo"),
    dataFim: dataObrigatoria("Informe o fim do gozo"),
    dias: z
      .number({ error: "Dias inválidos" })
      .int({ error: "Dias precisa ser um número inteiro" })
      .min(1, { error: "Informe quantos dias de férias" }),
    status: z.enum(STATUS_FERIAS, { error: "Status inválido" }),
    bruto: dinheiroSchema,
    inss: dinheiroOpcionalSchema,
    irrf: dinheiroOpcionalSchema,
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
    observacao: z
      .string()
      .trim()
      .max(500, { error: "Máximo de 500 caracteres" })
      .optional(),
  })
  .refine((dados) => dados.periodoAquisitivoFim >= dados.periodoAquisitivoInicio, {
    error: "Fim do período aquisitivo não pode ser antes do início",
    path: ["periodoAquisitivoFim"],
  })
  .refine((dados) => dados.dataFim >= dados.dataInicio, {
    error: "Fim do gozo não pode ser antes do início",
    path: ["dataFim"],
  })
  .refine((dados) => dados.inss + dados.irrf <= dados.bruto, {
    error: "Os descontos passam do bruto: o líquido ficaria negativo",
    path: ["inss"],
  });

export type LancarFeriasInput = z.infer<typeof lancarFeriasSchema>;

/**
 * Editar os valores do recibo: os três números que a pessoa digita.
 *
 * Bruto zero é aceito de propósito: é assim que um recibo digitado por engano
 * volta a não virar conta a pagar.
 */
export const editarReciboSchema = z
  .object({
    feriasId: idSchemaCom("Registro inválido"),
    bruto: dinheiroSchema,
    inss: dinheiroOpcionalSchema,
    irrf: dinheiroOpcionalSchema,
  })
  .refine((dados) => dados.inss + dados.irrf <= dados.bruto, {
    error: "Os descontos passam do bruto: o líquido ficaria negativo",
    path: ["inss"],
  });

/**
 * Vencimento do recibo. `null` apaga a data escolhida e volta ao padrão (dois
 * dias antes do início do gozo), que é o único jeito de desfazer sem recriar.
 */
export const definirVencimentoReciboSchema = z.object({
  feriasId: idSchemaCom("Registro inválido"),
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

export const motivoReciboSchema = z.object({
  feriasId: idSchemaCom("Registro inválido"),
  motivo: motivoTextoSchema,
});

export const reciboIdSchema = z.object({
  feriasId: idSchemaCom("Registro inválido"),
});

/**
 * Schema do FORMULÁRIO de lançar: tudo string, sem transform.
 *
 * Separado do `lancarFeriasSchema` de propósito: aquele transforma e tem
 * `.default(null)`, o que faz o tipo de entrada diferir do de saída, e o React
 * Hook Form usa UM tipo só para os dois lados.
 */
export const lancarFeriasFormSchema = z.object({
  colaboradorId: idSchemaCom("Selecione o colaborador"),
  periodoAquisitivoInicio: z
    .string()
    .trim()
    .regex(DATA_REGEX, { error: "Informe o início do período aquisitivo" }),
  periodoAquisitivoFim: z
    .string()
    .trim()
    .regex(DATA_REGEX, { error: "Informe o fim do período aquisitivo" }),
  dataInicio: z
    .string()
    .trim()
    .regex(DATA_REGEX, { error: "Informe o início do gozo" }),
  dataFim: z.string().trim().regex(DATA_REGEX, { error: "Informe o fim do gozo" }),
  dias: z.string().trim().min(1, { error: "Informe os dias" }),
  status: z.enum(STATUS_FERIAS, { error: "Selecione o status" }),
  bruto: z.string().min(1, { error: "Informe o bruto" }),
  inss: z.string(),
  irrf: z.string(),
  dataVencimento: z.string(),
  observacao: z.string().trim().max(500, { error: "Máximo de 500 caracteres" }),
});

export type LancarFeriasFormInput = z.infer<typeof lancarFeriasFormSchema>;

/** Converte o formulário de lançar no input de servidor. */
export function lancarFeriasFormParaInput(
  dados: LancarFeriasFormInput,
): unknown {
  return {
    colaboradorId: dados.colaboradorId,
    periodoAquisitivoInicio: dados.periodoAquisitivoInicio,
    periodoAquisitivoFim: dados.periodoAquisitivoFim,
    dataInicio: dados.dataInicio,
    dataFim: dados.dataFim,
    dias: Number(dados.dias.trim()),
    status: dados.status,
    bruto: dados.bruto,
    inss: dados.inss,
    irrf: dados.irrf,
    dataVencimento: dados.dataVencimento,
    observacao: dados.observacao === "" ? undefined : dados.observacao,
  };
}

/** Schema do FORMULÁRIO de editar os valores: tudo string. */
export const editarReciboFormSchema = z.object({
  bruto: z.string().min(1, { error: "Informe o bruto" }),
  inss: z.string(),
  irrf: z.string(),
});

export type EditarReciboFormInput = z.infer<typeof editarReciboFormSchema>;

/**
 * Status do PAGAMENTO, na ordem do ciclo de vida.
 *
 * `sem_recibo` quer dizer "ninguém digitou dinheiro nisto ainda": são férias
 * cadastradas só como gozo. É independente do `status` do gozo (programada /
 * gozada): alguém pode estar de férias sem o recibo ter saído, e receber
 * antecipado sem ter saído ainda.
 */
export const STATUS_RECIBO = [
  "sem_recibo",
  "rascunho",
  "pendente_aprovacao",
  "aprovado",
] as const;

export type StatusRecibo = (typeof STATUS_RECIBO)[number];

export const ROTULO_STATUS_RECIBO: Record<StatusRecibo, string> = {
  sem_recibo: "Sem recibo",
  rascunho: "Rascunho",
  pendente_aprovacao: "Pendente de aprovação",
  aprovado: "Aprovado",
};
