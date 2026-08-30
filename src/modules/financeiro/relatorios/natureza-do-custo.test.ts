import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * O corte de natureza da família de custo, provado no arquivo que o banco
 * executa.
 *
 * Por que um teste que lê SQL: a regra não existe em TypeScript nenhum. As sete
 * funções abaixo são a MESMA pergunta ("quanto custou") vista de sete ângulos, e
 * a tela promete que elas fecham entre si — o KPI de `fn_rel_custo_por_grupo`
 * tem que dar o mesmo total da tabela de `fn_rel_custo_centro_custo`. Basta
 * alguém tocar o `where` de UMA delas para a tela passar a mostrar dois números
 * para a mesma coisa, sem erro em lugar nenhum. Foi exatamente o que aconteceu
 * duas vezes:
 *
 *  - 28/08/2026: `fn_rel_custo_centro_custo` não filtrava natureza e a gêmea
 *    `fn_rel_custo_receita` filtrava. 20 dos 21 meses divergiam.
 *  - 29/08/2026: o alinhamento em `= 'operacional'` levou junto a Tarifa
 *    Bancária, que é despesa paga e rateada. Decisão do Tiago: "as tarifas
 *    bancarias devem ser do escritorio central mesmo".
 *
 * A regra que ficou, e que este teste tranca:
 *   custo   (as sete)  : natureza <> 'movimentacao'
 *   receita (só a 7ª)  : natureza  = 'operacional'
 *
 * `movimentacao` é principal de empréstimo e de aplicação: entra e sai do caixa
 * sem virar resultado, então não é custo de ninguém. `financeira` é resultado —
 * é assim que a DRE já a trata (ver dre-natureza.test.ts: resultado =
 * operacional + financeiro, movimentação fora) — e no caso da tarifa há um
 * centro de custo real pagando por ela.
 */

/** As sete funções que respondem "quanto custou" e têm de fechar entre si. */
const FAMILIA_DE_CUSTO = [
  "fn_rel_custo_centro_custo",
  "fn_rel_custo_centro_serie",
  "fn_rel_custo_centro_vida",
  "fn_rel_custo_por_mes",
  "fn_rel_custo_por_grupo",
  "fn_rel_custo_itens_oc",
  "fn_rel_custo_receita",
] as const;

/** A única que também conta receita, e por isso corta diferente nos dois lados. */
const A_QUE_TEM_RECEITA = "fn_rel_custo_receita";

const CORTE_DO_CUSTO = /coalesce\(\s*c\w*\.natureza,\s*'operacional'\s*\)\s*<>\s*'movimentacao'/;
const CORTE_SO_OPERACIONAL = /coalesce\(\s*c\w*\.natureza,\s*'operacional'\s*\)\s*=\s*'operacional'/;

/**
 * O corpo da ÚLTIMA definição de cada função, na ordem em que o banco aplica as
 * migrations (nome do arquivo). Ler só a migration nova provaria o arquivo, não
 * o estado: se amanhã alguém escrever outra migration por cima, é ela que vale,
 * e é ela que este teste tem de ler.
 */
function corpoDaUltimaDefinicao(nomeDaFuncao: string): string | null {
  const pasta = path.resolve(__dirname, "../../../../supabase/migrations");
  const abertura = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${nomeDaFuncao}\\s*\\(`,
    "gi",
  );
  let corpo: string | null = null;

  for (const nome of readdirSync(pasta).sort()) {
    const sql = readFileSync(path.join(pasta, nome), "utf8");
    abertura.lastIndex = 0;
    let achado: RegExpExecArray | null;
    while ((achado = abertura.exec(sql)) !== null) {
      // A partir do `create`, a primeira marca de dollar-quote abre o corpo e a
      // próxima igual fecha. Assim vale tanto para `$function$` quanto `$$`.
      const marca = /\$[A-Za-z_]*\$/.exec(sql.slice(achado.index));
      if (!marca) continue;
      const inicio = achado.index + marca.index + marca[0].length;
      const fim = sql.indexOf(marca[0], inicio);
      if (fim === -1) continue;
      corpo = sql.slice(inicio, fim);
    }
  }
  return corpo;
}

describe("corte de natureza da família de custo", () => {
  it.each(FAMILIA_DE_CUSTO)("%s existe nas migrations", (nomeDaFuncao) => {
    expect(
      corpoDaUltimaDefinicao(nomeDaFuncao),
      "função renomeada ou removida? este teste é a lista de quem tem que concordar",
    ).not.toBeNull();
  });

  it.each(FAMILIA_DE_CUSTO)("%s conta tudo menos `movimentacao`", (nomeDaFuncao) => {
    const corpo = corpoDaUltimaDefinicao(nomeDaFuncao) ?? "";
    expect(
      CORTE_DO_CUSTO.test(corpo),
      "o lado do custo tem que cortar por `natureza <> 'movimentacao'`; sem isso esta função para de fechar com as outras seis",
    ).toBe(true);
  });

  it.each(FAMILIA_DE_CUSTO.filter((f) => f !== A_QUE_TEM_RECEITA))(
    "%s não volta a filtrar só `operacional`",
    (nomeDaFuncao) => {
      const corpo = corpoDaUltimaDefinicao(nomeDaFuncao) ?? "";
      expect(
        CORTE_SO_OPERACIONAL.test(corpo),
        "`= 'operacional'` derruba a Tarifa Bancária do custo do Escritório Central de novo (regressão de 28/08/2026)",
      ).toBe(false);
    },
  );

  it("fn_rel_custo_receita corta diferente nos dois lados, e o diz no código", () => {
    const corpo = corpoDaUltimaDefinicao(A_QUE_TEM_RECEITA) ?? "";

    // Custo: igual às outras seis.
    expect(CORTE_DO_CUSTO.test(corpo)).toBe(true);
    // Receita: continua só operacional. Juro recebido e rendimento de aplicação
    // são resultado da EMPRESA, não produção da OBRA — somados na linha de
    // receita, inflariam a margem da obra com dinheiro que a obra não gerou.
    expect(
      CORTE_SO_OPERACIONAL.test(corpo),
      "a receita não pode passar a aceitar natureza `financeira`",
    ).toBe(true);

    // E a assimetria tem que estar declarada, não ser efeito colateral de
    // alguma cláusula solta: o corte pende de `l.tipo`.
    expect(
      /case\s+when\s+l\.tipo\s*=\s*'a_pagar'/i.test(corpo),
      "os dois cortes só são legítimos se estiverem no mesmo `case` sobre l.tipo",
    ).toBe(true);
  });

  it("nenhuma da família ficou sem corte de natureza", () => {
    const semCorte = FAMILIA_DE_CUSTO.filter((nomeDaFuncao) => {
      const corpo = corpoDaUltimaDefinicao(nomeDaFuncao) ?? "";
      return !/natureza/.test(corpo);
    });
    expect(
      semCorte,
      "função de custo sem a palavra `natureza` no corpo conta o principal de empréstimo como custo",
    ).toEqual([]);
  });
});
