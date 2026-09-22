import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CASAS_DINHEIRO, CASAS_TAXA, CASAS_VALOR_OPERACIONAL } from "./casas-decimais";

/**
 * `CASAS_VALOR_OPERACIONAL` (4 casas no VALOR) é exceção dos módulos Frete,
 * Combustível e Manutenção. O Financeiro paga boleto e concilia OFX em centavo;
 * um campo dele que aceitasse 4 casas criaria parcela impagável. Este teste
 * falha se alguém usar a constante dentro de `src/modules/financeiro`.
 */

function fontes(dir: string): string[] {
  const achados: string[] = [];
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, item.name);
    if (item.isDirectory()) achados.push(...fontes(caminho));
    else if (/\.tsx?$/.test(item.name) && !/\.test\.tsx?$/.test(item.name)) achados.push(caminho);
  }
  return achados;
}

describe("casas decimais", () => {
  it("valor do Financeiro tem 2 casas, taxa e valor operacional têm 4", () => {
    expect(CASAS_DINHEIRO).toBe(2);
    expect(CASAS_TAXA).toBe(4);
    expect(CASAS_VALOR_OPERACIONAL).toBe(4);
  });

  it("o Financeiro nunca usa CASAS_VALOR_OPERACIONAL", () => {
    const arquivos = fontes("src/modules/financeiro");
    expect(arquivos.length).toBeGreaterThan(0);
    const usam = arquivos.filter((a) => readFileSync(a, "utf8").includes("CASAS_VALOR_OPERACIONAL"));
    expect(usam).toEqual([]);
  });
});
