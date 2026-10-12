import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { limparEstadosTabelaParaTeste } from "@/components/canonicos/data-table";

import { MargemPorObraTabela } from "@/modules/financeiro/relatorios/components/margem-por-obra-tabela";
import type { MargemDaObra } from "@/modules/financeiro/relatorios/indireto-nos-relatorios";

// O DataTable com `idTabela` lê e grava a preferência do usuário por Server
// Action e usa o router; no teste, os dois ficam no lugar.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/financeiro/relatorios",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

afterEach(() => {
  cleanup();
  limparEstadosTabelaParaTeste();
});

const texto = (el: HTMLElement) => (el.textContent ?? "").replace(/\s/g, " ");

const LINHAS: MargemDaObra[] = [
  {
    centroId: "11111111-1111-4111-8111-111111111111",
    nome: "Obra A",
    receita: 2000,
    custoDireto: 1000,
    indireto: 200,
    resultadoSem: 1000,
    margemSem: 50,
    resultadoCom: 800,
    margemCom: 40,
  },
  {
    centroId: "22222222-2222-4222-8222-222222222222",
    nome: "Carretas",
    receita: 0,
    custoDireto: 50,
    indireto: 0,
    resultadoSem: -50,
    margemSem: null,
    resultadoCom: -50,
    margemCom: null,
  },
];

describe("MargemPorObraTabela", () => {
  it("tem as colunas da margem sem e com indireto", () => {
    render(<MargemPorObraTabela linhas={LINHAS} />);
    for (const coluna of [
      "Obra",
      "Receita líquida",
      "Custo direto",
      "Indireto",
      "Resultado",
      "Margem sem indireto",
      "Margem com indireto",
    ]) {
      // O nome do cabeçalho leva junto a alça "Largura da coluna X".
      expect(screen.getByRole("columnheader", { name: new RegExp(`^${coluna} Largura da coluna`) })).toBeTruthy();
    }
  });

  it("uma linha por obra, margem em traço sem receita, e o total", () => {
    render(<MargemPorObraTabela linhas={LINHAS} />);
    const a = screen.getByRole("row", { name: /Obra A/ });
    expect(texto(a)).toContain("R$ 2.000,00");
    expect(texto(a)).toContain("R$ 800,00");
    expect(texto(a)).toContain("50%");
    expect(texto(a)).toContain("40%");
    const c = screen.getByRole("row", { name: /Carretas/ });
    expect(texto(c)).toContain("—");
    const total = screen.getByRole("row", { name: /^Total/ });
    // Receita 2.000; resultado com indireto 800 - 50 = 750; margem 37,5%.
    expect(texto(total)).toContain("R$ 750,00");
    expect(texto(total)).toContain("37,5%");
  });
});
