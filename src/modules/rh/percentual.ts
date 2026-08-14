import { z } from "zod";

/**
 * Converte texto digitado (pt-BR: ponto = milhar, vírgula = decimal) em
 * número. Mesmo formato do salário de funções (cadastros/funcoes/schemas.ts)
 * e das horas de jornada (cadastros/jornadas/schemas.ts).
 *
 * Extraído de rh/encargos/schemas.ts (Bloco 8b, Task 1): era a terceira cópia
 * da mesma regra de percentual na folha (a outra vive em
 * rh/parametros-folha/schemas.ts, fora do escopo desta extração). Uma quarta
 * cópia em rh/provisoes seria a linha demais.
 */
export function paraNumero(texto: string): number {
  const limpo = texto.trim().replace(/\./g, "").replace(",", ".");
  return Number(limpo);
}

/** Quantas casas decimais um número tem, pela representação decimal. */
export function casasDecimais(valor: number): number {
  const texto = valor.toString();
  const ponto = texto.indexOf(".");
  return ponto === -1 ? 0 : texto.length - ponto - 1;
}

/** Percentual NUMERIC(6,3) com check 0..100 no banco. */
const PERCENTUAL_MAX = 100;

/**
 * Percentual (alíquota) compartilhado da folha: aceita a string digitada no
 * formulário (pt-BR) ou o número já convertido (reparse na Server Action, que
 * valida de novo o Input já processado). Não negativo, no máximo 100, no
 * máximo 3 casas — a coluna NUMERIC(6,3) arredonda sem avisar.
 *
 * Base comum de encargoSchema (rh/encargos) e provisaoSchema (rh/provisoes).
 * Cada schema decide, por cima deste, se aceita percentual 0: encargos aceita
 * (a alíquota pode ser zero enquanto não regulamentada), provisões recusa
 * (`percentual > 0`, ver rh/provisoes/schemas.ts).
 */
export const percentualSchema = z
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
