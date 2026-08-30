import { z } from "zod";

import { CASAS_DINHEIRO } from "@/lib/casas-decimais";
import { idSchemaCom } from "@/lib/id";
import { casasDecimais, paraNumero } from "@/modules/rh/percentual";
import {
  AVISOS_POR_TIPO,
  AVISOS_RESCISAO,
  TIPOS_RESCISAO,
  type AvisoRescisao,
  type TipoRescisao,
} from "@/modules/rh/rescisoes/formato";

/** Teto de NUMERIC(14,2). Acima disso o banco recusa com erro de overflow. */
const DINHEIRO_MAX = 999999999999.99;

/**
 * Períodos aquisitivos de férias vencidas. Inteiro, e com um teto baixo de
 * propósito: quem trabalha desde 2010 tem 16 períodos aquisitivos completos, e
 * `rh_ferias` está vazia, então um campo sem teto aceitaria "16" digitado por
 * engano e pagaria dezesseis salários. Cinco já é muito acima do que a lei
 * deixa acumular, e o erro de digitação para com uma mensagem em vez de virar
 * um pagamento.
 */
const PERIODOS_MAX = 5;

const dataSchema = z
  .string()
  .trim()
  .refine((valor) => /^\d{4}-\d{2}-\d{2}$/.test(valor), {
    error: "Informe a data",
  });

const dataOpcionalSchema = z
  .union([z.string(), z.null()])
  .transform((valor) => {
    if (valor === null) return null;
    const texto = valor.trim();
    return texto === "" ? null : texto;
  })
  .refine((valor) => valor === null || /^\d{4}-\d{2}-\d{2}$/.test(valor), {
    error: "Data inválida",
  });

const textoOpcionalSchema = z
  .union([z.string(), z.null()])
  .transform((valor) => {
    if (valor === null) return null;
    const texto = valor.trim();
    return texto === "" ? null : texto;
  });

/** Dinheiro NUMERIC(14,2). Campo vazio vale zero. */
const dinheiroComZeroSchema = z
  .union([z.string(), z.number(), z.null()])
  .transform((valor, ctx) => {
    if (valor === null) return 0;
    if (typeof valor === "number") return valor;
    const texto = valor.trim();
    if (texto === "") return 0;
    const numero = paraNumero(texto);
    if (!Number.isFinite(numero)) {
      ctx.addIssue({ code: "custom", message: "Valor inválido" });
      return z.NEVER;
    }
    return numero;
  })
  .refine((valor) => valor >= 0, { error: "O valor não pode ser negativo" })
  .refine((valor) => valor <= DINHEIRO_MAX, {
    error: "Valor acima do permitido",
  })
  .refine((valor) => casasDecimais(valor) <= CASAS_DINHEIRO, {
    error: `O valor aceita no máximo ${CASAS_DINHEIRO} casas decimais`,
  });

/**
 * Base da rescisão. Vazio é `null`, e null NÃO é zero: significa "usa o salário
 * do cadastro". Zero seria "esta pessoa não recebe nada", que a RPC recusa.
 */
const remuneracaoOpcionalSchema = z
  .union([z.string(), z.number(), z.null()])
  .transform((valor, ctx) => {
    if (valor === null) return null;
    if (typeof valor === "number") return valor;
    const texto = valor.trim();
    if (texto === "") return null;
    const numero = paraNumero(texto);
    if (!Number.isFinite(numero)) {
      ctx.addIssue({ code: "custom", message: "Valor inválido" });
      return z.NEVER;
    }
    return numero;
  })
  .refine((valor) => valor === null || valor > 0, {
    error: "A base da rescisão precisa ser maior que zero",
  })
  .refine((valor) => valor === null || valor <= DINHEIRO_MAX, {
    error: "Valor acima do permitido",
  })
  .refine((valor) => valor === null || casasDecimais(valor) <= CASAS_DINHEIRO, {
    error: `O valor aceita no máximo ${CASAS_DINHEIRO} casas decimais`,
  });

const periodosSchema = z
  .union([z.string(), z.number(), z.null()])
  .transform((valor, ctx) => {
    if (valor === null) return 0;
    if (typeof valor === "number") return valor;
    const texto = valor.trim();
    if (texto === "") return 0;
    const numero = Number(texto);
    if (!Number.isInteger(numero)) {
      ctx.addIssue({
        code: "custom",
        message: "Informe um número inteiro de períodos",
      });
      return z.NEVER;
    }
    return numero;
  })
  .refine((valor) => Number.isInteger(valor) && valor >= 0, {
    error: "Informe um número inteiro de períodos",
  })
  .refine((valor) => valor <= PERIODOS_MAX, {
    error: `No máximo ${PERIODOS_MAX} períodos. Acima disso, confira a data de admissão e o histórico de férias.`,
  });

/**
 * Input de servidor da geração. O `superRefine` repete a matriz de avisos que
 * a `fn_gerar_rescisao` também aplica — de propósito: o banco continua sendo
 * quem recusa, mas a mensagem daqui chega ao formulário no campo certo, em vez
 * de virar um toast genérico depois do submit.
 */
export const gerarRescisaoSchema = z
  .object({
    colaboradorId: idSchemaCom("Selecione o colaborador"),
    tipo: z.enum(TIPOS_RESCISAO, { error: "Selecione o tipo de rescisão" }),
    aviso: z.enum(AVISOS_RESCISAO, { error: "Selecione o aviso prévio" }),
    dataDesligamento: dataSchema,
    dataAviso: dataOpcionalSchema,
    saldoFgts: dinheiroComZeroSchema,
    feriasVencidasPeriodos: periodosSchema,
    remuneracaoBase: remuneracaoOpcionalSchema,
    dataVencimento: dataOpcionalSchema,
    observacao: textoOpcionalSchema,
  })
  .superRefine((dados, ctx) => {
    const permitidos: readonly AvisoRescisao[] =
      AVISOS_POR_TIPO[dados.tipo as TipoRescisao];
    if (!permitidos.includes(dados.aviso)) {
      ctx.addIssue({
        code: "custom",
        path: ["aviso"],
        message: "Este aviso prévio não existe neste tipo de rescisão",
      });
    }
    if (dados.dataAviso && dados.dataAviso > dados.dataDesligamento) {
      ctx.addIssue({
        code: "custom",
        path: ["dataAviso"],
        message: "O aviso não pode ser depois do desligamento",
      });
    }
  });

export type GerarRescisaoInput = z.infer<typeof gerarRescisaoSchema>;

/**
 * Schema do FORMULÁRIO. Tudo string simples, sem transform: no React Hook Form
 * o tipo de entrada e o de saída do schema precisam ser o mesmo, senão o
 * `defaultValues` deixa de casar com o resolver e o formulário não submete.
 */
export const gerarRescisaoFormSchema = z.object({
  colaboradorId: z.string().min(1, { error: "Selecione o colaborador" }),
  tipo: z.enum(TIPOS_RESCISAO, { error: "Selecione o tipo de rescisão" }),
  aviso: z.enum(AVISOS_RESCISAO, { error: "Selecione o aviso prévio" }),
  dataDesligamento: z.string().min(1, { error: "Informe a data" }),
  dataAviso: z.string(),
  saldoFgts: z.string(),
  feriasVencidasPeriodos: z.string(),
  remuneracaoBase: z.string(),
  dataVencimento: z.string(),
  observacao: z.string(),
});

export type GerarRescisaoFormInput = z.infer<typeof gerarRescisaoFormSchema>;

/** Converte o formulário no input de servidor. */
export function gerarRescisaoFormParaInput(
  dados: GerarRescisaoFormInput,
): unknown {
  return {
    colaboradorId: dados.colaboradorId,
    tipo: dados.tipo,
    aviso: dados.aviso,
    dataDesligamento: dados.dataDesligamento,
    dataAviso: dados.dataAviso,
    saldoFgts: dados.saldoFgts,
    feriasVencidasPeriodos: dados.feriasVencidasPeriodos,
    remuneracaoBase: dados.remuneracaoBase,
    dataVencimento: dados.dataVencimento,
    observacao: dados.observacao,
  };
}

export const editarItemRescisaoSchema = z.object({
  itemId: idSchemaCom("Verba inválida"),
  valor: dinheiroComZeroSchema,
});

export type EditarItemRescisaoInput = z.infer<typeof editarItemRescisaoSchema>;

export const adicionarItemRescisaoSchema = z.object({
  rescisaoId: idSchemaCom("Rescisão inválida"),
  descricao: z
    .string()
    .trim()
    .min(2, { error: "Descreva a verba" })
    .max(120, { error: "Descrição muito longa" }),
  natureza: z.enum(["provento", "desconto"], {
    error: "A verba é provento ou desconto",
  }),
  valor: dinheiroComZeroSchema,
});

export type AdicionarItemRescisaoInput = z.infer<
  typeof adicionarItemRescisaoSchema
>;

/** Motivo obrigatório (rejeição, desaprovação, exclusão). */
export const motivoRescisaoSchema = z.object({
  rescisaoId: idSchemaCom("Rescisão inválida"),
  motivo: z
    .string()
    .trim()
    .min(3, { error: "Informe o motivo" })
    .max(500, { error: "Motivo muito longo" }),
});

export type MotivoRescisaoInput = z.infer<typeof motivoRescisaoSchema>;
