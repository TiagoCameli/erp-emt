import { z } from "zod";

import { idSchemaCom } from "@/lib/id";

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** VALOR em reais (regra de ouro 3): não negativo, dentro da coluna 14,2. */
function valorReais(rotulo: string) {
  return z
    .number({ error: `${rotulo} inválido` })
    .min(0, { error: `${rotulo} não pode ser negativo` })
    .max(9999999999.99, { error: `${rotulo} acima do permitido` });
}

/**
 * O que a action recebe para gravar uma posição do extrato. Só o LÍQUIDO é
 * obrigatório: é ele que o rendimento usa. Bruto, IR e IOF são informação.
 */
export const posicaoSchema = z.object({
  aplicacaoId: idSchemaCom("Escolha a aplicação"),
  data: z.string().trim().regex(DATA_ISO, { error: "Informe a data da posição" }),
  saldoLiquido: valorReais("Saldo líquido"),
  saldoBruto: valorReais("Saldo bruto").optional(),
  ir: valorReais("IR").optional(),
  iof: valorReais("IOF").optional(),
  observacoes: z.string().trim().max(1000, { error: "Máximo de 1000 caracteres" }).optional(),
});

export type PosicaoInput = z.infer<typeof posicaoSchema>;

/** O formulário: dinheiro como texto do InputMoeda ("1234,56"). */
export const posicaoFormSchema = z.object({
  aplicacaoId: z.string().min(1, { error: "Escolha a aplicação" }),
  data: z.string().trim().regex(DATA_ISO, { error: "Informe a data da posição" }),
  saldoLiquido: z.string().trim().min(1, { error: "Informe o saldo líquido do extrato" }),
  saldoBruto: z.string(),
  ir: z.string(),
  iof: z.string(),
  observacoes: z.string(),
});

export type PosicaoFormInput = z.infer<typeof posicaoFormSchema>;

/** Arredonda para centavo inteiro antes de mandar: 0,1 + 0,2 não chega ao banco. */
export function paraCentavo(valor: number): number {
  return Math.round(valor * 100) / 100;
}
