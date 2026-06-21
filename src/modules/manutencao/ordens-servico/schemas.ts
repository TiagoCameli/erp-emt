import { z } from "zod";

import {
  numeroNaoNegativo,
  numeroOpcionalNaoNegativo,
  numeroPositivo,
  paraNumero,
} from "@/modules/manutencao/ordens-servico/numero";

/** Tipos de OS aceitos pela RPC fn_abrir_os. */
export const TIPOS_OS = ["corretiva", "preventiva"] as const;

/** Prioridades de OS aceitas pela RPC fn_abrir_os. */
export const PRIORIDADES_OS = ["baixa", "media", "alta"] as const;

/** Horímetro/km NUMERIC(12,2): finito, não negativo. */
const LEITURA_MAX = 9999999999.99;

/** Leitura numérica não negativa e dentro do limite do banco. */
function leituraValida(valor: number): boolean {
  return Number.isFinite(valor) && valor >= 0 && valor <= LEITURA_MAX;
}

/* ------------------------------------------------------------------ */
/* Abrir OS                                                            */
/* ------------------------------------------------------------------ */

/** Schema de servidor da abertura da OS (tipos já coeridos). */
export const abrirOsSchema = z.object({
  equipamentoId: z.uuid({ error: "Selecione o equipamento" }),
  tipo: z.enum(TIPOS_OS, { error: "Selecione o tipo da OS" }),
  descricao: z
    .string()
    .trim()
    .min(1, { error: "Descreva o serviço da OS" })
    .max(1000, { error: "Máximo de 1000 caracteres" }),
  prioridade: z.enum(PRIORIDADES_OS, { error: "Selecione a prioridade" }),
  horimetro: z
    .number({ error: "Horímetro inválido" })
    .refine(leituraValida, { error: "Horímetro inválido" })
    .optional(),
  km: z
    .number({ error: "Quilometragem inválida" })
    .refine(leituraValida, { error: "Quilometragem inválida" })
    .optional(),
});

export type AbrirOsInput = z.infer<typeof abrirOsSchema>;

/** Schema do formulário (client): números como string pt-BR. */
export const abrirOsFormSchema = z.object({
  equipamentoId: z.uuid({ error: "Selecione o equipamento" }),
  tipo: z.enum(TIPOS_OS, { error: "Selecione o tipo da OS" }),
  descricao: z
    .string()
    .trim()
    .min(1, { error: "Descreva o serviço da OS" })
    .max(1000, { error: "Máximo de 1000 caracteres" }),
  prioridade: z.enum(PRIORIDADES_OS, { error: "Selecione a prioridade" }),
  horimetro: z
    .string()
    .trim()
    .refine(numeroOpcionalNaoNegativo, { error: "Horímetro inválido" }),
  km: z
    .string()
    .trim()
    .refine(numeroOpcionalNaoNegativo, { error: "Quilometragem inválida" }),
});

export type AbrirOsFormInput = z.infer<typeof abrirOsFormSchema>;

/** Converte o formulário (strings) no input de servidor (números coeridos). */
export function abrirOsFormParaInput(dados: AbrirOsFormInput): AbrirOsInput {
  return {
    equipamentoId: dados.equipamentoId,
    tipo: dados.tipo,
    descricao: dados.descricao,
    prioridade: dados.prioridade,
    horimetro: dados.horimetro.trim() === "" ? undefined : paraNumero(dados.horimetro),
    km: dados.km.trim() === "" ? undefined : paraNumero(dados.km),
  };
}

/* ------------------------------------------------------------------ */
/* Peça                                                               */
/* ------------------------------------------------------------------ */

/** Schema de servidor da baixa de peça (tipos já coeridos). */
export const pecaSchema = z.object({
  insumoId: z.uuid({ error: "Selecione o insumo" }),
  depositoId: z.uuid({ error: "Selecione o almoxarifado" }),
  quantidade: z
    .number({ error: "Quantidade inválida" })
    .refine((v) => v > 0, { error: "A quantidade precisa ser maior que zero" })
    .refine((v) => Number.isFinite(v) && v <= 99999999999.999, {
      error: "Quantidade acima do permitido",
    }),
});

export type PecaInput = z.infer<typeof pecaSchema>;

/** Schema do formulário da peça (client): quantidade como string pt-BR. */
export const pecaFormSchema = z.object({
  insumoId: z.uuid({ error: "Selecione o insumo" }),
  depositoId: z.uuid({ error: "Selecione o almoxarifado" }),
  quantidade: z
    .string()
    .trim()
    .refine(numeroPositivo, { error: "Informe uma quantidade maior que zero" }),
});

export type PecaFormInput = z.infer<typeof pecaFormSchema>;

/** Converte o formulário da peça no input de servidor. */
export function pecaFormParaInput(dados: PecaFormInput): PecaInput {
  return {
    insumoId: dados.insumoId,
    depositoId: dados.depositoId,
    quantidade: paraNumero(dados.quantidade),
  };
}

/* ------------------------------------------------------------------ */
/* Mão de obra                                                        */
/* ------------------------------------------------------------------ */

/** Schema de servidor da mão de obra (tipos já coeridos). */
export const maoObraSchema = z.object({
  colaboradorId: z.uuid({ error: "Selecione o colaborador" }),
  horas: z
    .number({ error: "Horas inválidas" })
    .refine((v) => v > 0, { error: "As horas precisam ser maiores que zero" })
    .refine((v) => Number.isFinite(v) && v <= 99999999999.999, {
      error: "Horas acima do permitido",
    }),
  valorHora: z
    .number({ error: "Valor inválido" })
    .refine((v) => v >= 0, { error: "O valor não pode ser negativo" })
    .refine((v) => Number.isFinite(v) && v <= 999999999999.99, {
      error: "Valor acima do permitido",
    }),
});

export type MaoObraInput = z.infer<typeof maoObraSchema>;

/** Schema do formulário da mão de obra (client): números como string pt-BR. */
export const maoObraFormSchema = z.object({
  colaboradorId: z.uuid({ error: "Selecione o colaborador" }),
  horas: z
    .string()
    .trim()
    .refine(numeroPositivo, { error: "Informe horas maiores que zero" }),
  valorHora: z
    .string()
    .trim()
    .refine(numeroNaoNegativo, { error: "Informe um valor válido" }),
});

export type MaoObraFormInput = z.infer<typeof maoObraFormSchema>;

/** Converte o formulário da mão de obra no input de servidor. */
export function maoObraFormParaInput(dados: MaoObraFormInput): MaoObraInput {
  return {
    colaboradorId: dados.colaboradorId,
    horas: paraNumero(dados.horas),
    valorHora: paraNumero(dados.valorHora),
  };
}

/* ------------------------------------------------------------------ */
/* Terceiro                                                           */
/* ------------------------------------------------------------------ */

/** Data opcional yyyy-MM-dd; string vazia vira undefined. */
const dataVencimentoSchema = z
  .string()
  .trim()
  .optional()
  .refine(
    (valor) =>
      valor === undefined || valor === "" || /^\d{4}-\d{2}-\d{2}$/.test(valor),
    { error: "Data inválida" },
  )
  .transform((valor) =>
    valor === undefined || valor === "" ? undefined : valor,
  );

/** Schema de servidor do serviço de terceiro (tipos já coeridos). */
export const terceiroSchema = z.object({
  fornecedorId: z.uuid({ error: "Fornecedor inválido" }).optional(),
  descricao: z
    .string()
    .trim()
    .min(1, { error: "Descreva o serviço de terceiro" })
    .max(500, { error: "Máximo de 500 caracteres" }),
  valor: z
    .number({ error: "Valor inválido" })
    .refine((v) => v >= 0, { error: "O valor não pode ser negativo" })
    .refine((v) => Number.isFinite(v) && v <= 999999999999.99, {
      error: "Valor acima do permitido",
    }),
  dataVencimento: dataVencimentoSchema,
});

export type TerceiroInput = z.infer<typeof terceiroSchema>;

/** Schema do formulário do terceiro (client): valor como string pt-BR. */
export const terceiroFormSchema = z.object({
  fornecedorId: z.uuid().optional(),
  descricao: z
    .string()
    .trim()
    .min(1, { error: "Descreva o serviço de terceiro" })
    .max(500, { error: "Máximo de 500 caracteres" }),
  valor: z
    .string()
    .trim()
    .refine(numeroNaoNegativo, { error: "Informe um valor válido" }),
  dataVencimento: z.string().trim(),
});

export type TerceiroFormInput = z.infer<typeof terceiroFormSchema>;

/** Converte o formulário do terceiro no input de servidor. */
export function terceiroFormParaInput(dados: TerceiroFormInput): TerceiroInput {
  return {
    fornecedorId:
      dados.fornecedorId && dados.fornecedorId !== ""
        ? dados.fornecedorId
        : undefined,
    descricao: dados.descricao,
    valor: paraNumero(dados.valor),
    dataVencimento:
      dados.dataVencimento.trim() === "" ? undefined : dados.dataVencimento,
  };
}

/* ------------------------------------------------------------------ */
/* Concluir OS                                                        */
/* ------------------------------------------------------------------ */

/** Schema de servidor da conclusão (tipos já coeridos). */
export const concluirSchema = z.object({
  horimetroFech: z
    .number({ error: "Horímetro inválido" })
    .refine(leituraValida, { error: "Horímetro inválido" })
    .optional(),
  kmFech: z
    .number({ error: "Quilometragem inválida" })
    .refine(leituraValida, { error: "Quilometragem inválida" })
    .optional(),
});

export type ConcluirInput = z.infer<typeof concluirSchema>;

/** Schema do formulário da conclusão (client): números como string pt-BR. */
export const concluirFormSchema = z.object({
  horimetroFech: z
    .string()
    .trim()
    .refine(numeroOpcionalNaoNegativo, { error: "Horímetro inválido" }),
  kmFech: z
    .string()
    .trim()
    .refine(numeroOpcionalNaoNegativo, { error: "Quilometragem inválida" }),
});

export type ConcluirFormInput = z.infer<typeof concluirFormSchema>;

/** Converte o formulário da conclusão no input de servidor. */
export function concluirFormParaInput(dados: ConcluirFormInput): ConcluirInput {
  return {
    horimetroFech:
      dados.horimetroFech.trim() === ""
        ? undefined
        : paraNumero(dados.horimetroFech),
    kmFech: dados.kmFech.trim() === "" ? undefined : paraNumero(dados.kmFech),
  };
}
