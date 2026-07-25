import { z } from "zod";

/**
 * Converte texto digitado (pt-BR: ponto = milhar, vírgula = decimal) em
 * número. Mesmo formato do salário de funções (cadastros/funcoes/schemas.ts)
 * e dos demais valores monetários do projeto.
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

/** Horas NUMERIC(4,2) com check 0..24 no banco (mesmo limite do apontamento). */
const HORAS_MAX = 24;

/**
 * Horas de um dia da semana na jornada: aceita a string digitada no
 * formulário (pt-BR) ou o número já convertido (reparse na Server Action,
 * que valida de novo o JornadaInput já processado). Vazio vira 0 — dia sem
 * expediente na jornada. Não negativo, no máximo 24, no máximo 2 casas — a
 * coluna NUMERIC(4,2) arredonda sem avisar.
 */
const horasSchema = z
  .union([z.string(), z.number()])
  .transform((valor, ctx) => {
    if (typeof valor === "number") return valor;
    const texto = valor.trim();
    if (texto === "") return 0;
    const numero = paraNumero(texto);
    if (!Number.isFinite(numero)) {
      ctx.addIssue({ code: "custom", message: "Hora inválida" });
      return z.NEVER;
    }
    return numero;
  })
  .refine((valor) => valor >= 0, {
    error: "As horas não podem ser negativas",
  })
  .refine((valor) => valor <= HORAS_MAX, {
    error: "As horas vão de 0 a 24",
  })
  .refine((valor) => casasDecimais(valor) <= 2, {
    error: "As horas aceitam no máximo 2 casas decimais",
  });

/** Schema da jornada de trabalho (horas por dia da semana). */
export const jornadaSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, { error: "O nome precisa ter pelo menos 2 caracteres" }),
  horasSegunda: horasSchema,
  horasTerca: horasSchema,
  horasQuarta: horasSchema,
  horasQuinta: horasSchema,
  horasSexta: horasSchema,
  horasSabado: horasSchema,
  horasDomingo: horasSchema,
  ativo: z.boolean().default(true),
});

/** Saída validada (ativo já resolvido para boolean, horas já números): use nas server actions. */
export type JornadaInput = z.infer<typeof jornadaSchema>;

/** Entrada do formulário (horas como string, ativo opcional): use no react-hook-form. */
export type JornadaFormInput = z.input<typeof jornadaSchema>;
