import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Toda página que hospeda uma Server Action de EXPORTAR precisa declarar
 * `maxDuration`.
 *
 * ## Por que este teste existe
 *
 * A Server Action roda na função serverless DA PÁGINA, não numa função própria.
 * Exportar é ler milhares de linhas em páginas e montar o arquivo na memória, e
 * com o teto padrão da Vercel (10 a 15s) a função morre no meio — devolvendo
 * erro em vez do arquivo. `/financeiro/lancamentos` já sabia disso e declara
 * `maxDuration = 60` com o motivo escrito ao lado.
 *
 * Em 01/09/2026 a exportação de Pagamentos nasceu sem a declaração e falhou na
 * primeira vez que o Tiago clicou. Nada apontou para a causa: o build passou, os
 * 2.819 testes passaram, e a Vercel aqui é plano hobby — não há log de aplicação
 * para consultar. A ligação entre "esta página ganhou um export" e "esta página
 * precisa de maxDuration" só existia na cabeça de quem tinha escrito a outra.
 *
 * ## Como ele decide
 *
 * Segue o SÍMBOLO, não o módulo: acha quem importa `gerarPlanilhaX` (o botão de
 * exportar) e sobe pelos imports até a página que o renderiza. Perseguir o
 * `actions.ts` inteiro cobraria de toda página que usa qualquer action daquele
 * módulo — `/financeiro/lancamentos/[id]` seria acusada por causa de um botão
 * que não está nela, e alarme falso ensina a ignorar o teste.
 */

const RAIZ = "src";

/** Nome de Server Action que exporta arquivo. Sem flag `g`: `test` é stateful. */
const NOME_DE_EXPORT = /^\s*export async function (gerar(?:Planilha|Pdf)\w*)/;

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

const ehPagina = (caminho: string) =>
  caminho.startsWith(join("src", "app")) && /[\\/]page\.tsx$/.test(caminho);

/** Os nomes de action de exportar declarados no arquivo. */
function exportsDeExportar(caminho: string): string[] {
  const nomes: string[] = [];
  for (const linha of (CONTEUDO.get(caminho) ?? "").split("\n")) {
    const achou = NOME_DE_EXPORT.exec(linha);
    if (achou) nomes.push(achou[1]);
  }
  return nomes;
}

/** Arquivos que importam este arquivo, por apelido `@/` ou caminho relativo. */
function quemImporta(alvo: string): string[] {
  const apelido = `@/${relative(RAIZ, alvo).replace(/\\/g, "/").replace(/\.tsx?$/, "")}`;
  const nomeSolto = `./${apelido.split("/").pop()}`;
  return TODOS.filter((c) => {
    if (c === alvo) return false;
    const fonte = CONTEUDO.get(c) ?? "";
    return fonte.includes(`"${apelido}"`) || fonte.includes(`"${nomeSolto}"`);
  });
}

/**
 * As páginas que renderizam (direta ou indiretamente) o arquivo dado.
 *
 * Neste app o caminho é `page -> botão` ou `page -> cliente -> botão`. O teto de
 * níveis existe para o passeio não pendurar num ciclo de imports.
 */
function paginasQueRenderizam(inicio: string): string[] {
  const paginas = new Set<string>();
  const vistos = new Set<string>([inicio]);
  let fronteira = [inicio];

  for (let nivel = 0; nivel < 5 && fronteira.length > 0; nivel += 1) {
    const proxima: string[] = [];
    for (const arquivo of fronteira) {
      for (const importador of quemImporta(arquivo)) {
        if (vistos.has(importador)) continue;
        vistos.add(importador);
        // A página é o topo: quem importa a página não interessa.
        if (ehPagina(importador)) paginas.add(importador);
        else proxima.push(importador);
      }
    }
    fronteira = proxima;
  }
  return [...paginas].sort();
}

/** Cada botão de exportar: o arquivo que importa o nome da action. */
const BOTOES_DE_EXPORTAR = TODOS.flatMap((actions) => {
  if (!/actions\.ts$/.test(actions)) return [];
  const nomes = exportsDeExportar(actions);
  if (nomes.length === 0) return [];
  return quemImporta(actions)
    .filter((c) => nomes.some((nome) => (CONTEUDO.get(c) ?? "").includes(nome)))
    .map((botao) => ({ botao, actions }));
}).sort((a, b) => a.botao.localeCompare(b.botao));

describe("maxDuration de quem exporta", () => {
  it("acha os botões de exportar (senão o teste não prova nada)", () => {
    // Sem esta asserção, uma varredura que devolvesse lista vazia faria o teste
    // abaixo passar sem verificar UMA página.
    const arquivos = BOTOES_DE_EXPORTAR.map((b) => b.botao);
    expect(arquivos.length).toBeGreaterThanOrEqual(2);
    expect(arquivos).toContain(
      join(
        "src",
        "modules",
        "financeiro",
        "pagamentos",
        "components",
        "botao-exportar-pagamentos.tsx",
      ),
    );
  });

  it("acha a página de cada botão (senão não cobra de ninguém)", () => {
    // A mesma armadilha, um nível acima: se o passeio de imports não achasse
    // página nenhuma, o teste abaixo passaria em silêncio.
    const semPagina = BOTOES_DE_EXPORTAR.filter(
      (b) => paginasQueRenderizam(b.botao).length === 0,
    ).map((b) => b.botao);
    expect(semPagina).toEqual([]);
  });

  it.each(BOTOES_DE_EXPORTAR.map((b) => b.botao))(
    "a página que renderiza %s declara maxDuration",
    (botao) => {
      for (const pagina of paginasQueRenderizam(botao)) {
        expect(
          /export const maxDuration = \d+/.test(CONTEUDO.get(pagina) ?? ""),
          `${pagina} renderiza ${botao} e não declara maxDuration. Com o teto ` +
            `padrão da Vercel (10 a 15s) a função morre no meio da leitura e ` +
            `devolve erro em vez do arquivo.`,
        ).toBe(true);
      }
    },
  );
});
