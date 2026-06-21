import { z } from "zod";

import type { ColunaImportacao } from "@/lib/importacao";
import {
  numeroNaoNegativo,
  paraNumero,
  precoUnitarioValido,
  quantidadeContratadaValida,
} from "@/modules/medicao/planilha-contratual/numero";

/* ------------------------------------------------------------------ */
/* Planilha contratual (cabeçalho, uma por obra)                       */
/* ------------------------------------------------------------------ */

/** Schema de servidor da planilha contratual, validado nas actions. */
export const planilhaSchema = z.object({
  obraId: z.uuid({ error: "Selecione a obra" }),
  nome: z
    .string()
    .trim()
    .min(2, { error: "O nome precisa ter pelo menos 2 caracteres" })
    .max(120, { error: "O nome pode ter no máximo 120 caracteres" }),
  observacao: z
    .string()
    .trim()
    .max(500, { error: "Máximo de 500 caracteres" })
    .optional(),
  ativo: z.boolean().default(true),
});

export type PlanilhaInput = z.infer<typeof planilhaSchema>;

/** Schema do formulário (client) da planilha. */
export const planilhaFormSchema = z.object({
  obraId: z.uuid({ error: "Selecione a obra" }),
  nome: z
    .string()
    .trim()
    .min(2, { error: "O nome precisa ter pelo menos 2 caracteres" })
    .max(120, { error: "O nome pode ter no máximo 120 caracteres" }),
  observacao: z
    .string()
    .trim()
    .max(500, { error: "Máximo de 500 caracteres" }),
  ativo: z.boolean(),
});

export type PlanilhaFormInput = z.infer<typeof planilhaFormSchema>;

/** Converte o formulário da planilha no input de servidor. */
export function planilhaFormParaInput(dados: PlanilhaFormInput): PlanilhaInput {
  return {
    obraId: dados.obraId,
    nome: dados.nome.trim(),
    observacao: dados.observacao.trim() === "" ? undefined : dados.observacao.trim(),
    ativo: dados.ativo,
  };
}

/* ------------------------------------------------------------------ */
/* Item da planilha                                                    */
/* ------------------------------------------------------------------ */

/** Schema de servidor de um item (tipos já coeridos). */
export const itemSchema = z.object({
  codigo: z
    .string()
    .trim()
    .max(50, { error: "O código pode ter no máximo 50 caracteres" })
    .optional(),
  descricao: z
    .string()
    .trim()
    .min(2, { error: "A descrição precisa ter pelo menos 2 caracteres" })
    .max(300, { error: "A descrição pode ter no máximo 300 caracteres" }),
  unidadeId: z.uuid({ error: "Unidade inválida" }).optional(),
  quantidadeContratada: z
    .number({ error: "Quantidade inválida" })
    .refine(quantidadeContratadaValida, {
      error: "Quantidade inválida (não negativa, até 3 casas)",
    }),
  precoUnitario: z
    .number({ error: "Preço inválido" })
    .refine(precoUnitarioValido, {
      error: "Preço inválido (não negativo, até 2 casas)",
    }),
});

export type ItemInput = z.infer<typeof itemSchema>;

/** Schema do formulário (client) do item: quantidade e preço como string. */
export const itemFormSchema = z.object({
  codigo: z
    .string()
    .trim()
    .max(50, { error: "O código pode ter no máximo 50 caracteres" }),
  descricao: z
    .string()
    .trim()
    .min(2, { error: "A descrição precisa ter pelo menos 2 caracteres" })
    .max(300, { error: "A descrição pode ter no máximo 300 caracteres" }),
  unidadeId: z.string().trim(),
  quantidadeContratada: z
    .string()
    .trim()
    .refine(numeroNaoNegativo, { error: "Informe uma quantidade válida" }),
  precoUnitario: z
    .string()
    .trim()
    .refine(numeroNaoNegativo, { error: "Informe um preço válido" }),
});

export type ItemFormInput = z.infer<typeof itemFormSchema>;

/** Valor do select de unidade quando nenhuma unidade é escolhida. */
export const SEM_UNIDADE = "sem-unidade";

/** Converte o formulário do item no input de servidor (números coeridos). */
export function itemFormParaInput(dados: ItemFormInput): ItemInput {
  const codigo = dados.codigo.trim();
  const unidadeId = dados.unidadeId.trim();
  return {
    codigo: codigo === "" ? undefined : codigo,
    descricao: dados.descricao.trim(),
    unidadeId: unidadeId === "" || unidadeId === SEM_UNIDADE ? undefined : unidadeId,
    quantidadeContratada: paraNumero(dados.quantidadeContratada),
    precoUnitario: paraNumero(dados.precoUnitario),
  };
}

/* ------------------------------------------------------------------ */
/* Importação por planilha                                             */
/* ------------------------------------------------------------------ */

/** Forma de cada linha lida da planilha de importação de itens. */
export interface ItemImport {
  codigo: string | null;
  descricao: string;
  unidade: string | null;
  quantidade_contratada: number;
  preco_unitario: number;
}

/** Transforma e valida número pt-BR de uma célula. Lança Error se inválido. */
function transformarNumero(valorCelula: unknown): number {
  if (typeof valorCelula === "number") return valorCelula;
  const numero = paraNumero(String(valorCelula ?? ""));
  if (Number.isNaN(numero)) {
    throw new Error("número inválido");
  }
  return numero;
}

/** Colunas da planilha de importação de itens contratuais. */
export const colunasImportItem: ColunaImportacao<ItemImport>[] = [
  { chave: "codigo", rotulo: "Codigo", exemplo: "1.1" },
  {
    chave: "descricao",
    rotulo: "Descricao",
    obrigatoria: true,
    exemplo: "Escavacao em material de 1a categoria",
  },
  { chave: "unidade", rotulo: "Unidade", exemplo: "m3" },
  {
    chave: "quantidade_contratada",
    rotulo: "Quantidade contratada",
    obrigatoria: true,
    exemplo: "1500,000",
    transformar: transformarNumero,
    validar: (valor) =>
      typeof valor === "number" && quantidadeContratadaValida(valor)
        ? null
        : "Quantidade inválida (não negativa, até 3 casas)",
  },
  {
    chave: "preco_unitario",
    rotulo: "Preco unitario",
    obrigatoria: true,
    exemplo: "12,50",
    transformar: transformarNumero,
    validar: (valor) =>
      typeof valor === "number" && precoUnitarioValido(valor)
        ? null
        : "Preço inválido (não negativo, até 2 casas)",
  },
];

/** Rótulos das colunas do modelo de importação, na ordem. */
export const COLUNAS_MODELO_ITEM = colunasImportItem.map((coluna) => ({
  rotulo: coluna.rotulo,
  exemplo: coluna.exemplo,
}));
