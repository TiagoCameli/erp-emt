import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A aprovação do lote roda na função da PÁGINA do detalhe, não numa função
 * própria. Um lote de 29 pessoas escreve 29 lançamentos, 29 parcelas, os
 * rateios e as guias numa transação só.
 *
 * Sem `maxDuration` a rota morre no teto padrão e o lote fica meio gravado,
 * com quem clicou sem saber se aprovou. Este teste é a guarda: quem apagar a
 * linha vê o teste cair, em vez de descobrir em dezembro.
 */
describe("maxDuration da rota do lote de 13º", () => {
  const caminho = join(
    process.cwd(),
    "src/app/(app)/rh/decimo-terceiro-e-ferias/13o/[id]/page.tsx",
  );

  it("a página do detalhe declara maxDuration de pelo menos 60s", () => {
    const fonte = readFileSync(caminho, "utf8");
    const achado = /export\s+const\s+maxDuration\s*=\s*(\d+)/.exec(fonte);

    expect(achado, "a rota não declara maxDuration").not.toBeNull();
    expect(Number(achado?.[1])).toBeGreaterThanOrEqual(60);
  });

  it("o comentário explica por que a linha existe", () => {
    // Sem o porquê escrito, a próxima pessoa apaga achando que é sobra.
    const fonte = readFileSync(caminho, "utf8");
    expect(fonte).toMatch(/timeout|teto padrão/i);
  });
});
