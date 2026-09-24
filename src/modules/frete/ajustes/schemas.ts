import { z } from "zod";

import { CASAS_VALOR_OPERACIONAL } from "@/lib/casas-decimais";
import { dataHoraLocalParaIso } from "@/modules/combustivel/_shared/rotulos";
import {
  dataHoraFormSchema,
  dataHoraIsoSchema,
  numeroSchema,
  numeroTexto,
} from "@/modules/combustivel/entradas/schemas";
import { textoParaNumero } from "@/modules/manutencao/servicos/numero";

/**
 * Ajuste manual de saldo da transportadora, com os campos da origem
 * (AjusteManualTransportadoraForm do Gestão Obras): sinal, valor maior que zero,
 * data e hora, mês de referência, obra opcional e descrição obrigatória.
 *
 * Diferente da origem por decisão do Tiago (24/09): o ajuste nasce pendente de
 * aprovação e só entra no saldo aprovado. Quem grava e decide é a RPC
 * `fn_frete_ajuste_salvar`; este schema só evita a ida ao banco à toa.
 *
 * Valor com 4 casas (CASAS_VALOR_OPERACIONAL): a conta corrente é NUMERIC(14,4)
 * e o ajuste existe justamente para acertar resíduo de quarta casa.
 */

export const SINAIS_AJUSTE = ["credito", "debito"] as const;
export type SinalAjuste = (typeof SINAIS_AJUSTE)[number];

const MES_CAMPO = /^\d{4}-(0[1-9]|1[0-2])$/;
const MES_BANCO = /^\d{4}-(0[1-9]|1[0-2])-01$/;

export const ajusteFormSchema = z.object({
  transportadoraId: z.string().trim().min(1, { error: "Selecione a transportadora" }),
  sinal: z.enum(SINAIS_AJUSTE, { error: "Escolha crédito ou débito" }),
  valor: numeroTexto(
    CASAS_VALOR_OPERACIONAL,
    `Informe o valor maior que zero, com até ${CASAS_VALOR_OPERACIONAL} casas`,
    "positivo",
  ),
  data: dataHoraFormSchema,
  /** "AAAA-MM" do campo `month`. Vazio: o banco usa o mês da data. */
  mesReferencia: z
    .string()
    .trim()
    .refine((valor) => valor === "" || MES_CAMPO.test(valor), { error: "Mês de referência inválido" }),
  /** Obra (raiz do centro de custo). Vazio = sem obra. */
  centroCustoId: z.string().trim(),
  descricao: z
    .string()
    .trim()
    .min(1, { error: "Informe a descrição" })
    .max(2000, { error: "Máximo de 2000 caracteres" }),
});
export type AjusteFormInput = z.infer<typeof ajusteFormSchema>;

export const ajusteSchema = z.strictObject({
  transportadoraId: z.guid({ error: "Selecione a transportadora" }),
  sinal: z.enum(SINAIS_AJUSTE, { error: "Escolha crédito ou débito" }),
  valor: numeroSchema(CASAS_VALOR_OPERACIONAL, "Valor", "positivo"),
  data: dataHoraIsoSchema,
  mesReferencia: z
    .string()
    .refine((valor) => MES_BANCO.test(valor), { error: "Mês de referência inválido" })
    .nullable(),
  centroCustoId: z.guid({ error: "Obra inválida" }).nullable(),
  descricao: z
    .string()
    .trim()
    .min(1, { error: "Informe a descrição" })
    .max(2000, { error: "Máximo de 2000 caracteres" }),
});
export type AjusteInput = z.infer<typeof ajusteSchema>;

/** Formulário validado para o contrato da action. */
export function ajusteDoForm(form: AjusteFormInput): AjusteInput {
  return {
    transportadoraId: form.transportadoraId,
    sinal: form.sinal,
    valor: textoParaNumero(form.valor, CASAS_VALOR_OPERACIONAL) ?? 0,
    data: dataHoraLocalParaIso(form.data) ?? "",
    mesReferencia: form.mesReferencia.trim() === "" ? null : `${form.mesReferencia.trim()}-01`,
    centroCustoId: form.centroCustoId.trim() === "" ? null : form.centroCustoId.trim(),
    descricao: form.descricao.trim(),
  };
}

/** O `p_dados` de `fn_frete_ajuste_salvar`. */
export function payloadDoAjuste(dados: AjusteInput) {
  return {
    transportadora_id: dados.transportadoraId,
    sinal: dados.sinal,
    valor: dados.valor,
    data: dados.data,
    mes_referencia: dados.mesReferencia,
    centro_custo_id: dados.centroCustoId,
    descricao: dados.descricao,
  };
}

export const motivoSchema = z.string().trim().min(1, { error: "Informe o motivo" }).max(2000);
