import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FiltrosCustoCcBarra } from "@/modules/financeiro/relatorios/components/filtros-custo-cc-barra";
import { FiltrosCustoGrupoBarra } from "@/modules/financeiro/relatorios/components/filtros-custo-grupo-barra";
import { FiltrosCustoReceitaBarra } from "@/modules/financeiro/relatorios/components/filtros-custo-receita-barra";
import { FiltrosDreBarra } from "@/modules/financeiro/relatorios/components/filtros-dre-barra";
import { FiltrosFluxoCaixaBarra } from "@/modules/financeiro/relatorios/components/filtros-fluxo-caixa-barra";
import type { FiltrosCustoCc } from "@/modules/financeiro/relatorios/filtros-custo-cc";
import type { FiltrosCustoReceita } from "@/modules/financeiro/relatorios/filtros-custo-receita";

/**
 * "Limpar filtros" não pode expulsar a pessoa do relatório.
 *
 * O defeito: `limparTodos` apaga toda chave da URL que não esteja na lista de
 * sobreviventes do canônico, e `rel` — a identidade do relatório — não estava
 * nela. Marcar um centro em "Custo por centro de custo", clicar em "Limpar
 * filtros" e a tela voltava para o Fluxo de caixa, com a sessão esquecendo o
 * relatório junto.
 *
 * As duas barras do módulo passam `naoSaoFiltro: PARAMS_DE_NAVEGACAO` para o
 * hook, e é isso que estes testes travam — com as peças REAIS (a barra canônica
 * e o `useFiltrosUrl`); só o router do Next e as Server Actions de preferência
 * são mockados, porque não existem fora de uma requisição.
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

const OBRA = "11111111-1111-4111-8111-111111111111";

const CUSTO_CC_VAZIO: FiltrosCustoCc = {
  modo: "mes",
  mes: "2026-08",
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

const CUSTO_RECEITA_VAZIO: FiltrosCustoReceita = {
  meses: [],
  de: "",
  ate: "",
  centrosCusto: [],
  centrosReceita: [],
  etapasCusto: [],
  etapasReceita: [],
};

beforeEach(() => {
  navegador.query = "";
  navegador.destinos = [];
});

afterEach(() => cleanup());

/** A query da última navegação, já parseada. */
function ultimaQuery(): URLSearchParams {
  const destino = navegador.destinos.at(-1);
  return new URLSearchParams((destino ?? "").split("?")[1] ?? "");
}

describe("Limpar filtros preserva o relatório aberto", () => {
  it("Custo por centro de custo: some o centro, fica o `rel`", () => {
    navegador.query = `rel=custo-cc&centro=${OBRA}`;
    render(
      <FiltrosCustoCcBarra
        filtros={{ ...CUSTO_CC_VAZIO, centroIds: [OBRA] }}
        centrosCusto={[
          {
            id: OBRA,
            nome: "009 - BR-364",
            codigo: null,
            paiId: null,
            tipo: "obra",
          },
        ]}
        categorias={[]}
        fornecedores={[]}
        formasPagamento={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));

    const query = ultimaQuery();
    expect(query.get("centro")).toBeNull();
    expect(query.get("rel")).toBe("custo-cc");
  });

  it("Custo x receita: somem os meses, fica o `rel`", () => {
    navegador.query = "rel=custo-receita&mes_ref=2026-08";
    render(
      <FiltrosCustoReceitaBarra
        filtros={{ ...CUSTO_RECEITA_VAZIO, meses: ["2026-08"] }}
        mesesDisponiveis={["2026-07", "2026-08"]}
        centrosCusto={[]}
        periodoDesabilitado={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));

    const query = ultimaQuery();
    expect(query.get("mes_ref")).toBeNull();
    expect(query.get("rel")).toBe("custo-receita");
  });

  it("Custo por grupo de insumo: some o centro, fica o `rel`", () => {
    navegador.query = `rel=custo-grupo&centro=${OBRA}`;
    render(
      <FiltrosCustoGrupoBarra
        filtros={{
          modo: "mes",
          mes: "2026-08",
          de: "",
          ate: "",
          centroId: OBRA,
          etapaId: "",
          categoriaId: "",
        }}
        centrosCusto={[
          {
            id: OBRA,
            nome: "009 - BR-364",
            codigo: null,
            paiId: null,
            tipo: "obra",
          },
        ]}
        categorias={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));

    const query = ultimaQuery();
    expect(query.get("centro")).toBeNull();
    expect(query.get("rel")).toBe("custo-grupo");
  });

  it("DRE gerencial: some o período, fica o `rel`", () => {
    navegador.query = "rel=dre&modo=periodo&de=2026-01&ate=2026-03";
    render(
      <FiltrosDreBarra
        filtros={{ modo: "periodo", mes: "2026-08", de: "2026-01", ate: "2026-03" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));

    const query = ultimaQuery();
    expect(query.get("modo")).toBeNull();
    expect(query.get("de")).toBeNull();
    expect(query.get("ate")).toBeNull();
    expect(query.get("rel")).toBe("dre");
  });

  it("Fluxo de caixa: some a janela, fica o `rel`", () => {
    navegador.query = "rel=fluxo-caixa&fluxo_modo=total";
    render(<FiltrosFluxoCaixaBarra filtros={{ modo: "total", de: "", ate: "" }} />);

    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));

    const query = ultimaQuery();
    expect(query.get("fluxo_modo")).toBeNull();
    expect(query.get("rel")).toBe("fluxo-caixa");
  });

  it("com o `rel` sozinho na URL, o botão nem aparece", () => {
    // Linha de controle: se `rel` fosse contado como filtro, a barra acharia que
    // há filtro ativo e ofereceria um botão que só teria o que apagar por engano.
    navegador.query = "rel=custo-receita";
    render(
      <FiltrosCustoReceitaBarra
        filtros={CUSTO_RECEITA_VAZIO}
        mesesDisponiveis={["2026-07", "2026-08"]}
        centrosCusto={[]}
        periodoDesabilitado={false}
      />,
    );

    expect(screen.queryByRole("button", { name: "Limpar filtros" })).toBeNull();
    expect(navegador.destinos).toEqual([]);
  });
});
