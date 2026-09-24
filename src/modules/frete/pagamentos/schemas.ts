import { z } from "zod";

import { CASAS_TAXA, CASAS_VALOR_OPERACIONAL } from "@/lib/casas-decimais";
import { numeroSchema } from "@/modules/combustivel/entradas/schemas";
import { textoParaNumero } from "@/modules/manutencao/servicos/numero";
import { METODOS_PAGAMENTO, type DadosPagamento } from "@/modules/frete/pagamentos/regras";

/**
 * Schemas do pagamento de frete. Mensagens da origem (schemas/frete/pagamentoFrete.schema.ts).
 *
 * - `pagamentoFormSchema`: o que o react-hook-form guarda (número é texto cru).
 * - `pagamentoSchema`: o que a Server Action recebe (número de verdade).
 *
 * Diferença necessária: na origem o valor era opcional e gravava 0 sem ele; no ERP o
 * banco exige valor > 0, então fora do "Dividir entre meses" o valor é obrigatório.
 */

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const MES = /^\d{4}-\d{2}$/;
const TETO = 9_999_999_999.9999;

function numeroPositivo(texto: string, casas: number): boolean {
  const numero = textoParaNumero(texto, casas);
  return numero !== null && numero > 0 && numero <= TETO;
}

export const pagamentoFormSchema = z
  .object({
    data: z.string().trim().regex(DIA, { error: "Data do pagamento obrigatória" }),
    transportadoraId: z.string().trim().min(1, { error: "Selecione a transportadora" }),
    mesReferencia: z.union([z.literal(""), z.string().regex(MES, { error: "Mês inválido" })]),
    valor: z.string(),
    metodo: z.enum(METODOS_PAGAMENTO, { error: "Selecione o método" }),
    quantidadeCombustivel: z.string(),
    responsavel: z.string().trim().min(1, { error: "Responsável obrigatório" }),
    notaFiscal: z.string().trim().max(60, { error: "Máximo de 60 caracteres" }),
    pagoPor: z.string().trim().min(1, { error: "Selecione quem pagou" }),
    observacoes: z.string().trim().max(500, { error: "Máximo 500 caracteres" }),
    /** Só na criação. Com ele, mês e valor vêm das parcelas. */
    dividir: z.boolean(),
  })
  .superRefine((form, ctx) => {
    if (!form.dividir && !numeroPositivo(form.valor, CASAS_VALOR_OPERACIONAL)) {
      ctx.addIssue({
        code: "custom",
        path: ["valor"],
        message: `Valor deve ser > 0, com até ${CASAS_VALOR_OPERACIONAL} casas`,
      });
    }
    if (form.metodo === "combustivel" && !numeroPositivo(form.quantidadeCombustivel, CASAS_TAXA)) {
      ctx.addIssue({
        code: "custom",
        path: ["quantidadeCombustivel"],
        message: "Quantidade obrigatória para pagamento em combustível",
      });
    }
  });
export type PagamentoFormInput = z.infer<typeof pagamentoFormSchema>;

export const pagamentoSchema = z
  .strictObject({
    data: z.string().regex(DIA, { error: "Data do pagamento obrigatória" }),
    transportadoraId: z.guid({ error: "Selecione a transportadora" }),
    mesReferencia: z.union([z.literal(""), z.string().regex(MES, { error: "Mês inválido" })]),
    valor: numeroSchema(CASAS_VALOR_OPERACIONAL, "Valor", "positivo"),
    metodo: z.enum(METODOS_PAGAMENTO, { error: "Selecione o método" }),
    quantidadeCombustivel: numeroSchema(CASAS_TAXA, "Quantidade", "naoNegativo"),
    responsavel: z.string().trim().min(1, { error: "Responsável obrigatório" }),
    notaFiscal: z.string().trim().max(60, { error: "Máximo de 60 caracteres" }).nullable(),
    pagoPor: z.string().trim().min(1, { error: "Selecione quem pagou" }),
    observacoes: z.string().trim().max(500, { error: "Máximo 500 caracteres" }).nullable(),
  })
  .refine((d) => d.metodo !== "combustivel" || d.quantidadeCombustivel > 0, {
    error: "Quantidade obrigatória para pagamento em combustível",
    path: ["quantidadeCombustivel"],
  });

function textoOuNulo(valor: string): string | null {
  const limpo = valor.trim();
  return limpo === "" ? null : limpo;
}

/** Formulário validado -> o que a action recebe (fora do "Dividir"). */
export function pagamentoDoForm(form: PagamentoFormInput): DadosPagamento {
  return {
    data: form.data,
    transportadoraId: form.transportadoraId,
    mesReferencia: form.mesReferencia,
    valor: textoParaNumero(form.valor, CASAS_VALOR_OPERACIONAL) ?? 0,
    metodo: form.metodo,
    quantidadeCombustivel:
      form.metodo === "combustivel" ? (textoParaNumero(form.quantidadeCombustivel, CASAS_TAXA) ?? 0) : 0,
    responsavel: form.responsavel.trim(),
    notaFiscal: textoOuNulo(form.notaFiscal),
    pagoPor: form.pagoPor.trim(),
    observacoes: textoOuNulo(form.observacoes),
  };
}
