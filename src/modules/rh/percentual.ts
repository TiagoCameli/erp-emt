import { z } from "zod";

import { CASAS_TAXA } from "@/lib/casas-decimais";

/**
 * Converte texto digitado (pt-BR: ponto = milhar, vírgula = decimal) em
 * número. Mesmo formato do salário de funções (cadastros/funcoes/schemas.ts)
 * e das horas de jornada (cadastros/jornadas/schemas.ts).
 *
 * Extraído de rh/encargos/schemas.ts (Bloco 8b, Task 1): eram três cópias da
 * mesma regra de percentual na folha antes desta extração. Na rodada de
 * correção de 14/08/2026, rh/encargos/importacao.ts passou a importar daqui
 * (a coluna que ela alimenta multiplica salário e provisão), e sobra uma cópia
 * fora daqui: rh/parametros-folha/schemas.ts, que segue com a versão antiga de
 * propósito, documentada lá. Uma quarta cópia em rh/provisoes seria a linha
 * demais.
 *
 * Valida o agrupamento do ponto de milhar: cada grupo à direita do primeiro
 * ponto tem que ter exatamente 3 dígitos ("1.234.567"), senão "0.5" (grupo
 * de 1 dígito) virava 5 caladamente — dez vezes o valor digitado, aprovado
 * por todos os refines e pelo check da coluna (fix round 1 da Task 1).
 * Devolve NaN (não lança) quando o agrupamento é inválido; quem chama já
 * trata NaN como "Percentual inválido".
 */
export function paraNumero(texto: string): number {
  const limpo = texto.trim();
  const negativo = limpo.startsWith("-");
  const semSinal = negativo ? limpo.slice(1) : limpo;
  const [parteInteira, ...resto] = semSinal.split(",");

  if (parteInteira.includes(".")) {
    const grupos = parteInteira.split(".");
    const agrupamentoValido =
      grupos.length > 1 &&
      /^\d{1,3}$/.test(grupos[0]) &&
      grupos.slice(1).every((grupo) => /^\d{3}$/.test(grupo));
    if (!agrupamentoValido) return NaN;
  }

  const semMilhar = parteInteira.replace(/\./g, "");
  const numeroTexto =
    resto.length > 0 ? `${semMilhar}.${resto.join(",")}` : semMilhar;
  const numero = Number(numeroTexto);
  return negativo ? -numero : numero;
}

/**
 * Quantas casas decimais um número tem, pela representação decimal.
 *
 * `Number.prototype.toString()` vira notação exponencial fora de
 * [1e-6, 1e21) — `(1e-7).toString()` é `"1e-7"`, sem ponto, e a versão
 * anterior desta função contava 0 casas aí (fix round 1 da Task 1): o Zod
 * aceitava, a coluna `numeric(6,3)` arredondava pra 0.000, e o check
 * `percentual > 0` da provisão estourava na tela como erro genérico. O regex
 * cobre as duas notações: parte decimal explícita menos o quanto o expoente
 * desloca o ponto (negativo, no caso de `e-N`, aumenta as casas).
 */
export function casasDecimais(valor: number): number {
  if (!Number.isFinite(valor)) return 0;
  const partes = /^-?\d+(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(valor.toString());
  if (!partes) return 0;
  const casasBase = partes[1] ? partes[1].length : 0;
  const expoente = partes[2] ? Number(partes[2]) : 0;
  return Math.max(0, casasBase - expoente);
}

/** Percentual NUMERIC(7,4) com check 0..100 no banco. */
const PERCENTUAL_MAX = 100;

/**
 * Percentual (alíquota) compartilhado da folha: aceita a string digitada no
 * formulário (pt-BR) ou o número já convertido (reparse na Server Action, que
 * valida de novo o Input já processado). Não negativo, no máximo 100, no
 * máximo 4 casas — a coluna NUMERIC(7,4) arredonda sem avisar.
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
  .refine((valor) => casasDecimais(valor) <= CASAS_TAXA, {
    error: `O percentual aceita no máximo ${CASAS_TAXA} casas decimais`,
  });
