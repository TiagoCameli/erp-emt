import { describe, expect, it } from "vitest";

import { cn } from "./utils";

/**
 * O tailwind-merge não conhece o tema do projeto: sem configuração ele trata
 * `text-detalhe` como cor e descarta o tamanho quando uma cor vem depois. O
 * estrago é silencioso (o texto só cai no tamanho herdado), então quem protege é
 * este teste, não o olho de quem revisa.
 */
describe("cn com os tamanhos do design system", () => {
  it("mantém tamanho E cor quando os dois vêm juntos", () => {
    // Era o caso do cabeçalho das tabelas: renderizava 14px ao lado de células
    // de 13px porque o tamanho era descartado.
    expect(cn("text-detalhe", "text-muted-foreground")).toBe(
      "text-detalhe text-muted-foreground",
    );
    expect(cn("text-legenda", "text-foreground")).toBe(
      "text-legenda text-foreground",
    );
    expect(cn("text-secao", "text-status-aprovado")).toBe(
      "text-secao text-status-aprovado",
    );
  });

  it("o último tamanho ainda vence o anterior", () => {
    expect(cn("text-detalhe", "text-legenda")).toBe("text-legenda");
    // Token do tema e tamanho do Tailwind são o mesmo grupo: um substitui o outro.
    expect(cn("text-sm", "text-detalhe")).toBe("text-detalhe");
    expect(cn("text-detalhe", "text-sm")).toBe("text-sm");
  });

  it("a última cor ainda vence a anterior", () => {
    expect(cn("text-foreground", "text-muted-foreground")).toBe(
      "text-muted-foreground",
    );
  });

  it("não quebra o que o tailwind-merge já resolvia sozinho", () => {
    expect(cn("text-sm", "text-lg")).toBe("text-lg");
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("flex", false && "hidden", "gap-2")).toBe("flex gap-2");
  });

  it("cobre todos os tamanhos do tema, não só os que alguém lembrou", () => {
    // Se entrar um --text-novo no globals.css sem entrar na lista do cn, o
    // tamanho some em silêncio. Este caso é o lembrete.
    for (const tamanho of ["titulo", "secao", "corpo", "detalhe", "legenda"]) {
      expect(cn(`text-${tamanho}`, "text-muted-foreground")).toBe(
        `text-${tamanho} text-muted-foreground`,
      );
    }
  });
});
