import { absoluto, arredondar, casasDecimais, comparar, lerDecimal, multiplicar, paraTexto, subtrair, truncar } from "@/modules/medicao/_shared/decimal";

import type { LinhaImportada } from "./montagem";

/**
 * Confere, linha a linha, a coluna "valor previsto" da planilha contra quantidade x preço. Não
 * escolhe regra nenhuma (spec 6.2: a regra do Lote 09 é descoberta e mostrada ao Tiago, não
 * chutada). Só conta:
 *   arredondado  a planilha tem round(q x p, 2), e isso difere do exato
 *   truncado     a planilha tem trunc(q x p, 2), e isso difere do arredondado (3ª casa >= 5)
 *   exato        a planilha tem q x p sem arredondar (tolerância de 1e-6 para o ruído do double)
 *   indistinto   q x p já tem até 2 casas, ou o truncado e o arredondado coincidem e a planilha
 *                tem esse número: as leituras dão o mesmo valor
 *   diverge      não fecha de jeito nenhum (preço ou quantidade com casa escondida que o arquivo
 *                não traz, ou valor digitado à mão)
 */

export type Classe = "arredondado" | "truncado" | "exato" | "indistinto" | "diverge";

export interface DiagnosticoLinha {
  ordem: number;
  codigo: string;
  classe: Classe;
  exato: string;
  arredondado: string;
  planilha: string;
}

export interface Diagnostico {
  comValor: number;
  arredondado: number;
  truncado: number;
  exato: number;
  indistinto: number;
  diverge: DiagnosticoLinha[];
}

const TOLERANCIA = lerDecimal("0.000001");

export function diagnosticarValores(linhas: LinhaImportada[]): Diagnostico | null {
  const comValor = linhas.filter((l) => l.tipo === "servico" && l.valorPlanilha !== null);
  if (comValor.length === 0) return null;

  const resultado: Diagnostico = { comValor: comValor.length, arredondado: 0, truncado: 0, exato: 0, indistinto: 0, diverge: [] };
  for (const l of comValor) {
    const exato = multiplicar(lerDecimal(l.quantidadePrevista ?? "0"), lerDecimal(l.precoUnitario ?? "0"));
    const arred = arredondar(exato, 2);
    const planilha = lerDecimal(l.valorPlanilha as string);
    const pertoDoExato = comparar(absoluto(subtrair(planilha, exato)), TOLERANCIA) <= 0;
    const igualAoArredondado = casasDecimais(l.valorPlanilha as string) <= 2 && comparar(planilha, arred) === 0;
    const trunc = truncar(exato, 2);
    const igualAoTruncado = casasDecimais(l.valorPlanilha as string) <= 2 && comparar(planilha, trunc) === 0;
    const exatoTemAte2Casas = comparar(exato, arred) === 0;

    let classe: Classe;
    if (exatoTemAte2Casas && (pertoDoExato || igualAoArredondado)) classe = "indistinto";
    else if (igualAoArredondado && igualAoTruncado) classe = "indistinto";
    else if (igualAoArredondado) classe = "arredondado";
    else if (igualAoTruncado) classe = "truncado";
    else if (pertoDoExato) classe = "exato";
    else classe = "diverge";

    if (classe === "diverge") {
      resultado.diverge.push({ ordem: l.ordem, codigo: l.codigo, classe, exato: paraTexto(exato), arredondado: paraTexto(arred),
                               planilha: l.valorPlanilha as string });
    } else {
      resultado[classe] += 1;
    }
  }
  return resultado;
}
