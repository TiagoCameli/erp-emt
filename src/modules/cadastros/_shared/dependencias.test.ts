import { describe, expect, it } from "vitest";

import {
  CODIGOS_BLOQUEIO_CENTRO,
  CODIGOS_BLOQUEIO_OBRA,
  codigoBloqueio,
  motivoBloqueioCentroCusto,
  motivoBloqueioObra,
} from "@/modules/cadastros/_shared/dependencias";

describe("codigoBloqueio", () => {
  it("extrai o código da mensagem que a função do banco estoura", () => {
    expect(codigoBloqueio("Obra nao pode ser excluida (tem_filhos)")).toBe(
      "tem_filhos",
    );
    expect(
      codigoBloqueio("Centro de custo nao pode ser excluido (raiz_de_obra)"),
    ).toBe("raiz_de_obra");
  });

  it("ignora espaço em branco no fim", () => {
    expect(codigoBloqueio("... excluida (em_uso)  ")).toBe("em_uso");
  });

  it("devolve null quando o erro veio de outra causa", () => {
    expect(codigoBloqueio("Informe o motivo da exclusao")).toBeNull();
    expect(codigoBloqueio("permission denied for table obras")).toBeNull();
    expect(codigoBloqueio(undefined)).toBeNull();
  });

  it("não confunde parênteses no meio da frase", () => {
    expect(codigoBloqueio("erro (algo) no meio da frase")).toBeNull();
  });

  it("encadeado com o tradutor, vira texto pt-BR", () => {
    const codigo = codigoBloqueio("Obra nao pode ser excluida (centro_em_uso)");
    expect(motivoBloqueioObra(codigo)).toContain("custo lançado");
  });
});

describe("motivoBloqueioObra", () => {
  it("null (banco liberou) significa que pode excluir", () => {
    expect(motivoBloqueioObra(null)).toBeNull();
  });

  it("traduz todos os códigos que o banco devolve", () => {
    for (const codigo of CODIGOS_BLOQUEIO_OBRA) {
      const motivo = motivoBloqueioObra(codigo);
      expect(motivo, `código ${codigo}`).toBeTruthy();
      expect(motivo).not.toBe("Este registro não pode ser excluído");
    }
  });

  it("aponta a etapa/item como causa quando o centro tem filhos", () => {
    expect(motivoBloqueioObra("tem_filhos")).toContain("etapas ou itens");
  });

  it("diferencia obra em uso de centro de custo em uso", () => {
    expect(motivoBloqueioObra("em_uso")).toContain("colaborador");
    expect(motivoBloqueioObra("centro_em_uso")).toContain("custo lançado");
  });

  it("cai no texto genérico para código desconhecido, sem quebrar", () => {
    expect(motivoBloqueioObra("codigo_que_nao_existe")).toBe(
      "Este registro não pode ser excluído",
    );
  });
});

describe("motivoBloqueioCentroCusto", () => {
  it("null (banco liberou) significa que pode excluir", () => {
    expect(motivoBloqueioCentroCusto(null)).toBeNull();
  });

  it("traduz todos os códigos que o banco devolve", () => {
    for (const codigo of CODIGOS_BLOQUEIO_CENTRO) {
      const motivo = motivoBloqueioCentroCusto(codigo);
      expect(motivo, `código ${codigo}`).toBeTruthy();
      expect(motivo).not.toBe("Este registro não pode ser excluído");
    }
  });

  it("manda excluir pela obra quando é o centro raiz dela", () => {
    expect(motivoBloqueioCentroCusto("raiz_de_obra")).toContain("Exclua a obra");
  });

  it("protege centro de custo do sistema", () => {
    expect(motivoBloqueioCentroCusto("sistema")).toContain("sistema");
  });

  it("cai no texto genérico para código desconhecido, sem quebrar", () => {
    expect(motivoBloqueioCentroCusto("outro_codigo")).toBe(
      "Este registro não pode ser excluído",
    );
  });
});
