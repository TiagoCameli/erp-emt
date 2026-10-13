import { z } from "zod";

import { CASAS_TAXA } from "@/lib/casas-decimais";
import { idSchemaCom } from "@/lib/id";
import { decodificarLocal } from "@/modules/estoque/calculo";
import { paraNumero } from "@/modules/manutencao/almoxarifado/calculo";

/**
 * Schemas do Estoque. Dois níveis, como no almoxarifado de peças:
 *
 * - `*FormSchema`: o que o react-hook-form guarda. Número é TEXTO cru ("1234,5678"),
 *   que é o que `InputQuantidade`/`InputPreco` escrevem. Sem `.default()`.
 * - `*Schema`: o que a Server Action recebe, com número de verdade. O servidor valida
 *   de novo, e o banco valida pela terceira vez (saldo, OC, centro de custo).
 *
 * Na entrada vinda de OC, insumo e valor unitário são da OC: o banco ignora o que a
 * tela mandar nesses dois campos, então o schema só os exige na entrada avulsa.
 */

/** Teto de NUMERIC(14,4): 10 dígitos inteiros. */
const TETO_NUMERIC_14_4 = 9999999999.9999;

const dataSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Informe a data" });

function textoLivre(maximo: number) {
  return z.string().trim().max(maximo, { error: `Máximo de ${maximo} caracteres` });
}

function idObrigatorio(mensagem: string) {
  return z
    .string()
    .trim()
    .refine((valor) => z.guid().safeParse(valor).success, { error: mensagem });
}

/** O campo "Local": depósito ou tanque de material, codificado por `codificarLocal`. */
const localFormSchema = z
  .string()
  .trim()
  .refine((valor) => decodificarLocal(valor) !== null, { error: "Escolha o depósito ou o tanque" });

/** Na action: um dos dois, nunca os dois nem nenhum. */
function umLocal(dados: { depositoId: string | null; tanqueId: string | null }, ctx: z.RefinementCtx) {
  if ((dados.depositoId === null) === (dados.tanqueId === null)) {
    ctx.addIssue({ code: "custom", path: ["depositoId"], message: "Escolha o depósito ou o tanque" });
  }
}

function idOpcional(mensagem: string) {
  return z
    .string()
    .trim()
    .refine((valor) => valor === "" || z.guid().safeParse(valor).success, { error: mensagem });
}

function quantidadeTexto() {
  return z
    .string()
    .trim()
    .refine(
      (valor) => {
        const numero = paraNumero(valor, CASAS_TAXA);
        return numero !== null && numero > 0 && numero <= TETO_NUMERIC_14_4;
      },
      { error: `Informe a quantidade maior que zero, com até ${CASAS_TAXA} casas` },
    );
}

/** O banco guarda 4 casas e arredondaria calado: mais que isso é recusado aqui. */
function temAteCasas(valor: number, casas: number): boolean {
  const escala = 10 ** casas;
  return Math.abs(Math.round(valor * escala) - valor * escala) < 1e-6;
}

function quantidadeNumero() {
  return z
    .number({ error: "Quantidade inválida" })
    .refine((valor) => Number.isFinite(valor) && valor > 0 && valor <= TETO_NUMERIC_14_4, {
      error: "A quantidade tem de ser maior que zero",
    })
    .refine((valor) => temAteCasas(valor, CASAS_TAXA), {
      error: `A quantidade aceita até ${CASAS_TAXA} casas decimais`,
    });
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

export const ORIGENS_ENTRADA = ["avulsa", "oc"] as const;
export type OrigemEntrada = (typeof ORIGENS_ENTRADA)[number];

export const entradaFormSchema = z
  .object({
    origem: z.enum(ORIGENS_ENTRADA),
    ocItemId: idOpcional("Item da OC inválido"),
    local: localFormSchema,
    insumoId: idOpcional("Insumo inválido"),
    quantidade: quantidadeTexto(),
    valorUnitario: z.string().trim(),
    data: dataSchema,
    notaFiscal: textoLivre(60),
    observacoes: textoLivre(500),
  })
  .superRefine((dados, ctx) => {
    if (dados.origem === "oc") {
      if (dados.ocItemId === "") ctx.addIssue({ code: "custom", path: ["ocItemId"], message: "Escolha o item da OC" });
      return;
    }
    if (dados.insumoId === "") ctx.addIssue({ code: "custom", path: ["insumoId"], message: "Escolha o insumo" });
    const valor = paraNumero(dados.valorUnitario, CASAS_TAXA);
    if (valor === null || valor < 0 || valor > TETO_NUMERIC_14_4) {
      ctx.addIssue({
        code: "custom",
        path: ["valorUnitario"],
        message: `Informe o valor unitário, com até ${CASAS_TAXA} casas`,
      });
    }
  });

export type EntradaFormInput = z.infer<typeof entradaFormSchema>;

export const entradaSchema = z
  .object({
    ocItemId: idSchemaCom("Item da OC inválido").nullable(),
    depositoId: idSchemaCom("Escolha o depósito").nullable(),
    tanqueId: idSchemaCom("Escolha o tanque").nullable(),
    insumoId: idSchemaCom("Insumo inválido").nullable(),
    quantidade: quantidadeNumero(),
    valorUnitario: z.number().nullable(),
    data: dataSchema,
    notaFiscal: z.string().trim().max(60).nullable(),
    observacoes: z.string().trim().max(500).nullable(),
  })
  .superRefine((dados, ctx) => {
    umLocal(dados, ctx);
    if (dados.ocItemId !== null) return;
    if (dados.insumoId === null) ctx.addIssue({ code: "custom", path: ["insumoId"], message: "Escolha o insumo" });
    if (dados.valorUnitario === null || !Number.isFinite(dados.valorUnitario) || dados.valorUnitario < 0) {
      ctx.addIssue({ code: "custom", path: ["valorUnitario"], message: "Informe o valor unitário" });
    } else if (!temAteCasas(dados.valorUnitario, CASAS_TAXA) || dados.valorUnitario > TETO_NUMERIC_14_4) {
      ctx.addIssue({
        code: "custom",
        path: ["valorUnitario"],
        message: `O valor unitário aceita até ${CASAS_TAXA} casas decimais`,
      });
    }
  });

export type EntradaInput = z.infer<typeof entradaSchema>;

function textoOuNulo(texto: string): string | null {
  const limpo = texto.trim();
  return limpo === "" ? null : limpo;
}

/** Formulário para a action. Na OC, insumo e valor seguem nulos: quem manda é a OC. */
export function entradaDoForm(dados: EntradaFormInput): EntradaInput {
  const daOc = dados.origem === "oc";
  const local = decodificarLocal(dados.local) ?? { depositoId: null, tanqueId: null };
  return {
    ocItemId: daOc ? dados.ocItemId : null,
    depositoId: local.depositoId,
    tanqueId: local.tanqueId,
    insumoId: daOc ? null : dados.insumoId,
    quantidade: paraNumero(dados.quantidade, CASAS_TAXA) ?? 0,
    valorUnitario: daOc ? null : paraNumero(dados.valorUnitario, CASAS_TAXA),
    data: dados.data,
    notaFiscal: textoOuNulo(dados.notaFiscal),
    observacoes: textoOuNulo(dados.observacoes),
  };
}

// ---------------------------------------------------------------------------
// Saída
// ---------------------------------------------------------------------------

export const saidaFormSchema = z.object({
  local: localFormSchema,
  insumoId: idObrigatorio("Escolha o material"),
  quantidade: quantidadeTexto(),
  data: dataSchema,
  centroCustoId: idObrigatorio("Escolha o centro de custo"),
  observacoes: textoLivre(500),
});

export type SaidaFormInput = z.infer<typeof saidaFormSchema>;

export const saidaSchema = z
  .object({
    depositoId: idSchemaCom("Escolha o depósito").nullable(),
    tanqueId: idSchemaCom("Escolha o tanque").nullable(),
    insumoId: idSchemaCom("Escolha o material"),
    quantidade: quantidadeNumero(),
    data: dataSchema,
    centroCustoId: idSchemaCom("Escolha o centro de custo"),
    observacoes: z.string().trim().max(500).nullable(),
  })
  .superRefine(umLocal);

export type SaidaInput = z.infer<typeof saidaSchema>;

export function saidaDoForm(dados: SaidaFormInput): SaidaInput {
  const local = decodificarLocal(dados.local) ?? { depositoId: null, tanqueId: null };
  return {
    depositoId: local.depositoId,
    tanqueId: local.tanqueId,
    insumoId: dados.insumoId,
    quantidade: paraNumero(dados.quantidade, CASAS_TAXA) ?? 0,
    data: dados.data,
    centroCustoId: dados.centroCustoId,
    observacoes: textoOuNulo(dados.observacoes),
  };
}
