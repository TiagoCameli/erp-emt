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
 * 4. O tempo é UM filtro só (a régua de mês de referência), e escrever a janela
 *    apaga o `mes_ref` do formato antigo.
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

// A régua desenha os meses a partir de hoje: sem travar a data, o teste
// envelheceria na virada do ano.
vi.mock("@/lib/formatadores", async (original) => ({
  ...(await original<typeof import("@/lib/formatadores")>()),
  dataHojeISO: () => "2026-09-19",
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
      centrosCusto={CADASTRO}
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

describe("FiltrosCustoReceitaBarra: o eixo de tempo", () => {
  const regua = () => screen.getByRole("button", { name: "Mês de referência" });

  it("é UM filtro só, e não sobrou campo de mês nativo", () => {
    // Até 19/09/2026 eram três trilhos para a mesma pergunta: uma lista de meses
    // avulsos, um campo De e um campo Até.
    montar({});
    expect(screen.queryByText("Meses de referência")).toBeNull();
    expect(screen.queryByLabelText("De")).toBeNull();
    expect(screen.queryByLabelText("Até")).toBeNull();
    expect(regua().textContent).toContain("Todos os meses");
  });

  it("a janela escolhida vai para a URL em yyyy-MM, sem o dia", () => {
    // A régua fala `yyyy-MM-01` (o dia que `mes_competencia` guarda) e a URL dos
    // relatórios guarda `yyyy-MM` desde sempre. Trocar o formato da URL quebraria
    // todo link salvo e todo drill que já escreve `de=2026-08`.
    montar({});
    fireEvent.click(regua());

    const maio = screen.getByRole("button", { name: "maio de 2026" });
    fireEvent.pointerDown(maio, { button: 0 });
    fireEvent.pointerEnter(screen.getByRole("button", { name: "agosto de 2026" }));
    fireEvent.pointerUp(screen.getByRole("button", { name: "agosto de 2026" }));

    const query = new URLSearchParams(navegador.destinos.at(-1)!.split("?")[1]);
    expect(query.get("de")).toBe("2026-05");
    expect(query.get("ate")).toBe("2026-08");
  });

  it("escrever a janela apaga o `mes_ref` do formato antigo", () => {
    // Dois filtros para a mesma pergunta na URL é o caminho para eles
    // discordarem: o `mes_ref` manda na leitura, e ficaria pendurado e invisível.
    // Janela de dois meses (e não de um trimestre redondo) porque a régua
    // reabre pela BORDA do período: jan a mar abriria em Trimestres.
    navegador.query = "mes_ref=2026-01,2026-02";
    montar({ de: "2026-01", ate: "2026-02" });
    fireEvent.click(regua());

    const julho = screen.getByRole("button", { name: "julho de 2026" });
    fireEvent.pointerDown(julho, { button: 0 });
    fireEvent.pointerUp(julho);

    const query = new URLSearchParams(navegador.destinos.at(-1)!.split("?")[1]);
    expect(query.get("mes_ref")).toBeNull();
    expect(query.get("de")).toBe("2026-07");
    expect(query.get("ate")).toBe("2026-07");
  });

  it("a régua abre marcando a janela que veio do `mes_ref` antigo", () => {
    montar({ de: "2026-05", ate: "2026-07" });
    expect(regua().textContent).toContain("mai - jul de 2026");
  });
});
