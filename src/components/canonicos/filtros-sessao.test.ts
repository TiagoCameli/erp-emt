import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  assinarFiltrosSessao,
  chaveFiltroSessao,
  filtrosLembraveis,
  lerFiltroSessao,
  lerQuerySessao,
  limparFiltrosDaRota,
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

describe("limparFiltrosDaRota", () => {
  it("apaga os filtros da rota e deixa as outras rotas em paz", () => {
    salvarFiltroSessao("/cadastros/obras", "busca", "PONTE");
    salvarFiltroSessao("/cadastros/obras", "uf", "AC");
    salvarFiltroSessao("/cadastros/clientes", "busca", "EMT");

    limparFiltrosDaRota("/cadastros/obras");

    expect(lerFiltroSessao("/cadastros/obras", "busca")).toBeNull();
    expect(lerFiltroSessao("/cadastros/obras", "uf")).toBeNull();
    // O filtro da OUTRA tela sobrevive: "Limpar filtros" é da tela onde a pessoa
    // clicou, e levar tudo faria ela perder o recorte de uma tela que nem está
    // aberta.
    expect(lerFiltroSessao("/cadastros/clientes", "busca")).toBe("EMT");
  });

  it("NÃO mexe na query da rota, que é da família da URL", () => {
    // Quem manda no `__query__` é o `salvarQuerySessao`, que o `limparTodos`
    // chama em seguida para gravar "eu limpei". Apagar aqui faria a ordem das
    // duas chamadas importar, e um dia alguém trocaria a ordem.
    salvarQuerySessao("/financeiro/lancamentos", "status=a_pagar");
    salvarFiltroSessao("/financeiro/lancamentos", "busca", "pneu");

    limparFiltrosDaRota("/financeiro/lancamentos");

    expect(lerFiltroSessao("/financeiro/lancamentos", "busca")).toBeNull();
    expect(lerQuerySessao("/financeiro/lancamentos")).toBe("status=a_pagar");
  });

  it("avisa quem está ouvindo, senão a tela não reage", () => {
    // É o aviso que faz o `useFiltroSessao` reler a loja. Sem ele o filtro sai
    // do armazenamento e continua desenhado na tela.
    salvarFiltroSessao("/cadastros/obras", "busca", "PONTE");
    const ouvinte = vi.fn();
    const cancelar = assinarFiltrosSessao(ouvinte);

    limparFiltrosDaRota("/cadastros/obras");

    expect(ouvinte).toHaveBeenCalled();
    cancelar();
  });

  it("rota sem filtro guardado não quebra nada", () => {
    salvarFiltroSessao("/cadastros/clientes", "busca", "EMT");

    limparFiltrosDaRota("/rh/ferias");

    expect(lerFiltroSessao("/cadastros/clientes", "busca")).toBe("EMT");
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
