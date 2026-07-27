import { z } from "zod";

/** Data, yyyy-MM-dd. */
const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Tipos de ocorrência. */
export const TIPOS_OCORRENCIA = [
  "advertencia",
  "suspensao",
  "atestado",
  "acidente",
  "elogio",
  "outro",
] as const;
export type TipoOcorrencia = (typeof TIPOS_OCORRENCIA)[number];

/** Rótulos pt-BR dos tipos, para a UI. */
export const ROTULO_TIPO_OCORRENCIA: Record<TipoOcorrencia, string> = {
  advertencia: "Advertência",
  suspensao: "Suspensão",
  atestado: "Atestado",
  acidente: "Acidente",
  elogio: "Elogio",
  outro: "Outro",
};

/**
 * Schema de servidor da ocorrência, validado na action antes de gravar.
 * A descrição é obrigatória. `dataFim` é o fim do período do atestado
 * (opcional; ausente = atestado de um único dia). Para os demais tipos,
 * `dataFim` fica sempre nula na gravação (ver `paraRegistro` em actions.ts).
 */
export const ocorrenciaSchema = z
  .object({
    colaboradorId: z.uuid({ error: "Selecione o colaborador" }),
    data: z.string().trim().regex(DATA_REGEX, { error: "Data inválida" }),
    dataFim: z
      .string()
      .trim()
      .regex(DATA_REGEX, { error: "Data de fim inválida" })
      .optional(),
    tipo: z.enum(TIPOS_OCORRENCIA, { error: "Tipo inválido" }),
    descricao: z
      .string()
      .trim()
      .min(1, { error: "Informe a descrição" })
      .max(1000, { error: "Máximo de 1000 caracteres" }),
    observacao: z
      .string()
      .trim()
      .max(500, { error: "Máximo de 500 caracteres" })
      .optional(),
  })
  .refine((dados) => !dados.dataFim || dados.dataFim >= dados.data, {
    error: "Fim do atestado não pode ser antes do início",
    path: ["dataFim"],
  });

export type OcorrenciaInput = z.infer<typeof ocorrenciaSchema>;

/** Schema do formulário (client). Observação e fim como string sempre presentes. */
export const ocorrenciaFormSchema = z
  .object({
    colaboradorId: z.uuid({ error: "Selecione o colaborador" }),
    data: z.string().trim().regex(DATA_REGEX, { error: "Informe a data" }),
    dataFim: z.string().trim(),
    tipo: z.enum(TIPOS_OCORRENCIA, { error: "Selecione o tipo" }),
    descricao: z
      .string()
      .trim()
      .min(1, { error: "Informe a descrição" })
      .max(1000, { error: "Máximo de 1000 caracteres" }),
    observacao: z
      .string()
      .trim()
      .max(500, { error: "Máximo de 500 caracteres" }),
  })
  .refine((dados) => dados.dataFim === "" || dados.dataFim >= dados.data, {
    error: "Fim do atestado não pode ser antes do início",
    path: ["dataFim"],
  });

export type OcorrenciaFormInput = z.infer<typeof ocorrenciaFormSchema>;

/**
 * Converte o formulário no input de servidor. O fim só é enviado para
 * atestados; nos demais tipos vai sempre undefined (a action grava null).
 */
export function ocorrenciaFormParaInput(
  dados: OcorrenciaFormInput,
): OcorrenciaInput {
  return {
    colaboradorId: dados.colaboradorId,
    data: dados.data,
    dataFim:
      dados.tipo === "atestado" && dados.dataFim !== ""
        ? dados.dataFim
        : undefined,
    tipo: dados.tipo,
    descricao: dados.descricao,
    observacao: dados.observacao === "" ? undefined : dados.observacao,
  };
}
