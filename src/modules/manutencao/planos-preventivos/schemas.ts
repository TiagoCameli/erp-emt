import { z } from "zod";

import {
  numeroOpcionalNaoNegativo,
  numeroPositivo,
  paraNumero,
} from "@/modules/manutencao/planos-preventivos/numero";

/* ------------------------------------------------------------------ */
/* Tipos de intervalo                                                 */
/* ------------------------------------------------------------------ */

/** Base de cálculo de uma atividade do plano (check do banco). */
export const INTERVALOS_TIPO = ["horimetro", "km", "dias"] as const;

export type IntervaloTipo = (typeof INTERVALOS_TIPO)[number];

/** Rótulo pt-BR de cada tipo de intervalo, para exibição e selects. */
export const ROTULO_INTERVALO_TIPO: Record<IntervaloTipo, string> = {
  horimetro: "Horímetro",
  km: "Quilometragem",
  dias: "Dias",
};

/** Unidade que segue o valor do intervalo na exibição (ex: "250 h"). */
export const UNIDADE_INTERVALO_TIPO: Record<IntervaloTipo, string> = {
  horimetro: "h",
  km: "km",
  dias: "dias",
};

/** Valor NUMERIC(12,2) das leituras/bases: finito, não negativo, no limite. */
const LEITURA_MAX = 9999999999.99;

function leituraValida(valor: number): boolean {
  return Number.isFinite(valor) && valor >= 0 && valor <= LEITURA_MAX;
}

/* ------------------------------------------------------------------ */
/* Plano + atividades (formulário)                                    */
/* ------------------------------------------------------------------ */

/**
 * Atividade no formulário (client): intervaloValor é string pt-BR para casar
 * input e output do react-hook-form; a coerção acontece no submit.
 */
export const planoAtividadeFormSchema = z.object({
  descricao: z
    .string()
    .trim()
    .min(1, { error: "Descreva a atividade" })
    .max(200, { error: "Máximo de 200 caracteres" }),
  intervaloTipo: z.enum(INTERVALOS_TIPO, { error: "Selecione a base" }),
  intervaloValor: z
    .string()
    .trim()
    .refine(numeroPositivo, { error: "Informe um intervalo maior que zero" }),
});

export type PlanoAtividadeFormInput = z.infer<typeof planoAtividadeFormSchema>;

/** Schema do formulário do plano (client). */
export const planoFormSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, { error: "O nome precisa ter pelo menos 2 caracteres" })
    .max(120, { error: "O nome pode ter no máximo 120 caracteres" }),
  descricao: z
    .string()
    .trim()
    .max(500, { error: "Máximo de 500 caracteres" }),
  ativo: z.boolean(),
  atividades: z
    .array(planoAtividadeFormSchema)
    .min(1, { error: "Adicione ao menos uma atividade ao plano" }),
});

export type PlanoFormInput = z.infer<typeof planoFormSchema>;

/** Atividade validada no servidor: intervaloValor já coerido. */
export const planoAtividadeSchema = z.object({
  descricao: z
    .string()
    .trim()
    .min(1, { error: "Descreva a atividade" })
    .max(200, { error: "Máximo de 200 caracteres" }),
  intervaloTipo: z.enum(INTERVALOS_TIPO, { error: "Selecione a base" }),
  intervaloValor: z
    .number({ error: "Intervalo inválido" })
    .refine((v) => v > 0, { error: "O intervalo precisa ser maior que zero" })
    .refine(leituraValida, { error: "Intervalo acima do permitido" }),
});

export type PlanoAtividadeInput = z.infer<typeof planoAtividadeSchema>;

/** Schema do plano validado no servidor (criar e editar). */
export const planoSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, { error: "O nome precisa ter pelo menos 2 caracteres" })
    .max(120, { error: "O nome pode ter no máximo 120 caracteres" }),
  descricao: z
    .string()
    .trim()
    .max(500, { error: "Máximo de 500 caracteres" })
    .optional()
    .transform((valor) => (valor === "" || valor === undefined ? null : valor)),
  ativo: z.boolean(),
  atividades: z
    .array(planoAtividadeSchema)
    .min(1, { error: "Adicione ao menos uma atividade ao plano" }),
});

export type PlanoInput = z.infer<typeof planoSchema>;

/** Converte o formulário do plano (strings) no input de servidor (números). */
export function planoFormParaInput(dados: PlanoFormInput): PlanoInput {
  return {
    nome: dados.nome,
    descricao: dados.descricao.trim() === "" ? null : dados.descricao,
    ativo: dados.ativo,
    atividades: dados.atividades.map((atividade) => ({
      descricao: atividade.descricao,
      intervaloTipo: atividade.intervaloTipo,
      intervaloValor: paraNumero(atividade.intervaloValor),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Atribuição de plano a equipamento                                  */
/* ------------------------------------------------------------------ */

/** Data yyyy-MM-dd obrigatória (base_data tem default no banco, mas a UI sempre envia). */
const dataSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Informe a data base" });

/** Schema da atribuição validado no servidor (números já coeridos). */
export const atribuicaoSchema = z.object({
  equipamentoId: z.uuid({ error: "Selecione o equipamento" }),
  planoId: z.uuid({ error: "Selecione o plano" }),
  baseHorimetro: z
    .number({ error: "Horímetro inválido" })
    .refine(leituraValida, { error: "Horímetro inválido" })
    .optional(),
  baseKm: z
    .number({ error: "Quilometragem inválida" })
    .refine(leituraValida, { error: "Quilometragem inválida" })
    .optional(),
  baseData: dataSchema,
});

export type AtribuicaoInput = z.infer<typeof atribuicaoSchema>;

/** Schema do formulário da atribuição (client): bases como string pt-BR. */
export const atribuicaoFormSchema = z.object({
  equipamentoId: z.uuid({ error: "Selecione o equipamento" }),
  planoId: z.uuid({ error: "Selecione o plano" }),
  baseHorimetro: z
    .string()
    .trim()
    .refine(numeroOpcionalNaoNegativo, { error: "Horímetro inválido" }),
  baseKm: z
    .string()
    .trim()
    .refine(numeroOpcionalNaoNegativo, { error: "Quilometragem inválida" }),
  baseData: dataSchema,
});

export type AtribuicaoFormInput = z.infer<typeof atribuicaoFormSchema>;

/** Converte o formulário da atribuição no input de servidor. */
export function atribuicaoFormParaInput(
  dados: AtribuicaoFormInput,
): AtribuicaoInput {
  return {
    equipamentoId: dados.equipamentoId,
    planoId: dados.planoId,
    baseHorimetro:
      dados.baseHorimetro.trim() === ""
        ? undefined
        : paraNumero(dados.baseHorimetro),
    baseKm: dados.baseKm.trim() === "" ? undefined : paraNumero(dados.baseKm),
    baseData: dados.baseData,
  };
}

/* ------------------------------------------------------------------ */
/* Leitura de horímetro/km                                            */
/* ------------------------------------------------------------------ */

/** Tipos de leitura manual aceitos (km não se aplica a controle por horímetro). */
export const TIPOS_LEITURA = ["horimetro", "km"] as const;

export type TipoLeitura = (typeof TIPOS_LEITURA)[number];

/** Rótulo pt-BR de cada tipo de leitura. */
export const ROTULO_TIPO_LEITURA: Record<TipoLeitura, string> = {
  horimetro: "Horímetro",
  km: "Quilometragem",
};

/** Schema da leitura validado no servidor (valor já coerido). */
export const leituraSchema = z.object({
  equipamentoId: z.uuid({ error: "Selecione o equipamento" }),
  tipo: z.enum(TIPOS_LEITURA, { error: "Selecione o tipo de leitura" }),
  valor: z
    .number({ error: "Valor inválido" })
    .refine((v) => v > 0, { error: "O valor precisa ser maior que zero" })
    .refine(leituraValida, { error: "Valor acima do permitido" }),
  data: dataSchema,
});

export type LeituraInput = z.infer<typeof leituraSchema>;

/** Schema do formulário da leitura (client): valor como string pt-BR. */
export const leituraFormSchema = z.object({
  equipamentoId: z.uuid({ error: "Selecione o equipamento" }),
  tipo: z.enum(TIPOS_LEITURA, { error: "Selecione o tipo de leitura" }),
  valor: z
    .string()
    .trim()
    .refine(numeroPositivo, { error: "Informe um valor maior que zero" }),
  data: dataSchema,
});

export type LeituraFormInput = z.infer<typeof leituraFormSchema>;

/** Converte o formulário da leitura no input de servidor. */
export function leituraFormParaInput(dados: LeituraFormInput): LeituraInput {
  return {
    equipamentoId: dados.equipamentoId,
    tipo: dados.tipo,
    valor: paraNumero(dados.valor),
    data: dados.data,
  };
}
