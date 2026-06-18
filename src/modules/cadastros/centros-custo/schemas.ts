import { z } from "zod";

/**
 * Tipos de nível 1 (CENTRO) da árvore de centros de custo.
 * Etapas (nível 2) e itens (nível 3) têm tipo null.
 */
export const TIPOS_CENTRO = ["obra", "escritorio", "manutencao"] as const;

export type TipoCentro = (typeof TIPOS_CENTRO)[number];

/** Rótulos em pt-BR de cada tipo de centro, para exibição (badge no nível 1). */
export const ROTULO_TIPO_CENTRO: Record<TipoCentro, string> = {
  obra: "Obra",
  escritorio: "Escritório",
  manutencao: "Manutenção",
};

const nomeSchema = z
  .string()
  .trim()
  .min(2, { error: "O nome precisa ter pelo menos 2 caracteres" })
  .max(160, { error: "O nome pode ter no máximo 160 caracteres" });

const codigoSchema = z
  .string()
  .trim()
  .max(40, { error: "O código pode ter no máximo 40 caracteres" })
  .optional();

/**
 * Orçamento opcional (NUMERIC(14,2)). Aceita number, normaliza vazio para
 * undefined. Quando informado, habilita o orçado x realizado do nó.
 */
const orcamentoSchema = z
  .number({ error: "Informe um valor numérico" })
  .nonnegative({ error: "O orçamento não pode ser negativo" })
  .max(99_999_999_999.99, { error: "O orçamento é alto demais" })
  .optional();

const uuidSchema = z.uuid({ error: "Registro inválido" });

/** Criar uma etapa (nível 2) sob um centro (nível 1). */
export const criarEtapaSchema = z.object({
  nome: nomeSchema,
  pai_id: uuidSchema,
  orcamento: orcamentoSchema,
});

export type CriarEtapaInput = z.infer<typeof criarEtapaSchema>;

/** Criar um item (nível 3) sob uma etapa (nível 2). */
export const criarItemSchema = z.object({
  nome: nomeSchema,
  pai_id: uuidSchema,
  orcamento: orcamentoSchema,
});

export type CriarItemInput = z.infer<typeof criarItemSchema>;

/** Editar nome, código e orçamento de um nó (etapa ou item). */
export const editarNoSchema = z.object({
  nome: nomeSchema,
  codigo: codigoSchema,
  orcamento: orcamentoSchema,
});

export type EditarNoInput = z.infer<typeof editarNoSchema>;
