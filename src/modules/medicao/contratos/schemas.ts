import { z } from "zod";

import { CASAS_DINHEIRO } from "@/lib/casas-decimais";
import { REGRAS_ARREDONDAMENTO, STATUS_CONTRATO, TIPOS_ADITIVO, TIPOS_CONTRATANTE } from "@/modules/medicao/_shared/rotulos";

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");
const dataOpcional = z.union([data, z.literal("")]);

const valorDinheiro = z
  .number({ error: "Informe o valor" })
  .nonnegative("O valor não pode ser negativo")
  .refine((v) => Number(v.toFixed(CASAS_DINHEIRO)) === v, `No máximo ${CASAS_DINHEIRO} casas`);

export const contratoSchema = z
  .object({
    codigo: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9-]{1,29}$/, "Código com 2 a 30 letras, números ou hífen"),
    nomeObra: z.string().trim().min(2, "Informe o nome da obra").max(200),
    local: z.string().trim().max(200),
    objeto: z.string().trim().min(1, "Informe o objeto"),
    numeroContrato: z.string().trim().min(1, "Informe o número do contrato"),
    contratanteNome: z.string().trim().min(1, "Informe o contratante"),
    contratanteTipo: z.enum(TIPOS_CONTRATANTE),
    contratanteDocumento: z.string().trim().max(20),
    valorInicial: valorDinheiro,
    dataAssinatura: data,
    dataOrdemServico: dataOpcional,
    prazoMeses: z.number().int().positive("Prazo em meses, maior que zero"),
    inicioPrazo: z.enum(["assinatura", "ordem_servico"]),
    diaInicioPeriodo: z.number().int().min(1).max(28, "O período começa entre o dia 1 e o dia 28"),
    tipoLocalizacao: z.enum(["rodovia", "texto"]),
    regraArredondamento: z.enum(REGRAS_ARREDONDAMENTO).nullable(),
    alertaPrazoDias: z.number().int().nonnegative(),
    alertaValorPct: z.number().min(0).max(100),
    status: z.enum(STATUS_CONTRATO),
    observacoes: z.string().trim(),
  })
  .refine((c) => c.inicioPrazo === "assinatura" || c.dataOrdemServico !== "", {
    message: "Informe a data da ordem de serviço",
    path: ["dataOrdemServico"],
  });

export type ContratoInput = z.infer<typeof contratoSchema>;

/** Payload da fn_mc_contrato_salvar. Dinheiro vai como texto, para não passar por float no banco. */
export function payloadDoContrato(c: ContratoInput): Record<string, string | number | null> {
  return {
    codigo: c.codigo.toUpperCase(),
    nome_obra: c.nomeObra,
    local: c.local || null,
    objeto: c.objeto,
    numero_contrato: c.numeroContrato,
    contratante_nome: c.contratanteNome,
    contratante_tipo: c.contratanteTipo,
    contratante_documento: c.contratanteDocumento || null,
    valor_inicial: c.valorInicial.toFixed(CASAS_DINHEIRO),
    data_assinatura: c.dataAssinatura,
    data_ordem_servico: c.dataOrdemServico || null,
    prazo_meses: c.prazoMeses,
    inicio_prazo: c.inicioPrazo,
    dia_inicio_periodo: c.diaInicioPeriodo,
    tipo_localizacao: c.tipoLocalizacao,
    regra_arredondamento: c.regraArredondamento,
    alerta_prazo_dias: c.alertaPrazoDias,
    alerta_valor_pct: c.alertaValorPct,
    status: c.status,
    observacoes: c.observacoes || null,
  };
}

export const aditivoSchema = z
  .object({
    dataAssinatura: data,
    dataVigencia: data,
    tipos: z.array(z.enum(TIPOS_ADITIVO)).min(1, "Marque o tipo do aditivo"),
    prazoAcrescidoMeses: z.number().int().positive().nullable(),
    motivo: z.string().trim().min(1, "Informe o motivo"),
  })
  .refine((a) => a.tipos.includes("prazo") === (a.prazoAcrescidoMeses !== null), {
    message: "Meses acrescidos só no aditivo de prazo, e nele são obrigatórios",
    path: ["prazoAcrescidoMeses"],
  });

export type AditivoInput = z.infer<typeof aditivoSchema>;

export function payloadDoAditivo(a: AditivoInput) {
  return {
    data_assinatura: a.dataAssinatura,
    data_vigencia: a.dataVigencia,
    tipos: a.tipos,
    prazo_acrescido_meses: a.prazoAcrescidoMeses,
    motivo: a.motivo,
  };
}

export const motivoSchema = z.string().trim().min(3, "Informe o motivo");
