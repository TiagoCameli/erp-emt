/**
 * Aritmética decimal exata (BigInt), só para o DIAGNÓSTICO da importação: conferir a coluna de
 * valor da planilha contra quantidade x preço sem o erro do float. O valor de verdade é sempre o
 * do banco (fn_mc_valor e as views mc_v_*); isto aqui nunca vai para tela como número oficial.
 *
 * Sem literal 1n: o tsconfig mira ES2017.
 */

export interface Decimal {
  /** valor = digitos / 10^escala */
  digitos: bigint;
  escala: number;
}

const ZERO = BigInt(0);
const DEZ = BigInt(10);

function potencia(expoente: number): bigint {
  return DEZ ** BigInt(expoente);
}

export function lerDecimal(texto: string): Decimal {
  const limpo = texto.trim();
  if (!/^-?\d+(\.\d+)?$/.test(limpo)) throw new Error(`Número inválido: ${texto}`);
  const negativo = limpo.startsWith("-");
  const [inteiro, fracao = ""] = limpo.replace("-", "").split(".");
  const digitos = BigInt(inteiro + fracao);
  return { digitos: negativo ? -digitos : digitos, escala: fracao.length };
}

function mesmaEscala(a: Decimal, b: Decimal): [bigint, bigint, number] {
  const escala = Math.max(a.escala, b.escala);
  return [a.digitos * potencia(escala - a.escala), b.digitos * potencia(escala - b.escala), escala];
}

export function multiplicar(a: Decimal, b: Decimal): Decimal {
  return { digitos: a.digitos * b.digitos, escala: a.escala + b.escala };
}

export function subtrair(a: Decimal, b: Decimal): Decimal {
  const [x, y, escala] = mesmaEscala(a, b);
  return { digitos: x - y, escala };
}

export function absoluto(d: Decimal): Decimal {
  return { digitos: d.digitos < ZERO ? -d.digitos : d.digitos, escala: d.escala };
}

export function comparar(a: Decimal, b: Decimal): -1 | 0 | 1 {
  const [x, y] = mesmaEscala(a, b);
  return x === y ? 0 : x < y ? -1 : 1;
}

/** Meio para longe do zero: o mesmo round(numeric, n) do Postgres. */
export function arredondar(d: Decimal, casas: number): Decimal {
  if (d.escala <= casas) return { digitos: d.digitos * potencia(casas - d.escala), escala: casas };
  const fator = potencia(d.escala - casas);
  const negativo = d.digitos < ZERO;
  const abs = negativo ? -d.digitos : d.digitos;
  let quociente = abs / fator;
  if ((abs % fator) * BigInt(2) >= fator) quociente += BigInt(1);
  return { digitos: negativo ? -quociente : quociente, escala: casas };
}

export function paraTexto(d: Decimal): string {
  const negativo = d.digitos < ZERO;
  let corpo = (negativo ? -d.digitos : d.digitos).toString().padStart(d.escala + 1, "0");
  if (d.escala > 0) {
    corpo = `${corpo.slice(0, corpo.length - d.escala)}.${corpo.slice(corpo.length - d.escala)}`.replace(/\.?0+$/, "");
  }
  if (corpo === "0" || corpo === "") return "0";
  return negativo ? `-${corpo}` : corpo;
}

export function casasDecimais(texto: string): number {
  const ponto = texto.indexOf(".");
  return ponto === -1 ? 0 : texto.length - ponto - 1;
}
