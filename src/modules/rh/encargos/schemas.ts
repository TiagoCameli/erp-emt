import { z } from "zod";

/**
 * Converte texto digitado (pt-BR: ponto = milhar, vírgula = decimal) em
 * número. Mesmo formato do salário de funções (cadastros/funcoes/schemas.ts)
 * e das horas de jornada (cadastros/jornadas/schemas.ts).
 */
function paraNumero(texto: string): number {
  const limpo = texto.trim().replace(/\./g, "").replace(",", ".");
  return Number(limpo);
}

/** Quantas casas decimais um número tem, pela representação decimal. */
function casasDecimais(valor: number): number {
  const texto = valor.toString();
  const ponto = texto.indexOf(".");
  return ponto === -1 ? 0 : texto.length - ponto - 1;
}

/** Percentual NUMERIC(6,3) com check 0..100 no banco. */
const PERCENTUAL_MAX = 100;

/**
 * Percentual (alíquota) do encargo: aceita a string digitada no formulário
 * (pt-BR) ou o número já convertido (reparse na Server Action, que valida de
 * novo o EncargoInput já processado). Obrigatório — diferente das horas de
 * jornada, vazio não vira 0: não existe encargo sem alíquota cadastrada. Não
 * negativo, no máximo 100, no máximo 3 casas — a coluna NUMERIC(6,3)
 * arredonda sem avisar.
 */
const percentualSchema = z
  .union([z.string(), z.number()])
  .transform((valor, ctx) => {
    if (typeof valor === "number") return valor;
    const texto = valor.trim();
    if (texto === "") {
      ctx.addIssue({ code: "custom", message: "Informe o percentual" });
      return z.NEVER;
    }
    const numero = paraNumero(texto);
    if (!Number.isFinite(numero)) {
      ctx.addIssue({ code: "custom", message: "Percentual inválido" });
      return z.NEVER;
    }
    return numero;
  })
  .refine((valor) => valor >= 0, {
    error: "O percentual não pode ser negativo",
  })
  .refine((valor) => valor <= PERCENTUAL_MAX, {
    error: "O percentual vai de 0 a 100",
  })
  .refine((valor) => casasDecimais(valor) <= 3, {
    error: "O percentual aceita no máximo 3 casas decimais",
  });

/** Schema do encargo da folha (INSS patronal, FGTS, RAT/SAT, Terceiros...). */
export const encargoSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, { error: "O nome precisa ter pelo menos 2 caracteres" }),
  percentual: percentualSchema,
  ativo: z.boolean().default(true),
});

/** Saída validada (ativo já resolvido para boolean, percentual já número): use nas server actions. */
export type EncargoInput = z.infer<typeof encargoSchema>;

/** Entrada do formulário (percentual como string, ativo opcional): use no react-hook-form. */
export type EncargoFormInput = z.input<typeof encargoSchema>;
