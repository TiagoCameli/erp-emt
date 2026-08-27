import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Cobertura do "Limpar filtros" no APP INTEIRO, lida do código-fonte.
 *
 * O botão mora nos dois hosts canônicos de filtro, então ele aparece sozinho em
 * toda tela que passa por eles. O que NÃO é automático é a tela cujos filtros
 * vivem na URL: ela precisa passar `onLimparFiltros`, porque limpar um filtro por
 * vez faz a segunda escrita desfazer a primeira (ver a LIMITAÇÃO em
 * `use-filtros-url.test.tsx`). Foi esse esquecimento que deixou a primeira versão
 * limpando a busca e devolvendo o status.
 *
 * Este teste é a rede para a tela NOVA: quem criar uma listagem com filtro na URL
 * e esquecer o `onLimparFiltros` descobre aqui, e não em produção.
 */

/**
 * Arquivos de TELA que declaram filtros para um host canônico.
 *
 * O `.test.tsx` fica de fora: um teste que renderiza uma barra de filtros escreve
 * `filtros={...}` igual a uma tela, mas não é uma — ele não tem host nem botão
 * para cobrir, e cobrá-lo aqui obrigaria a torcer o teste (espalhar props num
 * objeto só para escapar do grep) em vez de corrigir a pergunta.
 */
function arquivosComFiltro(): string[] {
  return execFileSync(
    "grep",
    ["-rl", "filtros={", "src/modules", "--include=*.tsx"],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .filter((arquivo) => !arquivo.endsWith(".test.tsx"))
    .sort();
}

const HOSTS = /<DataTable|BarraFiltrosConfiguravel/;

describe("cobertura do Limpar filtros", () => {
  const arquivos = arquivosComFiltro();

  it("existe tela com filtro para cobrir (o grep não silenciou)", () => {
    // Sem isto, um grep que passou a não achar nada faria os testes abaixo
    // passarem por vacuidade, dizendo "cobertura total" sobre lista vazia.
    expect(arquivos.length).toBeGreaterThan(30);
  });

  it("toda tela com filtro passa por um host canônico", () => {
    // Host canônico é o que traz o botão. Filtro montado fora deles ficaria sem
    // "Limpar filtros" e ninguém notaria até alguém reclamar.
    const semHost = arquivos.filter(
      (arquivo) => !HOSTS.test(readFileSync(arquivo, "utf8")),
    );
    expect(semHost).toEqual([]);
  });

  it("toda tela com filtro na URL passa onLimparFiltros", () => {
    const faltando = arquivos.filter((arquivo) => {
      const texto = readFileSync(arquivo, "utf8");
      if (!texto.includes("useFiltrosUrl")) return false;
      if (!HOSTS.test(texto)) return false;
      return !texto.includes("onLimparFiltros");
    });
    expect(faltando).toEqual([]);
  });

  it("todo filtro de busca declara temValor e onLimpar", () => {
    // Sem os dois, o botão limpa os seletores e deixa o texto da busca filtrando,
    // com a tela afirmando que limpou.
    const faltando: string[] = [];
    for (const arquivo of arquivos) {
      const texto = readFileSync(arquivo, "utf8");
      let de = 0;
      while (true) {
        const inicio = texto.indexOf('id: "busca"', de);
        if (inicio < 0) break;
        // Janela até o filtro seguinte: janela de tamanho fixo vaza para o bloco
        // de baixo e o teste passa achando que a busca está resolvida.
        const proximo = texto.indexOf('id: "', inicio + 5);
        const bloco = texto.slice(inicio, proximo > 0 ? proximo : texto.length);
        if (!bloco.includes("temValor") || !bloco.includes("onLimpar")) {
          faltando.push(arquivo);
        }
        de = inicio + 5;
      }
    }
    expect(faltando).toEqual([]);
  });
});
