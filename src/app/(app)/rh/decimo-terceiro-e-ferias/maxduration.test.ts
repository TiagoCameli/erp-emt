import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * As aprovações de 13º e de recibo de férias rodam na função da PÁGINA do
 * detalhe, não numa função própria.
 *
 * O lote de 13º de 29 pessoas escreve 29 lançamentos, 29 parcelas, os rateios
 * e as guias numa transação só. O recibo de férias escreve menos, mas escreve
 * lançamento, parcela, rateio e até duas guias na mesma transação, e o custo
 * de errar é o mesmo: sem `maxDuration` a rota morre no teto padrão e o
 * registro fica meio gravado, com quem clicou sem saber se aprovou.
 *
 * Este teste é a guarda: quem apagar a linha vê o teste cair, em vez de
 * descobrir em dezembro.
 */
const ROTAS = [
  {
    nome: "lote de 13º",
    caminho: "src/app/(app)/rh/decimo-terceiro-e-ferias/13o/[id]/page.tsx",
  },
  {
    nome: "recibo de férias",
    caminho: "src/app/(app)/rh/decimo-terceiro-e-ferias/ferias/[id]/page.tsx",
  },
];

describe.each(ROTAS)("maxDuration da rota do $nome", ({ caminho }) => {
  const fonte = readFileSync(join(process.cwd(), caminho), "utf8");

  it("a página do detalhe declara maxDuration de pelo menos 60s", () => {
    const achado = /export\s+const\s+maxDuration\s*=\s*(\d+)/.exec(fonte);

    expect(achado, "a rota não declara maxDuration").not.toBeNull();
    expect(Number(achado?.[1])).toBeGreaterThanOrEqual(60);
  });

  it("o comentário explica por que a linha existe", () => {
    // Sem o porquê escrito, a próxima pessoa apaga achando que é sobra.
    expect(fonte).toMatch(/timeout|teto padrão/i);
  });
});
