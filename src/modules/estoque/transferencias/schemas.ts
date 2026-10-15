import { z } from "zod";

import { CASAS_TAXA } from "@/lib/casas-decimais";
import { idSchemaCom } from "@/lib/id";
import { decodificarLocal, SEM_LOCAL, type LocalDecodificado } from "@/modules/estoque/calculo";
import { paraNumero } from "@/modules/manutencao/almoxarifado/calculo";

/**
 * Transferência entre locais do Estoque (depósito, tanque de material ou pilha). O banco
 * gera a saída na origem (custo PEPS) e a entrada no destino a (custo + custo adicional) /
 * quantidade. As que vêm de frete são do Frete e não passam por aqui.
 */

const TETO_NUMERIC_14_4 = 9999999999.9999;
const CASAS_DINHEIRO = 2;

const dataSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Informe a data" });

function localForm(mensagem: string) {
  return z
    .string()
    .trim()
    .refine((valor) => decodificarLocal(valor) !== null, { error: mensagem });
}

export const transferenciaFormSchema = z
  .object({
    origem: localForm("Escolha de onde sai"),
    destino: localForm("Escolha para onde vai"),
    insumoId: z
      .string()
      .trim()
      .refine((valor) => z.guid().safeParse(valor).success, { error: "Escolha o material" }),
    quantidade: z
      .string()
      .trim()
      .refine(
        (valor) => {
          const numero = paraNumero(valor, CASAS_TAXA);
          return numero !== null && numero > 0 && numero <= TETO_NUMERIC_14_4;
        },
        { error: `Informe a quantidade maior que zero, com até ${CASAS_TAXA} casas` },
      ),
    dataSaida: dataSchema,
    dataChegada: dataSchema,
    custoAdicional: z
      .string()
      .trim()
      .refine(
        (valor) => {
          if (valor === "") return true;
          const numero = paraNumero(valor, CASAS_DINHEIRO);
          return numero !== null && numero >= 0 && numero <= TETO_NUMERIC_14_4;
        },
        { error: "Custo adicional inválido" },
      ),
    observacoes: z.string().trim().max(500, { error: "Máximo de 500 caracteres" }),
  })
  .superRefine((dados, ctx) => {
    if (dados.origem !== "" && dados.origem === dados.destino) {
      ctx.addIssue({ code: "custom", path: ["destino"], message: "O destino tem de ser outro local" });
    }
    if (dados.dataSaida && dados.dataChegada && dados.dataChegada < dados.dataSaida) {
      ctx.addIssue({ code: "custom", path: ["dataChegada"], message: "A chegada não pode ser antes da saída" });
    }
  });

export type TransferenciaFormInput = z.infer<typeof transferenciaFormSchema>;

function umLocal(local: LocalDecodificado): boolean {
  return [local.depositoId, local.tanqueId, local.pilhaId].filter((id) => id !== null).length === 1;
}

const localSchema = z
  .object({
    depositoId: idSchemaCom("Local inválido").nullable(),
    tanqueId: idSchemaCom("Local inválido").nullable(),
    pilhaId: idSchemaCom("Local inválido").nullable(),
  })
  .refine(umLocal, { error: "Escolha um local" });

export const transferenciaSchema = z
  .object({
    origem: localSchema,
    destino: localSchema,
    insumoId: idSchemaCom("Escolha o material"),
    quantidade: z.number().refine((valor) => Number.isFinite(valor) && valor > 0 && valor <= TETO_NUMERIC_14_4, {
      error: "A quantidade tem de ser maior que zero",
    }),
    dataSaida: dataSchema,
    dataChegada: dataSchema,
    custoAdicional: z.number().refine((valor) => Number.isFinite(valor) && valor >= 0 && valor <= TETO_NUMERIC_14_4, {
      error: "Custo adicional inválido",
    }),
    observacoes: z.string().trim().max(500).nullable(),
  })
  .superRefine((dados, ctx) => {
    const o = dados.origem.depositoId ?? dados.origem.tanqueId ?? dados.origem.pilhaId;
    const d = dados.destino.depositoId ?? dados.destino.tanqueId ?? dados.destino.pilhaId;
    if (o !== null && o === d) ctx.addIssue({ code: "custom", path: ["destino"], message: "O destino tem de ser outro local" });
    if (dados.dataChegada < dados.dataSaida) {
      ctx.addIssue({ code: "custom", path: ["dataChegada"], message: "A chegada não pode ser antes da saída" });
    }
  });

export type TransferenciaInput = z.infer<typeof transferenciaSchema>;

export function transferenciaDoForm(dados: TransferenciaFormInput): TransferenciaInput {
  const observacoes = dados.observacoes.trim();
  return {
    origem: decodificarLocal(dados.origem) ?? SEM_LOCAL,
    destino: decodificarLocal(dados.destino) ?? SEM_LOCAL,
    insumoId: dados.insumoId,
    quantidade: paraNumero(dados.quantidade, CASAS_TAXA) ?? 0,
    dataSaida: dados.dataSaida,
    dataChegada: dados.dataChegada,
    custoAdicional: dados.custoAdicional.trim() === "" ? 0 : (paraNumero(dados.custoAdicional, CASAS_DINHEIRO) ?? 0),
    observacoes: observacoes === "" ? null : observacoes,
  };
}
