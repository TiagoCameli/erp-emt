import { z } from "zod";

import { idSchema, idSchemaCom } from "@/lib/id";

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

export const TIPOS_CONTRATO = [
  "emprestimo",
  "capital_giro",
  "finame",
  "cdc",
  "leasing",
  "financiamento_equipamento",
] as const;
export const ROTULO_TIPO_CONTRATO: Record<(typeof TIPOS_CONTRATO)[number], string> = {
  emprestimo: "Empréstimo",
  capital_giro: "Capital de giro",
  finame: "FINAME",
  cdc: "CDC",
  leasing: "Leasing",
  financiamento_equipamento: "Financiamento de equipamento",
};

export const INDEXADORES = ["pre", "cdi", "tjlp", "ipca", "outro"] as const;
export const ROTULO_INDEXADOR: Record<(typeof INDEXADORES)[number], string> = {
  pre: "Pré-fixado",
  cdi: "CDI",
  tjlp: "TJLP",
  ipca: "IPCA",
  outro: "Outro",
};

/** "banco" = pós-fixado, FINAME...: o cronograma vem digitado do PDF. */
export const SISTEMAS = ["price", "sac", "banco"] as const;
export const ROTULO_SISTEMA: Record<(typeof SISTEMAS)[number], string> = {
  price: "Price",
  sac: "SAC",
  banco: "Do banco",
};

export const STATUS_CONTRATO = ["ativo", "quitado", "renegociado"] as const;
export const ROTULO_STATUS_CONTRATO: Record<(typeof STATUS_CONTRATO)[number], string> = {
  ativo: "Ativo",
  quitado: "Quitado",
  renegociado: "Renegociado",
};

export const TIPOS_EVENTO = ["amortizacao", "quitacao", "renegociacao"] as const;
export const ROTULO_EVENTO: Record<(typeof TIPOS_EVENTO)[number] | "cronograma", string> = {
  cronograma: "Cronograma",
  amortizacao: "Amortização",
  quitacao: "Quitação",
  renegociacao: "Renegociação",
};

export const STATUS_COTA = ["ativa", "contemplada", "quitada"] as const;
export const ROTULO_STATUS_COTA: Record<(typeof STATUS_COTA)[number], string> = {
  ativa: "Ativa",
  contemplada: "Contemplada",
  quitada: "Quitada",
};

/** Rótulo de um código do banco, ou o próprio código se a lista não conhece. */
export function rotulo<T extends string>(mapa: Record<T, string>, valor: string): string {
  return (mapa as Record<string, string>)[valor] ?? valor;
}

/** VALOR em reais dentro da coluna 14,2. */
function valorReais(rotuloCampo: string) {
  return z
    .number({ error: `${rotuloCampo} inválido` })
    .min(0, { error: `${rotuloCampo} não pode ser negativo` })
    .max(999999999999.99, { error: `${rotuloCampo} acima do permitido` });
}
function positivo(rotuloCampo: string) {
  return valorReais(rotuloCampo).refine((v) => v > 0, { error: `${rotuloCampo} precisa ser maior que zero` });
}
const data = (mensagem: string) => z.string().trim().regex(DATA_ISO, { error: mensagem });
const idOpcional = z.union([idSchema, z.literal("")]).optional();
const textoOpcional = (max: number) => z.string().trim().max(max, { error: `Máximo de ${max} caracteres` }).optional();

// ---------- contrato ----------

/**
 * O que a action manda para `fn_salvar_contrato_divida` (as chaves do jsonb
 * são estas, em camelCase). A etapa e as datas o banco confere de novo.
 */
export const contratoSchema = z
  .object({
    credor: z.string().trim().min(1, { error: "Informe o credor" }).max(200),
    numero: z.string().trim().min(1, { error: "Informe o número do contrato" }).max(100),
    tipo: z.enum(TIPOS_CONTRATO, { error: "Escolha o tipo" }),
    centroCustoId: idSchemaCom("Escolha a etapa do contrato"),
    lancamentoId: idOpcional,
    lancamentoLiberacaoId: idOpcional,
    valorContratado: positivo("Valor contratado"),
    valorLiberado: positivo("Valor liberado"),
    dataLiberacao: data("Informe a data da liberação"),
    taxaAm: z
      .number({ error: "Taxa inválida" })
      .min(0, { error: "Taxa não pode ser negativa" })
      .max(100, { error: "Taxa acima de 100% ao mês" }),
    indexador: z.enum(INDEXADORES),
    sistema: z.enum(SISTEMAS, { error: "Escolha o sistema" }),
    carenciaMeses: z.number().int().min(0, { error: "Carência não pode ser negativa" }),
    parcelas: z.number().int({ error: "Parcelas inválidas" }).min(1, { error: "Informe as parcelas" }).max(32767),
    primeiroVencimento: data("Informe o primeiro vencimento"),
    garantia: textoOpcional(500),
    status: z.enum(STATUS_CONTRATO).optional(),
    observacoes: textoOpcional(2000),
  })
  .refine((v) => v.primeiroVencimento > v.dataLiberacao, {
    error: "O primeiro vencimento precisa ser depois da liberação",
    path: ["primeiroVencimento"],
  })
  .refine((v) => v.carenciaMeses < v.parcelas, {
    error: "A carência precisa ser menor que o número de parcelas",
    path: ["carenciaMeses"],
  });

export type ContratoInput = z.infer<typeof contratoSchema>;

/** O formulário: dinheiro e números como texto dos inputs ("1234,56"). */
export const contratoFormSchema = z
  .object({
    credor: z.string().trim().min(1, { error: "Informe o credor" }),
    numero: z.string().trim().min(1, { error: "Informe o número do contrato" }),
    tipo: z.string().min(1, { error: "Escolha o tipo" }),
    centroCustoId: z.string().min(1, { error: "Escolha a etapa do contrato" }),
    lancamentoId: z.string(),
    lancamentoLiberacaoId: z.string(),
    valorContratado: z.string().trim().min(1, { error: "Informe o valor contratado" }),
    valorLiberado: z.string().trim().min(1, { error: "Informe o valor liberado" }),
    dataLiberacao: data("Informe a data da liberação"),
    taxaAm: z.string().trim().min(1, { error: "Informe a taxa ao mês" }),
    indexador: z.string(),
    sistema: z.string().min(1, { error: "Escolha o sistema" }),
    carenciaMeses: z.string(),
    parcelas: z.string().trim().regex(/^\d+$/, { error: "Informe as parcelas" }),
    primeiroVencimento: data("Informe o primeiro vencimento"),
    garantia: z.string(),
    status: z.string(),
    observacoes: z.string(),
  })
  .refine((v) => !DATA_ISO.test(v.dataLiberacao) || v.primeiroVencimento > v.dataLiberacao, {
    error: "O primeiro vencimento precisa ser depois da liberação",
    path: ["primeiroVencimento"],
  })
  .refine((v) => /^\d*$/.test(v.carenciaMeses.trim()), {
    error: "Carência em meses inteiros",
    path: ["carenciaMeses"],
  })
  .refine((v) => Number(v.carenciaMeses.trim() || 0) < Number(v.parcelas || 0) || !/^\d+$/.test(v.parcelas), {
    error: "A carência precisa ser menor que o número de parcelas",
    path: ["carenciaMeses"],
  });

export type ContratoFormInput = z.infer<typeof contratoFormSchema>;

// ---------- cronograma e eventos ----------

const centavos = (rotuloCampo: string) =>
  valorReais(rotuloCampo).refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, {
    error: `${rotuloCampo} com mais de duas casas`,
  });

export const linhaCronogramaSchema = z.object({
  vencimento: data("Parcela sem vencimento"),
  principal: centavos("Principal"),
  juros: centavos("Juros"),
  encargos: centavos("Encargos"),
});

export const linhasCronogramaSchema = z
  .array(linhaCronogramaSchema)
  .min(1, { error: "Informe as parcelas do cronograma" })
  .refine((ls) => new Set(ls.map((l) => l.vencimento)).size === ls.length, {
    error: "Duas parcelas com o mesmo vencimento",
  });

export type LinhaCronogramaInput = z.infer<typeof linhaCronogramaSchema>;

const motivo = z.string().trim().max(500, { error: "Máximo de 500 caracteres no motivo" });

export const eventoSchema = z
  .object({
    contratoId: idSchema,
    tipo: z.enum(TIPOS_EVENTO, { error: "Escolha o evento" }),
    data: data("Informe a data do evento"),
    /** Amortização: o que abateu. Quitação: o que foi pago. Renegociação: o saldo novo (vazio = o saldo na data). */
    valor: centavos("Valor").optional(),
    motivo: motivo.min(1, { error: "Informe o motivo do evento" }),
    /** Parcelas que ficam depois do evento. Obrigatório na renegociação. */
    linhas: z.array(linhaCronogramaSchema).optional(),
  })
  .refine((v) => v.tipo === "renegociacao" || v.valor !== undefined, {
    error: "Informe o valor do evento",
    path: ["valor"],
  })
  .refine((v) => v.tipo !== "renegociacao" || (v.linhas?.length ?? 0) > 0, {
    error: "Informe o cronograma renegociado",
    path: ["linhas"],
  });

export type EventoInput = z.infer<typeof eventoSchema>;

// ---------- consórcio ----------

export const cotaSchema = z.object({
  administradora: z.string().trim().min(1, { error: "Informe a administradora" }).max(200),
  grupo: z.string().trim().min(1, { error: "Informe o grupo" }).max(50),
  cota: z.string().trim().min(1, { error: "Informe a cota" }).max(50),
  bem: z.string().trim().min(1, { error: "Informe o bem" }).max(200),
  centroCustoId: idOpcional,
  lancamentoId: idOpcional,
  valorCredito: positivo("Valor do crédito"),
  prazo: z.number().int().min(1, { error: "Informe o prazo" }).max(32767),
  taxaAdmPct: z.number({ error: "Taxa inválida" }).min(0).max(100, { error: "Taxa acima de 100%" }),
  fundoReservaPct: z.number({ error: "Fundo de reserva inválido" }).min(0).max(100),
  primeiroVencimento: data("Informe o primeiro vencimento"),
  observacoes: textoOpcional(2000),
});

export type CotaInput = z.infer<typeof cotaSchema>;

export const cotaFormSchema = z.object({
  administradora: z.string().trim().min(1, { error: "Informe a administradora" }),
  grupo: z.string().trim().min(1, { error: "Informe o grupo" }),
  cota: z.string().trim().min(1, { error: "Informe a cota" }),
  bem: z.string().trim().min(1, { error: "Informe o bem" }),
  centroCustoId: z.string(),
  lancamentoId: z.string(),
  valorCredito: z.string().trim().min(1, { error: "Informe o valor do crédito" }),
  prazo: z.string().trim().regex(/^\d+$/, { error: "Informe o prazo em meses" }),
  taxaAdmPct: z.string().trim().min(1, { error: "Informe a taxa de administração" }),
  fundoReservaPct: z.string(),
  primeiroVencimento: data("Informe o primeiro vencimento"),
  observacoes: z.string(),
});

export type CotaFormInput = z.infer<typeof cotaFormSchema>;

export const linhaConsorcioSchema = z.object({
  vencimento: data("Parcela sem vencimento"),
  fundoComum: centavos("Fundo comum"),
  taxaAdm: centavos("Taxa de administração"),
  fundoReserva: centavos("Fundo de reserva"),
});

export type LinhaConsorcioInput = z.infer<typeof linhaConsorcioSchema>;

export const contemplacaoSchema = z
  .object({
    cotaId: idSchema,
    data: data("Informe a data da contemplação"),
    forma: z.enum(["sorteio", "lance"], { error: "Escolha sorteio ou lance" }),
    valorCarta: positivo("Valor da carta"),
    valorLance: valorReais("Valor do lance").optional(),
    bemCentroId: idOpcional,
    motivo: motivo.optional(),
  })
  .refine((v) => v.forma !== "lance" || (v.valorLance ?? 0) > 0, {
    error: "Informe o valor do lance",
    path: ["valorLance"],
  });

export type ContemplacaoInput = z.infer<typeof contemplacaoSchema>;

/** Arredonda para centavo inteiro antes de mandar. */
export function paraCentavo(valor: number): number {
  return Math.round(valor * 100) / 100;
}
