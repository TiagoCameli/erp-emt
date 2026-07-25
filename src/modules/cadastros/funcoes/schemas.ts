import { z } from "zod";

/** Normaliza string vazia para null (campo opcional de texto: CBO). */
const textoOpcional = z
  .string()
  .trim()
  .transform((valor) => (valor === "" ? null : valor))
  .nullable();

/**
 * Converte texto digitado (pt-BR: ponto = milhar, vírgula = decimal) em
 * número. Mesmo formato do salário de colaboradores
 * (cadastros/colaboradores/schemas.ts) e dos demais valores monetários
 * do projeto (compras, financeiro).
 */
function paraNumero(texto: string): number {
  const limpo = texto.trim().replace(/\./g, "").replace(",", ".");
  return Number(limpo);
}

/**
 * Quantas casas decimais um número tem, contando pela representação decimal
 * (sem notação científica: salário nunca chega nessa faixa).
 */
function casasDecimais(valor: number): number {
  const texto = valor.toString();
  const ponto = texto.indexOf(".");
  return ponto === -1 ? 0 : texto.length - ponto - 1;
}

/**
 * Dinheiro opcional (NUMERIC(14,2)): mesmo validador do salário de
 * colaboradores (cadastros/colaboradores/schemas.ts) — aceita a string
 * digitada no formulário (pt-BR, vazio = null) ou o número já convertido
 * (reparse na Server Action, que valida de novo o FuncaoInput já
 * processado). Não negativo, no máximo 2 casas — a coluna NUMERIC(14,2)
 * arredonda sem avisar.
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

/** Schema do formulário de função (cargo). */
export const funcaoSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, { error: "O nome precisa ter pelo menos 2 caracteres" }),
  salarioBase: dinheiroOpcionalSchema,
  cbo: textoOpcional,
  ativo: z.boolean().default(true),
});

/** Saída validada (ativo já resolvido para boolean): use nas server actions. */
export type FuncaoInput = z.infer<typeof funcaoSchema>;

/** Entrada do formulário (ativo opcional por causa do default): use no react-hook-form. */
export type FuncaoFormInput = z.input<typeof funcaoSchema>;
