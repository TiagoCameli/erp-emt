import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FiltrosCustoCcBarra } from "@/modules/financeiro/relatorios/components/filtros-custo-cc-barra";
import type { FiltrosCustoCc } from "@/modules/financeiro/relatorios/filtros-custo-cc";

/**
 * O eixo de tempo do Custo por centro de custo depois da régua.
 *
 * Até 19/09/2026 eram três trilhos: um seletor "Um mês / Período / Tudo / Vida
 * do centro" e, conforme o modo, um `input type="month"` ou dois. A régua faz os
 * três primeiros sem seletor nenhum (clicar é um mês, arrastar é período, o X é
 * tudo), e o quarto — a vida do centro, pedido do dono — sobrou como o que ele
 * sempre foi: um recorte que nasce do CENTRO, não uma janela de calendário.
 *
 * O que estes testes travam é a regra de escrita, que é onde o erro não aparece
 * na tela: parâmetro de tempo que sobra na URL volta a recortar o relatório
 * sozinho, invisível, na próxima navegação.
 */
const navegador = vi.hoisted(() => ({ query: "", destinos: [] as string[] }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: (destino: string) => {
      navegador.destinos.push(destino);
      const [, q = ""] = destino.split("?");
      navegador.query = q;
    },
  }),
  usePathname: () => "/financeiro/relatorios",
  useSearchParams: () => new URLSearchParams(navegador.query),
}));

vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

vi.mock("@/components/canonicos/filtros-sessao", () => ({
  salvarQuerySessao: vi.fn(),
  lerQuerySessao: vi.fn(() => null),
  limparFiltrosSessao: vi.fn(),
  limparFiltrosDaRota: vi.fn(),
  filtrosLembraveis: vi.fn(() => ""),
}));

// A régua desenha os meses a partir de hoje: sem travar a data, o teste
// envelheceria na virada do ano.
vi.mock("@/lib/formatadores", async (original) => ({
  ...(await original<typeof import("@/lib/formatadores")>()),
  dataHojeISO: () => "2026-09-19",
}));

const OBRA = "11111111-1111-4111-8111-111111111111";

const VAZIO: FiltrosCustoCc = {
  modo: "mes",
  mes: "2026-09",
  de: "",
  ate: "",
  centroIds: [],
  etapaIds: [],
  categoriaIds: [],
  fornecedorIds: [],
  formaIds: [],
  semForma: false,
  status: [],
  tiposCentro: [],
  excluirPrevisto: false,
  comparar: false,
};

function montar(filtros: Partial<FiltrosCustoCc> = {}) {
  return render(
    <FiltrosCustoCcBarra
      filtros={{ ...VAZIO, ...filtros }}
      centrosCusto={[]}
      categorias={[]}
      fornecedores={[]}
      formasPagamento={[]}
    />,
  );
}

/** A query da última navegação, já parseada. */
function ultimaQuery() {
  return new URLSearchParams(navegador.destinos.at(-1)!.split("?")[1]);
}

const regua = () => screen.getByRole("button", { name: "Mês de referência" });
const vida = () =>
  screen.getByLabelText("Desde o 1º lançamento de cada centro");

beforeEach(() => {
  navegador.query = "";
  navegador.destinos = [];
});

afterEach(() => cleanup());

describe("FiltrosCustoCcBarra: o eixo de tempo", () => {
  it("não sobrou seletor de modo, e a régua abre no mês corrente", () => {
    montar();
    expect(screen.queryByText("Um mês")).toBeNull();
    expect(screen.queryByText("Tudo")).toBeNull();
    // O padrão da tela é o mês corrente, e a régua diz isso em vez de "todos".
    expect(regua().textContent).toContain("set de 2026");
  });

  it("arrastar a régua escreve o período e apaga o `mes`", () => {
    montar();
    fireEvent.click(regua());
    fireEvent.pointerDown(screen.getByRole("button", { name: "maio de 2026" }), {
      button: 0,
    });
    fireEvent.pointerEnter(
      screen.getByRole("button", { name: "julho de 2026" }),
    );
    fireEvent.pointerUp(screen.getByRole("button", { name: "julho de 2026" }));

    const query = ultimaQuery();
    expect(query.get("modo")).toBe("periodo");
    expect(query.get("de")).toBe("2026-05");
    expect(query.get("ate")).toBe("2026-07");
    expect(query.get("mes")).toBeNull();
  });

  it("o X da régua é SEM LIMITE, e sem limite derruba o comparar", () => {
    // Não existe período anterior a "tudo": deixar `comparar=1` na URL o faria
    // voltar ligado sozinho na próxima janela escolhida.
    navegador.query = "modo=periodo&de=2026-05&ate=2026-07&comparar=1";
    montar({ modo: "periodo", de: "2026-05", ate: "2026-07", comparar: true });

    fireEvent.click(
      screen.getByRole("button", { name: "Limpar mês de referência" }),
    );

    const query = ultimaQuery();
    expect(query.get("modo")).toBe("total");
    expect(query.get("de")).toBeNull();
    expect(query.get("ate")).toBeNull();
    expect(query.get("comparar")).toBeNull();
  });

  it("ligar a vida do centro apaga a janela inteira", () => {
    // A régua tem que voltar a dizer "Todos os meses": quem manda no tempo passa
    // a ser o primeiro lançamento de CADA centro, e uma régua marcada ali seria
    // um filtro que não filtra.
    navegador.query = "modo=periodo&de=2026-05&ate=2026-07&comparar=1";
    montar({
      modo: "periodo",
      de: "2026-05",
      ate: "2026-07",
      comparar: true,
      centroIds: [OBRA],
    });

    fireEvent.click(vida());

    const query = ultimaQuery();
    expect(query.get("modo")).toBe("vida");
    expect(query.get("de")).toBeNull();
    expect(query.get("ate")).toBeNull();
    expect(query.get("mes")).toBeNull();
    expect(query.get("comparar")).toBeNull();
  });

  it("no modo vida a régua abre vazia, e mexer nela sai da vida", () => {
    navegador.query = "modo=vida";
    montar({ modo: "vida", centroIds: [OBRA] });
    expect(regua().textContent).toContain("Todos os meses");

    fireEvent.click(regua());
    const agosto = screen.getByRole("button", { name: "agosto de 2026" });
    fireEvent.pointerDown(agosto, { button: 0 });
    fireEvent.pointerUp(agosto);

    const query = ultimaQuery();
    expect(query.get("modo")).toBe("periodo");
    expect(query.get("de")).toBe("2026-08");
  });

  it("desligar a vida devolve a tela ao padrão dela", () => {
    navegador.query = "modo=vida";
    montar({ modo: "vida", centroIds: [OBRA] });

    fireEvent.click(vida());

    expect(ultimaQuery().get("modo")).toBeNull();
  });
});
