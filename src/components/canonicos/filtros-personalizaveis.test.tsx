import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(() => Promise.resolve(null)),
  salvarPreferenciaTabela: vi.fn(() => Promise.resolve()),
  limparPreferenciaTabela: vi.fn(() => Promise.resolve()),
}));

import {
  BlocoFiltros,
  BotaoPersonalizar,
  FiltroBusca,
  ID_BUSCA_TABELA,
  lerPreferenciasTabela,
  ProvedorGrades,
  VERSAO_PREFERENCIAS,
  type PersonalizacaoFiltros,
} from "@/components/canonicos";

afterEach(cleanup);

function campos() {
  return [
    { id: "a", rotulo: "Alfa", elemento: <FiltroBusca valor="" onValorChange={() => {}} placeholder="alfa" /> },
    { id: "b", rotulo: "Beta", elemento: <FiltroBusca valor="" onValorChange={() => {}} placeholder="beta" /> },
    { id: "c", rotulo: "Gama", fixo: true, elemento: <FiltroBusca valor="" onValorChange={() => {}} placeholder="gama" /> },
  ];
}

function personalizacao(parcial: Partial<PersonalizacaoFiltros> = {}): PersonalizacaoFiltros {
  return {
    ordem: [],
    larguras: {},
    onOrdem: vi.fn(),
    onLargura: vi.fn(),
    onOcultar: vi.fn(),
    onRestaurar: vi.fn(),
    foraDoPadrao: false,
    ...parcial,
  };
}

const ordemNaTela = () =>
  [...document.querySelectorAll("[data-filtro-barra]")].map((n) => n.getAttribute("data-filtro-barra"));

describe("preferência: ordem e largura dos filtros", () => {
  it("lê, descarta filtro que sumiu e trava a largura", () => {
    const salvo = JSON.stringify({
      versao: VERSAO_PREFERENCIAS,
      ordemFiltros: ["status", "sumiu", ID_BUSCA_TABELA, "status"],
      largurasFiltros: { status: 20, [ID_BUSCA_TABELA]: 9999, sumiu: 300 },
    });
    const lido = lerPreferenciasTabela(salvo, [], ["status"]);
    expect(lido?.ordemFiltros).toEqual(["status", ID_BUSCA_TABELA]);
    expect(lido?.largurasFiltros).toEqual({ status: 96, [ID_BUSCA_TABELA]: 640 });
  });

  it("preferência gravada antes dos campos existirem continua valendo", () => {
    const salvo = JSON.stringify({ versao: VERSAO_PREFERENCIAS, filtros: { status: false } });
    const lido = lerPreferenciasTabela(salvo, [], ["status"]);
    expect(lido?.filtros).toEqual({ status: false });
    expect(lido?.ordemFiltros).toEqual([]);
    expect(lido?.largurasFiltros).toEqual({});
  });
});

describe("BlocoFiltros personalizável", () => {
  it("mostra na ordem salva e aplica a largura escolhida no trilho do filtro", () => {
    render(<BlocoFiltros campos={campos()} personalizacao={personalizacao({ ordem: ["c", "a"], larguras: { a: 320 } })} />);
    // "b" não estava na ordem salva: entra logo depois do vizinho padrão ("a").
    expect(ordemNaTela()).toEqual(["c", "a", "b"]);
    const trilho = screen.getByPlaceholderText("alfa").closest("[style]") as HTMLElement;
    expect(trilho.style.width).toBe("320px");
    // Sem escolha, o trilho segue com a classe padrão e sem largura em linha.
    expect(screen.getByPlaceholderText("beta").closest("[style]")).toBeNull();
  });

  it("no modo de edição o filtro fica inerte, sai da barra pelo olho e o fixo não tem olho", () => {
    const p = personalizacao({ foraDoPadrao: true });
    render(
      <ProvedorGrades inicial={{}}>
        <BotaoPersonalizar />
        <BlocoFiltros campos={campos()} personalizacao={p} />
      </ProvedorGrades>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Personalizar tela/ }));
    expect(screen.getByPlaceholderText("alfa").closest("[inert]")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tirar o filtro Beta da barra" }));
    expect(p.onOcultar).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("button", { name: "Tirar o filtro Gama da barra" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Restaurar filtros/ }));
    expect(p.onRestaurar).toHaveBeenCalled();
  });

  it("fora do modo de edição nada muda para quem usa", () => {
    render(
      <ProvedorGrades inicial={{}}>
        <BotaoPersonalizar />
        <BlocoFiltros campos={campos()} personalizacao={personalizacao()} />
      </ProvedorGrades>,
    );
    expect(screen.getByPlaceholderText("alfa").closest("[inert]")).toBeNull();
    expect(screen.queryByRole("button", { name: /Tirar o filtro/ })).toBeNull();
  });
});
