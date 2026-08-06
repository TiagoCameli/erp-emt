import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  chaveFiltroSessao,
  filtrosLembraveis,
  lerFiltroSessao,
  lerQuerySessao,
  limparFiltrosSessao,
  salvarFiltroSessao,
  salvarQuerySessao,
} from "@/components/canonicos/filtros-sessao";

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("chave", () => {
  it("inclui a rota, porque 'status' existe em dezenas de telas", () => {
    expect(chaveFiltroSessao("/financeiro/lancamentos", "status")).not.toBe(
      chaveFiltroSessao("/cadastros/categorias", "status"),
    );
  });
});

describe("lembrar um filtro", () => {
  it("devolve null quando nada foi escrito nesta sessão", () => {
    expect(lerFiltroSessao("/financeiro/lancamentos", "status")).toBeNull();
  });

  it("devolve o que foi escolhido", () => {
    salvarFiltroSessao("/financeiro/lancamentos", "status", "a_pagar");
    expect(lerFiltroSessao("/financeiro/lancamentos", "status")).toBe("a_pagar");
  });

  it("não vaza entre rotas", () => {
    salvarFiltroSessao("/financeiro/lancamentos", "status", "a_pagar");
    expect(lerFiltroSessao("/compras/ordens", "status")).toBeNull();
  });

  it("guarda string vazia, porque limpar o filtro é uma escolha", () => {
    // Se vazio virasse "nada salvo", o padrão da tela voltaria na próxima visita
    // e o filtro que o usuário acabou de tirar reapareceria sozinho.
    salvarFiltroSessao("/cadastros/categorias", "status", "");
    expect(lerFiltroSessao("/cadastros/categorias", "status")).toBe("");
  });
});

describe("filtrosLembraveis", () => {
  it("descarta a página: é posição de leitura, não critério", () => {
    expect(filtrosLembraveis("status=a_pagar&pagina=7")).toBe("status=a_pagar");
  });

  it("ordena, para a comparação não depender da ordem dos cliques", () => {
    expect(filtrosLembraveis("obra=9&busca=brita")).toBe(
      filtrosLembraveis("busca=brita&obra=9"),
    );
  });

  it("query só de página vira vazia", () => {
    expect(filtrosLembraveis("pagina=3")).toBe("");
  });

  it("preserva valor com acento e espaço", () => {
    const query = filtrosLembraveis("busca=cimento+CP+II&obra=BR-364+L09");
    expect(new URLSearchParams(query).get("busca")).toBe("cimento CP II");
    expect(new URLSearchParams(query).get("obra")).toBe("BR-364 L09");
  });
});

describe("query da rota (filtros que vivem na URL)", () => {
  it("grava sem a página e devolve na leitura", () => {
    salvarQuerySessao("/financeiro/lancamentos", "status=a_pagar&pagina=4");
    expect(lerQuerySessao("/financeiro/lancamentos")).toBe("status=a_pagar");
  });

  it("query vazia é gravada, e sinaliza 'eu limpei'", () => {
    salvarQuerySessao("/financeiro/lancamentos", "");
    expect(lerQuerySessao("/financeiro/lancamentos")).toBe("");
  });
});

describe("limparFiltrosSessao", () => {
  it("apaga filtro de todas as rotas", () => {
    salvarFiltroSessao("/financeiro/lancamentos", "status", "a_pagar");
    salvarFiltroSessao("/compras/ordens", "situacao", "aprovada");
    salvarQuerySessao("/cadastros/insumos", "busca=brita");

    limparFiltrosSessao();

    expect(lerFiltroSessao("/financeiro/lancamentos", "status")).toBeNull();
    expect(lerFiltroSessao("/compras/ordens", "situacao")).toBeNull();
    expect(lerQuerySessao("/cadastros/insumos")).toBeNull();
  });

  it("não encosta no que não é nosso", () => {
    // Máquina de escritório com o app e outra coisa aberta na mesma origem.
    window.sessionStorage.setItem("outra-coisa", "preservar");
    salvarFiltroSessao("/compras/ordens", "situacao", "aprovada");

    limparFiltrosSessao();

    expect(window.sessionStorage.getItem("outra-coisa")).toBe("preservar");
  });
});

describe("armazenamento indisponível", () => {
  it("navegação privada que lança no acesso não derruba a tela", () => {
    const espiao = vi
      .spyOn(window.sessionStorage, "setItem")
      .mockImplementation(() => {
        throw new DOMException("QuotaExceededError");
      });

    expect(() =>
      salvarFiltroSessao("/financeiro/lancamentos", "status", "a_pagar"),
    ).not.toThrow();

    espiao.mockRestore();
  });

  it("leitura que lança devolve null em vez de estourar", () => {
    const espiao = vi
      .spyOn(window.sessionStorage, "getItem")
      .mockImplementation(() => {
        throw new DOMException("SecurityError");
      });

    expect(lerFiltroSessao("/financeiro/lancamentos", "status")).toBeNull();

    espiao.mockRestore();
  });
});
