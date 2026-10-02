import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

/**
 * Tabela do boletim com o contrato K da prova da Task 3 (sem_arredondar), até a 2ª. Os números
 * são os que a RPC devolveu na prova: a tela só formata o texto (D7), nunca soma.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/medicao/boletim",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

import { limparEstadosTabelaParaTeste } from "@/components/canonicos/data-table";
import { BoletimTabela } from "@/modules/medicao/boletim/components/boletim-tabela";
import type { Boletim, LinhaBoletim } from "@/modules/medicao/boletim/tipos";

function linha(
  id: string, ordem: number, codigo: string, pai_id: string | null, tipo: "titulo" | "servico",
  preco: string | null, qtd: string | null, qtds: Record<string, string>,
  previsto: string, valor: string, acumulado: string, saldo: string, pct: string, pctAMedir: string,
): LinhaBoletim {
  return {
    id, ordem, codigo, pai_id, nivel: codigo.split(".").length, descricao: `Serviço número ${ordem}`,
    unidade: tipo === "servico" ? "m3" : null, tipo, item_id: `i${id}`, preco_unitario: preco, quantidade_prevista: qtd,
    qtds, previsto, valor_medicao: valor, acumulado, saldo, pct_executado: pct, pct_a_medir: pctAMedir,
    reajuste_medicao: "0", reajuste_acumulado: "0",
  };
}

function boletimK(over: Partial<Boletim> = {}): Boletim {
  return {
    contrato: { id: "k", codigo: "K", nome_obra: "Obra K", numero_contrato: "1/2026", contratante_nome: "Cliente", regra_arredondamento: "sem_arredondar" },
    versao: { id: "v0", numero: 0, vigente_desde: "2026-01-01" },
    ate: 2,
    medicoes: [
      { id: "m1", numero: 1, periodo_inicio: "2026-01-01", periodo_fim: "2026-01-31", status: "aberta", valor: "50.51", reajuste: null, reajuste_situacao: null },
      { id: "m2", numero: 2, periodo_inicio: "2026-02-01", periodo_fim: "2026-02-28", status: "aberta", valor: "10.51", reajuste: null, reajuste_situacao: null },
    ],
    linhas: [
      linha("1", 1, "01", null, "titulo", null, null, {}, "22.02", "10.51", "11.01", "11.01", "0.5000", "0.5000"),
      linha("2", 2, "01.01", "1", "servico", "0.335", "3", { "1": "1.5", "2": "1.5" }, "1.01", "0.50", "1.01", "0.00", "1.0000", "0.0000"),
      linha("3", 3, "01.02", "1", "servico", "0.335", "3", {}, "1.01", "0.00", "0.00", "1.01", "0.0000", "1.0000"),
      linha("4", 4, "01.02.01", "3", "servico", "10.004", "2", { "2": "1" }, "20.01", "10.00", "10.00", "10.01", "0.4998", "0.5002"),
      linha("5", 5, "02", null, "titulo", null, null, {}, "101.01", "0.00", "50.00", "51.01", "0.4950", "0.5050"),
      linha("6", 6, "02.01", "5", "servico", "100.005", "1", { "1": "0.5" }, "100.01", "0.00", "50.00", "50.01", "0.4999", "0.5001"),
      linha("7", 7, "02.01", "5", "servico", "1", "1", {}, "1.00", "0.00", "0.00", "1.00", "0.0000", "1.0000"),
    ],
    fora_da_versao: [],
    total: {
      previsto: "123.02", valor_medicao: "10.51", acumulado: "61.01", saldo: "62.01",
      pct_executado: "0.49593561981791578605", pct_a_medir: "0.50406438018208421395",
      reajuste_medicao: "0", reajuste_acumulado: "0",
    },
    ...over,
  };
}

afterEach(cleanup);
afterEach(limparEstadosTabelaParaTeste);

/** Normaliza o espaço fino/inseparável que o Intl põe no "R$ 0,50". */
function texto(el: Element | null | undefined): string {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function linhaDoCodigo(codigo: string, indice = 0): HTMLElement {
  const linhas = screen
    .getAllByRole("row")
    .filter((tr) => texto(tr.querySelector('[data-coluna="item"]')) === codigo);
  expect(linhas.length).toBeGreaterThan(indice);
  return linhas[indice];
}

function celula(tr: HTMLElement, coluna: string): string {
  return texto(tr.querySelector(`[data-coluna="${coluna}"]`));
}

/**
 * L09 até a 4ª, com o relatório SIAC da 4ª gravado (prova 6h da Task 1): grupo 04 = −48.781,32,
 * 04.03.02 = −95.030,34 e o total −40.021,28. O total não é a soma das linhas daqui de propósito.
 */
function boletimL09(): Boletim {
  const base = boletimK();
  const m = (numero: number, inicio: string, fim: string, reajuste: string | null, situacao: string | null) => ({
    id: `l09m${numero}`, numero, periodo_inicio: inicio, periodo_fim: fim, status: "aprovada", valor: "1.00",
    reajuste, reajuste_situacao: situacao,
  });
  return {
    ...base,
    contrato: { ...base.contrato, id: "l09", codigo: "L09", nome_obra: "BR-364 Lote 09", regra_arredondamento: "dnit" },
    ate: 4,
    medicoes: [
      m(1, "2025-10-01", "2025-10-31", null, null),
      m(2, "2025-11-01", "2025-11-30", null, null),
      m(3, "2026-01-01", "2026-01-31", null, null),
      m(4, "2026-02-01", "2026-02-28", "-40021.28", "definitivo"),
    ],
    linhas: [
      { ...linha("40", 1, "04", null, "titulo", null, null, {}, "100.00", "10.00", "50.00", "50.00", "0.5", "0.5"), reajuste_medicao: "-48781.32", reajuste_acumulado: "-48781.32" },
      { ...linha("41", 2, "04.03.02", "40", "servico", "95.54", "10", { "4": "1" }, "100.00", "10.00", "50.00", "50.00", "0.5", "0.5"), reajuste_medicao: "-95030.34", reajuste_acumulado: "-95030.34" },
    ],
    total: { ...base.total, reajuste_medicao: "-40021.28", reajuste_acumulado: "-40021.28" },
  };
}

describe("BoletimTabela, reajuste (Fase 6)", () => {
  it("colunas Reajuste na 4ª e Reajuste acumulado depois de % a Medir", () => {
    const { container } = render(<BoletimTabela boletim={boletimL09()} grupoId="" />);
    const ids = [...container.querySelectorAll("thead th[data-coluna]")].map((th) => th.getAttribute("data-coluna"));
    expect(ids.slice(ids.indexOf("pct_a_medir"), ids.indexOf("pct_a_medir") + 3)).toEqual(["pct_a_medir", "reajuste_medicao", "reajuste_acumulado"]);
    expect(texto(container.querySelector('th[data-coluna="reajuste_medicao"]'))).toBe("Reajuste na 4ª");
    expect(texto(container.querySelector('th[data-coluna="reajuste_acumulado"]'))).toBe("Reajuste acumulado");
  });

  it("linha 04 do L09 até a 4ª mostra -R$ 48.781,32, em negrito por ser título", () => {
    render(<BoletimTabela boletim={boletimL09()} grupoId="" />);
    const tr = linhaDoCodigo("04");
    expect(celula(tr, "reajuste_medicao")).toBe("-R$ 48.781,32");
    expect(celula(tr, "reajuste_acumulado")).toBe("-R$ 48.781,32");
    expect(tr.querySelector('[data-coluna="reajuste_acumulado"] .font-semibold')).not.toBeNull();
    expect(celula(linhaDoCodigo("04.03.02"), "reajuste_medicao")).toBe("-R$ 95.030,34");
    expect(linhaDoCodigo("04.03.02").querySelector('[data-coluna="reajuste_acumulado"] .font-semibold')).toBeNull();
  });

  it("rodapé com o total da RPC: -R$ 40.021,28 (não a soma das linhas)", () => {
    const { container } = render(<BoletimTabela boletim={boletimL09()} grupoId="" />);
    expect(texto(container.querySelector('tfoot [data-coluna="reajuste_medicao"]'))).toBe("-R$ 40.021,28");
    expect(texto(container.querySelector('tfoot [data-coluna="reajuste_acumulado"]'))).toBe("-R$ 40.021,28");
  });

  it("sem regra de arredondamento o reajuste fica vazio, nunca R$ 0,00", () => {
    const b = boletimL09();
    b.linhas = b.linhas.map((l) => ({ ...l, reajuste_medicao: null, reajuste_acumulado: null }));
    b.total = { ...b.total, reajuste_medicao: null, reajuste_acumulado: null };
    const { container } = render(<BoletimTabela boletim={b} grupoId="" />);
    expect(celula(linhaDoCodigo("04"), "reajuste_acumulado")).not.toContain("R$");
    expect(texto(container.querySelector('tfoot [data-coluna="reajuste_acumulado"]'))).not.toContain("R$");
  });
});

describe("BoletimTabela", () => {
  it("01.01: 1,5 na coluna 2ª e R$ 0,50 em Valor na 2ª", () => {
    const { container } = render(<BoletimTabela boletim={boletimK()} grupoId="" />);
    expect(texto(container.querySelector('th[data-coluna="m2"]'))).toBe("2ª");
    expect(texto(container.querySelector('th[data-coluna="valor_medicao"]'))).toBe("Valor na 2ª");
    const tr = linhaDoCodigo("01.01");
    expect(celula(tr, "m1")).toBe("1,5");
    expect(celula(tr, "m2")).toBe("1,5");
    expect(celula(tr, "valor_medicao")).toBe("R$ 0,50");
    expect(celula(tr, "preco")).toBe("0,335");
    expect(celula(tr, "pct_executado")).toMatch(/^100,00 ?%$/);
    // Sem quantidade na medição: célula vazia.
    expect(celula(linhaDoCodigo("01.02"), "m1")).toBe("");
  });

  it("uma coluna por medição até N: sem 3ª", () => {
    const { container } = render(<BoletimTabela boletim={boletimK()} grupoId="" />);
    expect(container.querySelector('th[data-coluna="m1"]')).not.toBeNull();
    expect(container.querySelector('th[data-coluna="m3"]')).toBeNull();
  });

  it("rodapé é o total da RPC (R$ 61,01), não a soma dos grupos (R$ 61,01 aqui, R$ 50,50 na 1ª)", () => {
    const { container } = render(<BoletimTabela boletim={boletimK()} grupoId="" />);
    const pe = container.querySelector("tfoot")!;
    expect(texto(pe.querySelector('[data-coluna="item"]'))).toBe("Total do contrato");
    expect(texto(pe.querySelector('[data-coluna="acumulado"]'))).toBe("R$ 61,01");
    expect(texto(pe.querySelector('[data-coluna="previsto"]'))).toBe("R$ 123,02");
    expect(texto(pe.querySelector('[data-coluna="saldo"]'))).toBe("R$ 62,01");
    expect(texto(pe.querySelector('[data-coluna="pct_executado"]'))).toMatch(/^49,59 ?%$/);
  });

  it("o rodapé mostra o texto do banco mesmo quando difere da soma das linhas (D7)", () => {
    // Na 1ª do K os grupos somam 50,50 e o total é 50,51: a tela não pode "corrigir".
    const b = boletimK();
    b.total = { ...b.total, acumulado: "50.51" };
    const { container } = render(<BoletimTabela boletim={b} grupoId="" />);
    expect(texto(container.querySelector('tfoot [data-coluna="acumulado"]'))).toBe("R$ 50,51");
  });

  it("buscar 01.02.01 mantém 01 e 01.02 e esconde o 02", () => {
    const { container } = render(<BoletimTabela boletim={boletimK()} grupoId="" />);
    fireEvent.change(screen.getByPlaceholderText("Buscar por código ou descrição"), { target: { value: "01.02.01" } });
    const itens = [...container.querySelectorAll('tbody [data-coluna="item"]')].map((td) => texto(td));
    expect(itens).toEqual(["01", "01.02", "01.02.01"]);
    // O rodapé não muda com a busca: é o total do contrato.
    expect(texto(container.querySelector('tfoot [data-coluna="acumulado"]'))).toBe("R$ 61,01");
  });

  it("busca também pela descrição", () => {
    const b = boletimK();
    b.linhas[5] = { ...b.linhas[5], descricao: "Escavação de vala" };
    render(<BoletimTabela boletim={b} grupoId="" />);
    fireEvent.change(screen.getByPlaceholderText("Buscar por código ou descrição"), { target: { value: "vala" } });
    expect(linhaDoCodigo("02")).toBeTruthy();
    expect(celula(linhaDoCodigo("02.01"), "descricao")).toBe("Escavação de vala");
    expect(screen.getAllByRole("row").some((tr) => texto(tr.querySelector('[data-coluna="item"]')) === "01")).toBe(false);
  });

  it("a coluna de busca não aparece na tabela", () => {
    const { container } = render(<BoletimTabela boletim={boletimK()} grupoId="" />);
    expect(container.querySelector('[data-coluna="busca"]')).toBeNull();
  });

  it("filtro por grupo mostra só a raiz escolhida e o rodapé continua o do contrato", () => {
    const { container } = render(<BoletimTabela boletim={boletimK()} grupoId="5" />);
    const itens = [...container.querySelectorAll('tbody [data-coluna="item"]')].map((td) => texto(td));
    expect(itens).toEqual(["02", "02.01", "02.01"]);
    expect(texto(container.querySelector('tfoot [data-coluna="acumulado"]'))).toBe("R$ 61,01");
  });

  it("grupo que não existe mostra a árvore inteira", () => {
    const { container } = render(<BoletimTabela boletim={boletimK()} grupoId="nao-existe" />);
    expect(container.querySelectorAll('tbody [data-coluna="item"]')).toHaveLength(7);
  });

  it("itens fora da versão vigente: aviso com código, descrição e acumulado", () => {
    render(
      <BoletimTabela
        boletim={boletimK({
          fora_da_versao: [
            { item_id: "x", codigo: "01.03", descricao: "Serviço retirado", unidade: "m", qtds: { "1": "0.5" }, valor_medicao: "0.00", acumulado: "2.50", reajuste_medicao: "0", reajuste_acumulado: "0" },
          ],
        })}
        grupoId=""
      />,
    );
    const aviso = screen.getByRole("note");
    expect(texto(aviso)).toContain("1 item medido fora da versão vigente (v0)");
    expect(texto(aviso)).toContain("01.03");
    expect(texto(aviso)).toContain("Serviço retirado");
    expect(texto(aviso)).toContain("R$ 2,50");
  });

  it("sem regra de arredondamento: dinheiro e % vazios, quantidades continuam", () => {
    const b = boletimK();
    b.linhas = b.linhas.map((l) => ({ ...l, previsto: null, valor_medicao: null, acumulado: null, saldo: null, pct_executado: null, pct_a_medir: null, reajuste_medicao: null, reajuste_acumulado: null }));
    b.total = { previsto: null, valor_medicao: null, acumulado: null, saldo: null, pct_executado: null, pct_a_medir: null, reajuste_medicao: null, reajuste_acumulado: null };
    render(<BoletimTabela boletim={b} grupoId="" />);
    const tr = linhaDoCodigo("01.01");
    expect(celula(tr, "m2")).toBe("1,5");
    expect(celula(tr, "valor_medicao")).not.toContain("R$");
    expect(celula(tr, "pct_executado")).toBe("");
  });
});
