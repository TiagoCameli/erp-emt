import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Nada que uma Server Action alcance pode ser um módulo `"use client"`.
 *
 * ## Por que este teste existe
 *
 * Next transforma cada export de um módulo `"use client"` numa REFERÊNCIA, não
 * na função. Chamar essa referência no servidor estoura em runtime:
 *
 *   Attempted to call dentroDoPeriodo() from the server but dentroDoPeriodo is
 *   on the client. It's not possible to invoke a client function from the
 *   server.
 *
 * Foi o que derrubou a exportação de Pagamentos em 01/09/2026. O filtro da fila
 * foi movido para um módulo puro para a planilha usar o MESMO recorte da tela — e
 * esse módulo importava `dentroDoPeriodo` de `_shared/filtros-cliente`, que é
 * `"use client"` por causa de um hook que mora ao lado. Na tela funcionava; na
 * Server Action, não.
 *
 * **Nada pegava isso:** o `tsc` não conhece a fronteira, o `vitest` não tem
 * fronteira nenhuma (por isso os 47 testes do módulo passavam), e o `next build`
 * não recusa. Só o clique em produção.
 *
 * `import type` não conta: tipo é apagado na compilação, e uma Server Action
 * pode tipar com o contrato de um componente sem nunca chamá-lo.
 */

const RAIZ = "src";

/** Todo arquivo .ts/.tsx de código (teste não conta) sob `dir`. */
function fontes(dir: string): string[] {
  const achados: string[] = [];
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, item.name);
    if (item.isDirectory()) {
      if (item.name === "node_modules") continue;
      achados.push(...fontes(caminho));
    } else if (/\.tsx?$/.test(item.name) && !/\.test\.tsx?$/.test(item.name)) {
      achados.push(caminho);
    }
  }
  return achados;
}

const TODOS = fontes(RAIZ);
const CONTEUDO = new Map(TODOS.map((c) => [c, readFileSync(c, "utf8")]));

/** A primeira linha não-vazia é a diretiva, quando existe. */
function temDiretiva(caminho: string, diretiva: string): boolean {
  const fonte = CONTEUDO.get(caminho) ?? "";
  return new RegExp(`^\\s*["']${diretiva}["']`).test(fonte);
}

/** Resolve um caminho de import para um arquivo do projeto, ou null. */
function resolverImport(deOndeVem: string, especificador: string): string | null {
  const base = especificador.startsWith("@/")
    ? join(RAIZ, especificador.slice(2))
    : especificador.startsWith(".")
      ? resolve(dirname(deOndeVem), especificador)
      : null;
  if (base === null) return null;

  const relativo = relative(process.cwd(), base);
  for (const tentativa of [
    `${relativo}.ts`,
    `${relativo}.tsx`,
    join(relativo, "index.ts"),
    join(relativo, "index.tsx"),
  ]) {
    if (CONTEUDO.has(tentativa)) return tentativa;
  }
  return null;
}

/**
 * Os arquivos do projeto que este importa em RUNTIME.
 *
 * `import type { X } from "..."` fica de fora: o import é apagado na compilação,
 * então ele não cria dependência de runtime nenhuma. Um `import { type X }`
 * misturado com valor continua contando, e está certo — o valor vem junto.
 *
 * `await import("...")` CONTA, e é o que faltava na primeira versão deste teste.
 * O buraco era logo onde o defeito mora: a action da planilha carrega o módulo
 * do exceljs por import dinâmico (para não pendurar a biblioteca em toda action
 * do arquivo), e um `"use client"` alcançado por ali estouraria exatamente do
 * mesmo jeito — com o teste passando.
 */
function importesDeRuntime(caminho: string): string[] {
  const fonte = CONTEUDO.get(caminho) ?? "";
  const achados: string[] = [];

  const ESTATICO = /^\s*import\s+(type\s+)?([\s\S]*?)from\s+["']([^"']+)["']/gm;
  for (const achou of fonte.matchAll(ESTATICO)) {
    const [, ehTipo, , especificador] = achou;
    if (ehTipo) continue;
    const alvo = resolverImport(caminho, especificador);
    if (alvo) achados.push(alvo);
  }

  // `import("...")` com literal. Import dinâmico de caminho montado em variável
  // não dá para seguir estaticamente — e também não existe neste app.
  const DINAMICO = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
  for (const achou of fonte.matchAll(DINAMICO)) {
    const alvo = resolverImport(caminho, achou[1]);
    if (alvo) achados.push(alvo);
  }

  return achados;
}

/** Caminho de import (arquivo por arquivo) do servidor até um `"use client"`. */
function caminhoAteOCliente(inicio: string): string[] | null {
  const vistos = new Set<string>([inicio]);
  const fila: string[][] = [[inicio]];

  while (fila.length > 0) {
    const trilha = fila.shift() as string[];
    const atual = trilha[trilha.length - 1];
    for (const vizinho of importesDeRuntime(atual)) {
      if (vistos.has(vizinho)) continue;
      vistos.add(vizinho);
      const trilhaNova = [...trilha, vizinho];
      if (temDiretiva(vizinho, "use client")) return trilhaNova;
      fila.push(trilhaNova);
    }
  }
  return null;
}

const ARQUIVOS_USE_SERVER = TODOS.filter((c) =>
  temDiretiva(c, "use server"),
).sort();

describe("nada que o servidor alcança é 'use client'", () => {
  it("acha os arquivos 'use server' (senão o teste não prova nada)", () => {
    // Sem esta asserção, uma varredura vazia faria o teste abaixo passar sem
    // verificar UM arquivo.
    expect(ARQUIVOS_USE_SERVER.length).toBeGreaterThanOrEqual(5);
    expect(ARQUIVOS_USE_SERVER).toContain(
      join("src", "modules", "financeiro", "pagamentos", "actions.ts"),
    );
  });

  it("segue import DINÂMICO, não só o estático", () => {
    // A action da planilha carrega o módulo do exceljs por `await import` para
    // não pendurar a biblioteca em toda action do arquivo. Se o passeio não
    // entrasse ali, o teste passaria justamente no caminho onde o defeito mora.
    const daAction = importesDeRuntime(
      join("src", "modules", "financeiro", "pagamentos", "actions.ts"),
    );
    expect(daAction).toContain(
      join("src", "modules", "financeiro", "pagamentos", "planilha.ts"),
    );
  });

  it("enxerga um 'use client' quando ele existe (senão não acusaria nada)", () => {
    // A trava contra o teste que passa por não estar olhando: um módulo que
    // sabidamente é `"use client"` tem que ser detectado como tal.
    expect(temDiretiva(join("src", "modules", "_shared", "filtros-cliente.ts"), "use client")).toBe(
      true,
    );
  });

  it.each(ARQUIVOS_USE_SERVER)("%s não alcança nenhum 'use client'", (arquivo) => {
    const trilha = caminhoAteOCliente(arquivo);
    expect(
      trilha,
      trilha === null
        ? ""
        : `Server Action alcança um módulo "use client". Chamar função de lá no ` +
          `servidor estoura em runtime, e nada além do clique pega isso.\n  ` +
          trilha.join("\n    -> "),
    ).toBeNull();
  });
});
