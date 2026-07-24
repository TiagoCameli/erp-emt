import { z } from "zod";

/** Vínculos aceitos no cadastro de colaboradores (RH completo vem na Fase 7). */
export const VINCULOS = ["clt", "diarista", "terceiro"] as const;
export type Vinculo = (typeof VINCULOS)[number];

export const ROTULO_VINCULO: Record<Vinculo, string> = {
  clt: "CLT",
  diarista: "Diarista",
  terceiro: "Terceiro",
};

/** Tipos de conta bancária aceitos nos dados bancários do colaborador. */
export const TIPOS_CONTA = ["corrente", "poupanca"] as const;
export type TipoConta = (typeof TIPOS_CONTA)[number];

export const ROTULO_TIPO_CONTA: Record<TipoConta, string> = {
  corrente: "Conta corrente",
  poupanca: "Poupança",
};

/** Normaliza string vazia para null (campos opcionais do formulário). */
const textoOpcional = z
  .string()
  .trim()
  .transform((valor) => (valor === "" ? null : valor))
  .nullable();

/**
 * Converte texto digitado (pt-BR: ponto = milhar, vírgula = decimal) em
 * número. Mesmo formato aceito nos valores monetários de compras
 * (compras/ordens/calculo.ts) e financeiro (lancamentos/schemas.ts).
 */
export function paraNumero(texto: string): number {
  const limpo = texto.trim().replace(/\./g, "").replace(",", ".");
  return Number(limpo);
}

/**
 * Quantas casas decimais um número tem, contando pela representação decimal
 * (sem notação científica: salário/diária nunca chegam nessa faixa).
 */
function casasDecimais(valor: number): number {
  const texto = valor.toString();
  const ponto = texto.indexOf(".");
  return ponto === -1 ? 0 : texto.length - ponto - 1;
}

/**
 * Dinheiro opcional (NUMERIC(14,2)): aceita a string digitada no formulário
 * (pt-BR, vazio = null) ou o número já convertido (reparse na Server Action,
 * que valida de novo o ColaboradorInput já processado). Não negativo, no
 * máximo 2 casas — a mesma trava do preço da OC (compras/ordens/schemas.ts),
 * porque a coluna NUMERIC(14,2) arredonda sem avisar.
 */
const dinheiroOpcionalSchema = z
  .union([z.string(), z.number()])
  .nullable()
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
  .refine((valor) => valor === null || valor >= 0, {
    error: "O valor não pode ser negativo",
  })
  .refine((valor) => valor === null || casasDecimais(valor) <= 2, {
    error: "O valor aceita no máximo 2 casas decimais",
  });

/** Schema do formulário de colaborador (criar e editar). */
export const colaboradorSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, { error: "O nome precisa ter pelo menos 2 caracteres" }),
  cpf: textoOpcional,
  funcao: textoOpcional,
  vinculo: z.enum(VINCULOS, { error: "Selecione um vínculo" }),
  obraId: z.uuid({ error: "Obra inválida" }).nullable(),
  centroCustoId: z.uuid({ error: "Centro de custo inválido" }).nullable(),
  dataAdmissao: textoOpcional,
  telefone: textoOpcional,
  ativo: z.boolean().default(true),
  salario: dinheiroOpcionalSchema,
  valorDiaria: dinheiroOpcionalSchema,
  banco: textoOpcional,
  agencia: textoOpcional,
  conta: textoOpcional,
  tipoConta: z.enum(TIPOS_CONTA, { error: "Tipo de conta inválido" }).nullable(),
  chavePix: textoOpcional,
});

export type ColaboradorInput = z.infer<typeof colaboradorSchema>;
