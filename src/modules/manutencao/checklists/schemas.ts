import { z } from "zod";

import {
  numeroOpcionalNaoNegativo,
  paraNumero,
} from "@/modules/manutencao/checklists/numero";

/** Respostas aceitas por item do checklist. */
export const RESPOSTAS_CHECKLIST = ["ok", "nok", "na"] as const;

export type RespostaChecklist = (typeof RESPOSTAS_CHECKLIST)[number];

/** Rótulos em pt-BR de cada resposta, para os botões e o detalhe. */
export const ROTULO_RESPOSTA: Record<RespostaChecklist, string> = {
  ok: "OK",
  nok: "Não OK",
  na: "N/A",
};

/** Horímetro/km NUMERIC(12,2): finito, não negativo, dentro do limite do banco. */
const LEITURA_MAX = 9999999999.99;

/** Leitura numérica não negativa e dentro do limite do banco. */
function leituraValida(valor: number): boolean {
  return Number.isFinite(valor) && valor >= 0 && valor <= LEITURA_MAX;
}

/* ------------------------------------------------------------------ */
/* Modelo de checklist                                                */
/* ------------------------------------------------------------------ */

/** Schema do formulário do modelo: nome, descrição e lista de perguntas. */
export const checklistSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, { error: "O nome precisa ter pelo menos 2 caracteres" })
    .max(120, { error: "O nome pode ter no máximo 120 caracteres" }),
  descricao: z
    .string()
    .trim()
    .max(500, { error: "Máximo de 500 caracteres" })
    .optional(),
  ativo: z.boolean().default(true),
  perguntas: z
    .array(
      z.object({
        pergunta: z
          .string()
          .trim()
          .min(1, { error: "Escreva a pergunta" })
          .max(300, { error: "Máximo de 300 caracteres" }),
        ordem: z.number().int().min(0),
      }),
    )
    .min(1, { error: "Adicione ao menos uma pergunta" }),
});

export type ChecklistInput = z.infer<typeof checklistSchema>;

/* ------------------------------------------------------------------ */
/* Execução do checklist                                              */
/* ------------------------------------------------------------------ */

/** Schema de servidor da execução (tipos já coeridos), validado na action. */
export const execucaoSchema = z.object({
  checklistId: z.uuid({ error: "Selecione o checklist" }),
  equipamentoId: z.uuid({ error: "Selecione o equipamento" }),
  operadorId: z.uuid({ error: "Operador inválido" }).optional(),
  horimetro: z
    .number({ error: "Horímetro inválido" })
    .refine(leituraValida, { error: "Horímetro inválido" })
    .optional(),
  km: z
    .number({ error: "Quilometragem inválida" })
    .refine(leituraValida, { error: "Quilometragem inválida" })
    .optional(),
  observacao: z
    .string()
    .trim()
    .max(500, { error: "Máximo de 500 caracteres" })
    .optional(),
  abrirOs: z.boolean(),
  respostas: z
    .array(
      z.object({
        perguntaId: z.uuid({ error: "Pergunta inválida" }),
        resposta: z.enum(RESPOSTAS_CHECKLIST, {
          error: "Responda a pergunta",
        }),
        observacao: z
          .string()
          .trim()
          .max(500, { error: "Máximo de 500 caracteres" })
          .optional(),
      }),
    )
    .min(1, { error: "Responda ao menos uma pergunta" }),
});

export type ExecucaoInput = z.infer<typeof execucaoSchema>;

/** Schema do formulário (client): horímetro/km como string pt-BR. */
export const execucaoFormSchema = z.object({
  checklistId: z.uuid({ error: "Selecione o checklist" }),
  equipamentoId: z.uuid({ error: "Selecione o equipamento" }),
  operadorId: z.string().trim(),
  horimetro: z
    .string()
    .trim()
    .refine(numeroOpcionalNaoNegativo, { error: "Horímetro inválido" }),
  km: z
    .string()
    .trim()
    .refine(numeroOpcionalNaoNegativo, { error: "Quilometragem inválida" }),
  observacao: z
    .string()
    .trim()
    .max(500, { error: "Máximo de 500 caracteres" }),
  abrirOs: z.boolean(),
  respostas: z
    .array(
      z.object({
        perguntaId: z.uuid(),
        pergunta: z.string(),
        resposta: z.enum(RESPOSTAS_CHECKLIST, {
          error: "Responda todas as perguntas",
        }),
        observacao: z.string().trim().max(500, {
          error: "Máximo de 500 caracteres",
        }),
      }),
    )
    .min(1, { error: "Responda ao menos uma pergunta" }),
});

export type ExecucaoFormInput = z.infer<typeof execucaoFormSchema>;

/** Converte o formulário (strings) no input de servidor (números coeridos). */
export function execucaoFormParaInput(dados: ExecucaoFormInput): ExecucaoInput {
  return {
    checklistId: dados.checklistId,
    equipamentoId: dados.equipamentoId,
    operadorId: dados.operadorId === "" ? undefined : dados.operadorId,
    horimetro:
      dados.horimetro.trim() === "" ? undefined : paraNumero(dados.horimetro),
    km: dados.km.trim() === "" ? undefined : paraNumero(dados.km),
    observacao: dados.observacao.trim() === "" ? undefined : dados.observacao,
    abrirOs: dados.abrirOs,
    respostas: dados.respostas.map((item) => ({
      perguntaId: item.perguntaId,
      resposta: item.resposta,
      observacao: item.observacao.trim() === "" ? undefined : item.observacao,
    })),
  };
}
