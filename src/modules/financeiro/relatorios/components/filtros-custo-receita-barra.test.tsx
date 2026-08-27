import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { instalarLayoutDeLista } from "@/components/canonicos/combobox-jsdom-teste";
import type { CentroCustoOpcao } from "@/modules/_shared/centro-custo/queries";
import { FiltrosCustoReceitaBarra } from "@/modules/financeiro/relatorios/components/filtros-custo-receita-barra";
import type { FiltrosCustoReceita } from "@/modules/financeiro/relatorios/filtros-custo-receita";

/**
 * A escada de centro → etapa na barra do Custo x receita, com as peças REAIS
 * (a barra canônica, o `useFiltrosUrl` e o Combobox). Só o router do Next e as
 * Server Actions de preferência são mockados, porque não existem fora de uma
 * requisição.
 *
 * O que este arquivo trava:
 *
 * 1. O primeiro campo oferece SÓ raiz. Foi o defeito que o Tiago pegou em
 *    27/08/2026: com as etapas na mesma lista, 61 das 76 opções eram
 *    equipamentos da mesma raiz e a lista desenhava sessenta e uma linhas
 *    idênticas, cortadas em "Manutenção/Docume…".
 * 2. O segundo campo só existe quando há o que escolher nele.
 * 3. Desmarcar a raiz apaga a etapa dela na MESMA navegação. Em duas, o
 *    `etapa_custo` fica pendurado na URL, invisível e vivo.
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
  filtrosLembraveis: vi.fn(() => ""),
}));

const OBRA = "11111111-1111-4111-8111-111111111111";
const MANUT = "22222222-2222-4222-8222-222222222222";
const MAQ_A = "33333333-3333-4333-8333-333333333333";
const MAQ_B = "44444444-4444-4444-8444-444444444444";

const CADASTRO: CentroCustoOpcao[] = [
  { id: OBRA, nome: "009 - BR-364", codigo: null, paiId: null, tipo: "obra" },
  {
    id: MANUT,
    nome: "Manutenção/Documentação de Equipamentos",
    codigo: null,
    paiId: null,
    tipo: "manutencao",
  },
  {
    id: MAQ_A,
    nome: "CAMINHÃO BOIADEIRO/MILHO - L1620",
    codigo: null,
    paiId: MANUT,
    tipo: null,
  },
  {
    id: MAQ_B,
    nome: "ESCAVADEIRA CAT 320",
    codigo: null,
    paiId: MANUT,
    tipo: null,
  },
];

const VAZIO: FiltrosCustoReceita = {
  meses: [],
  de: "",
  ate: "",
  centrosCusto: [],
  centrosReceita: [],
  etapasCusto: [],
  etapasReceita: [],
};

function montar(filtros: Partial<FiltrosCustoReceita>) {
  return render(
    <FiltrosCustoReceitaBarra
      filtros={{ ...VAZIO, ...filtros }}
      mesesDisponiveis={["2026-07", "2026-08"]}
      centrosCusto={CADASTRO}
      periodoDesabilitado={false}
    />,
  );
}

/** Abre o combobox de um filtro pelo rótulo que aparece em cima dele. */
function abrirFiltro(rotulo: string) {
  const campo = screen.getByText(rotulo).parentElement;
  const gatilho = campo?.querySelector('[role="combobox"]');
  fireEvent.click(gatilho as HTMLElement);
}

/**
 * Clica numa opção da lista aberta, e não em qualquer texto igual: o gatilho do
 * combobox mostra o nome do que já está marcado, então o nome da raiz escolhida
 * existe duas vezes na tela.
 */
function marcar(rotulo: string) {
  const opcao = screen
    .getAllByRole("option")
    .find((linha) => linha.textContent === rotulo);
  fireEvent.click(opcao as HTMLElement);
}

// A lista do Combobox é virtualizada: sem um layout falso, o jsdom mede zero e
// nenhuma linha é renderizada.
beforeAll(() => {
  instalarLayoutDeLista();
});

beforeEach(() => {
  navegador.query = "";
  navegador.destinos = [];
});

afterEach(() => cleanup());

describe("FiltrosCustoReceitaBarra: a escada de centro e etapa", () => {
  it("o campo de centros oferece só as raízes", () => {
    montar({});
    abrirFiltro("Centros do custo");
    const opcoes = screen.getAllByRole("option").map((o) => o.textContent);
    // "Todos os centros" não existe aqui: no múltiplo, lista vazia já é o todos.
    expect(opcoes).toEqual([
      "009 - BR-364",
      "Manutenção/Documentação de Equipamentos",
    ]);
  });

  it("sem raiz com filho escolhida, não há campo de etapa", () => {
    montar({ centrosCusto: [OBRA] });
    expect(screen.queryByText("Equipamentos do custo")).toBeNull();
    expect(screen.queryByText("Etapas do custo")).toBeNull();
  });

  it("com a raiz da manutenção, aparece o campo de EQUIPAMENTOS", () => {
    // O nome do campo vem do tipo da raiz: etapa de obra e equipamento são a
    // mesma coisa no schema e coisas diferentes na boca de quem preenche.
    montar({ centrosCusto: [MANUT] });
    abrirFiltro("Equipamentos do custo");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "CAMINHÃO BOIADEIRO/MILHO - L1620",
      "ESCAVADEIRA CAT 320",
    ]);
  });

  it("o campo do custo não mexe no da receita", () => {
    montar({ centrosCusto: [MANUT], centrosReceita: [OBRA] });
    expect(screen.queryByText("Equipamentos do custo")).not.toBeNull();
    expect(screen.queryByText("Equipamentos da receita")).toBeNull();
  });

  it("desmarcar a raiz apaga a etapa dela na MESMA navegação", () => {
    navegador.query = `centro_custo=${MANUT}&etapa_custo=${MAQ_A}`;
    montar({ centrosCusto: [MANUT], etapasCusto: [MAQ_A] });

    abrirFiltro("Centros do custo");
    marcar("Manutenção/Documentação de Equipamentos");

    expect(navegador.destinos).toHaveLength(1);
    const query = new URLSearchParams(navegador.destinos[0]!.split("?")[1]);
    expect(query.get("centro_custo")).toBeNull();
    expect(query.get("etapa_custo")).toBeNull();
  });

  it("marcar mais uma raiz preserva a etapa da raiz que continua", () => {
    navegador.query = `centro_custo=${MANUT}&etapa_custo=${MAQ_B}`;
    montar({ centrosCusto: [MANUT], etapasCusto: [MAQ_B] });

    abrirFiltro("Centros do custo");
    marcar("009 - BR-364");

    const query = new URLSearchParams(navegador.destinos[0]!.split("?")[1]);
    // As duas raízes marcadas, e o equipamento continua valendo porque a raiz
    // dele continua escolhida.
    expect(query.get("centro_custo")).toBe(`${MANUT},${OBRA}`);
    expect(query.get("etapa_custo")).toBe(MAQ_B);
  });
});
