import { z } from "zod";

/** Tipos válidos de documento de colaborador. */
export const TIPOS_DOCUMENTO = [
  "aso",
  "contrato",
  "rg",
  "cpf",
  "ctps",
  "cnh",
  "certificado",
  "outro",
] as const;

export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

/** Rótulos em pt-BR de cada tipo, para exibição e filtro. */
export const ROTULO_TIPO_DOCUMENTO: Record<TipoDocumento, string> = {
  aso: "ASO",
  contrato: "Contrato",
  rg: "RG",
  cpf: "CPF",
  ctps: "CTPS",
  cnh: "CNH",
  certificado: "Certificado",
  outro: "Outro",
};

/** Data no formato yyyy-MM-dd (input date). */
const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Schema de servidor do documento (tipos já coeridos), validado na action
 * antes de gravar. Emissão e vencimento são opcionais.
 */
export const documentoSchema = z.object({
  colaboradorId: z.uuid({ error: "Selecione o colaborador" }),
  tipo: z.enum(TIPOS_DOCUMENTO, { error: "Escolha um tipo válido" }),
  descricao: z
    .string()
    .trim()
    .min(2, { error: "A descrição precisa ter pelo menos 2 caracteres" })
    .max(200, { error: "A descrição pode ter no máximo 200 caracteres" }),
  dataEmissao: z
    .string()
    .trim()
    .regex(DATA_REGEX, { error: "Data de emissão inválida" })
    .optional(),
  dataVencimento: z
    .string()
    .trim()
    .regex(DATA_REGEX, { error: "Data de vencimento inválida" })
    .optional(),
  observacao: z
    .string()
    .trim()
    .max(500, { error: "Máximo de 500 caracteres" })
    .optional(),
});

export type DocumentoInput = z.infer<typeof documentoSchema>;

/**
 * Schema do formulário (client). As datas opcionais vêm como string ("" quando
 * em branco) para casar com os inputs do react-hook-form; a coerção real é no
 * submit.
 */
export const documentoFormSchema = z.object({
  colaboradorId: z.uuid({ error: "Selecione o colaborador" }),
  tipo: z.enum(TIPOS_DOCUMENTO, { error: "Escolha um tipo válido" }),
  descricao: z
    .string()
    .trim()
    .min(2, { error: "A descrição precisa ter pelo menos 2 caracteres" })
    .max(200, { error: "A descrição pode ter no máximo 200 caracteres" }),
  dataEmissao: z.string().trim(),
  dataVencimento: z.string().trim(),
  observacao: z.string().trim().max(500, { error: "Máximo de 500 caracteres" }),
});

export type DocumentoFormInput = z.infer<typeof documentoFormSchema>;

/** Converte o formulário (strings) no input de servidor. */
export function documentoFormParaInput(
  dados: DocumentoFormInput,
): DocumentoInput {
  return {
    colaboradorId: dados.colaboradorId,
    tipo: dados.tipo,
    descricao: dados.descricao,
    dataEmissao: dados.dataEmissao === "" ? undefined : dados.dataEmissao,
    dataVencimento:
      dados.dataVencimento === "" ? undefined : dados.dataVencimento,
    observacao: dados.observacao === "" ? undefined : dados.observacao,
  };
}
