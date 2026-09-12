import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

import { describe, expect, it } from "vitest";

/**
 * `"use client"` tem que ser a PRIMEIRA coisa do arquivo, antes de qualquer
 * import. Com uma linha acima dela, o Turbopack recusa o arquivo inteiro:
 *
 *   The "use client" directive must be placed before other expressions.
 *
 * E aí o componente passa a ser tratado como Server Component, o que derruba
 * tudo que ele importa e usa `useRouter`, `useState` e afins.
 *
 * Isto NÃO é pego pelo `tsc`: só o bundler reclama. Custou um build vermelho
 * na Vercel em 12/09/2026, quando um script acrescentou um import no topo de
 * dois arquivos de Compras e empurrou a diretiva para a segunda linha.
 *
 * O teste varre o projeto inteiro em vez de uma lista fixa, porque o erro é
 * de posição e pode nascer em qualquer arquivo que alguém edite.
 */
describe('"use client" no topo', () => {
  const raiz = process.cwd();

  /**
   * Arquivos rastreados pelo git em que a diretiva aparece como DIRETIVA:
   * uma linha inteira, na coluna 1. Buscar a string solta traria junto quem só
   * a menciona num comentário ou num teste sobre ela.
   */
  const arquivos = execSync(
    `git grep -lE '^"use client";?$' -- 'src/*.ts' 'src/*.tsx'`,
    { cwd: raiz, encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean);

  it("encontra arquivos com a diretiva (senão o teste não está olhando nada)", () => {
    // Linha de controle: se o git grep mudar de comportamento, o teste abaixo
    // passaria vazio e não provaria coisa nenhuma.
    expect(arquivos.length).toBeGreaterThan(20);
  });

  it.each(arquivos)("%s começa com a diretiva", (arquivo) => {
    const fonte = readFileSync(join(raiz, arquivo), "utf8");

    // Ignora comentário de licença/topo e linhas em branco antes da diretiva:
    // o que não pode é CÓDIGO antes dela.
    const primeiraLinhaDeCodigo = fonte
      .split("\n")
      .map((linha) => linha.trim())
      .find(
        (linha) =>
          linha !== "" && !linha.startsWith("//") && !linha.startsWith("/*") &&
          !linha.startsWith("*"),
      );

    expect(primeiraLinhaDeCodigo).toMatch(/^["']use client["'];?$/);
  });
});
