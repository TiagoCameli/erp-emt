import { z } from "zod";

/**
 * Entradas da importação da planilha contratual. Nenhum número da planilha passa por aqui: o
 * navegador só manda a aba, a linha do cabeçalho, as colunas e as escolhas do usuário. Os números
 * saem do xlsx guardado no Storage, lido no servidor (spec 6.1).
 */

const coluna = z.number().int().positive();

export const mapeamentoSchema = z.object({
  aba: z.string().min(1),
  linhaCabecalho: z.number().int().positive(),
  colunas: z.object({
    codigo: coluna, descricao: coluna, unidade: coluna, preco: coluna, quantidade: coluna, valor: coluna.nullable(),
  }),
});

export const escolhasSchema = z.object({
  paiPorOrdem: z.record(z.string(), z.number().int().positive()),
  itemPorOrdem: z.record(z.string(), z.string().nullable()),
  duplicadosConfirmados: z.boolean(),
  alertasLidos: z.boolean(),
});

export const rascunhoSchema = z.object({
  aditivoId: z.string().nullable(),
  vigenteDesde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data de início da versão"),
  motivo: z.string().trim(),
});

export type RascunhoInput = z.infer<typeof rascunhoSchema>;

/**
 * Escolhas do usuário na prévia, indexadas pela `ordem` da linha importada:
 * - paiPorOrdem: o pai escolhido quando o código do pai aparece mais de uma vez;
 * - itemPorOrdem: no aditivo, o item da versão anterior (ou null para "item novo").
 */
export type Escolhas = {
  paiPorOrdem: Record<number, number>;
  itemPorOrdem: Record<number, string | null>;
  duplicadosConfirmados: boolean;
  alertasLidos: boolean;
};
