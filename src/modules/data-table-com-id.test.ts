import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Toda `<DataTable>` do app passa `idTabela`, e cada id é de uma tabela só.
 *
 * ## Por que este teste existe
 *
 * Sem `idTabela` o DataTable não guarda personalização: a barra de Altura e
 * Colunas some, a largura arrastada volta ao recarregar, a ordem das colunas
 * não fica. Em 12/10/2026 o Tiago pediu que todas as tabelas tivessem o mesmo
 * padrão ajustável, e 11 telas (modelos e obras da Execução, aprovação e
 * revisões da Medição, provisões e faixas de INSS/IRRF) estavam sem. Nada
 * acusava: a tela funciona, só não lembra.
 *
 * O id repetido é o outro lado: duas tabelas diferentes com o mesmo id dividem
 * a largura e a ordem salvas, e uma bagunça a outra. A mesma tabela renderizada
 * em ramos diferentes do mesmo arquivo pode repetir (é a mesma chave de propósito).
 */

const RAIZES = ["src/modules", "src/app"];

function fontes(dir: string): string[] {
  const achados: string[] = [];
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, item.name);
    if (item.isDirectory()) {
      if (item.name === "node_modules") continue;
      achados.push(...fontes(caminho));
    } else if (/\.tsx$/.test(item.name) && !/\.test\.tsx$/.test(item.name)) {
      achados.push(caminho);
    }
  }
  return achados;
}

/** A tag de abertura inteira de cada `<DataTable`, pulando o genérico `<DataTable<T>`. */
function tagsDataTable(fonte: string): { linha: number; tag: string }[] {
  const tags: { linha: number; tag: string }[] = [];
  for (const achado of fonte.matchAll(/<DataTable\b/g)) {
    let i = achado.index + achado[0].length;
    if (fonte[i] === "<") i = fonte.indexOf(">", i) + 1;
    let profundidade = 0;
    for (; i < fonte.length; i++) {
      const c = fonte[i];
      if (c === "{" || c === "(") profundidade++;
      else if (c === "}" || c === ")") profundidade--;
      else if (profundidade === 0 && c === ">") break;
    }
    tags.push({
      linha: fonte.slice(0, achado.index).split("\n").length,
      tag: fonte.slice(achado.index, i),
    });
  }
  return tags;
}

const TABELAS = RAIZES.flatMap(fontes).flatMap((caminho) =>
  tagsDataTable(readFileSync(caminho, "utf8")).map((t) => ({ caminho, ...t })),
);

describe("DataTable do app", () => {
  it("acha as tabelas (o teste não está olhando para o vazio)", () => {
    expect(TABELAS.length).toBeGreaterThan(50);
  });

  it("toda DataTable passa idTabela", () => {
    const sem = TABELAS.filter((t) => !/\bidTabela=/.test(t.tag)).map((t) => `${t.caminho}:${t.linha}`);
    expect(sem).toEqual([]);
  });

  it("nenhum idTabela literal aparece em dois arquivos", () => {
    const arquivosPorId = new Map<string, Set<string>>();
    for (const t of TABELAS) {
      const id = /\bidTabela="([^"]+)"/.exec(t.tag)?.[1];
      if (!id) continue;
      if (!arquivosPorId.has(id)) arquivosPorId.set(id, new Set());
      arquivosPorId.get(id)!.add(t.caminho);
    }
    const repetidos = [...arquivosPorId].filter(([, arquivos]) => arquivos.size > 1).map(([id, arquivos]) => `${id}: ${[...arquivos].join(", ")}`);
    expect(repetidos).toEqual([]);
  });
});
