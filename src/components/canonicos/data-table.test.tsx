import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { ColumnDef } from "@tanstack/react-table";

import {
  DataTable,
  colunaDinheiro,
  colunaNumero,
  colunaTexto,
  limparEstadosTabelaParaTeste,
  type DataTableProps,
} from "@/components/canonicos/data-table";
import {
  ALTURA_LINHA_MAXIMA,
  ALTURA_LINHA_MINIMA,
  escreverPreferenciasTabela,
  LARGURA_MAXIMA,
  LARGURA_MINIMA,
  lerPreferenciasTabela,
  preferenciasVazias,
} from "@/components/canonicos/preferencias-tabela";
import {
  buscarPreferenciaTabela,
  limparPreferenciaTabela,
  salvarPreferenciaTabela,
} from "@/modules/_shared/preferencias-tabela/actions";

/**
 * O que está salvo para o usuário nesta rodada. Fica num objeto porque a fábrica
 * do vi.mock sobe para o topo do arquivo e não pode fechar sobre um `let` normal.
 */
const preferencia = vi.hoisted(() => ({ salva: null as string | null }));

// O DataTable busca e grava a preferência por Server Action, e Server Action usa
// cookies(), que não existe fora de uma requisição. Sem este mock o render lança
// "cookies was called outside a request scope" e a suíte fica vermelha por
// unhandled error mesmo com todos os testes passando.
vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => preferencia.salva),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

/** Altura que uma linha tem na tela no modo automático (o `h-9` da tabela). */
const ALTURA_MEDIDA = 36;

beforeAll(() => {
  // O jsdom não faz layout: getBoundingClientRect volta tudo zero. O arraste de
  // altura parte da altura MEDIDA da linha, então sem isto todo gesto começaria
  // do zero e o teste mediria o limite mínimo em vez do arraste.
  Object.defineProperty(
    HTMLTableRowElement.prototype,
    "getBoundingClientRect",
    {
      configurable: true,
      writable: true,
      value: (): DOMRect => ({
        height: ALTURA_MEDIDA,
        width: 800,
        top: 0,
        bottom: ALTURA_MEDIDA,
        left: 0,
        right: 800,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    },
  );
});

beforeEach(() => {
  preferencia.salva = null;
  // mockReset e não mockClear: teste que precisa de um save lento troca a
  // implementação, e sem reiniciar aqui ela vazaria para os testes seguintes.
  vi.mocked(salvarPreferenciaTabela).mockReset().mockResolvedValue(undefined);
  vi.mocked(limparPreferenciaTabela).mockReset().mockResolvedValue(undefined);
  vi.mocked(buscarPreferenciaTabela)
    .mockReset()
    .mockImplementation(async () => preferencia.salva);
});

// Sem cleanup automático nesta configuração: cada render ficaria no DOM e as
// buscas achariam a tabela de mais de um teste.
afterEach(cleanup);
// O estado de preferência é compartilhado por idTabela e vive fora do React: sem
// zerar aqui, o caso seguinte herdaria a altura do anterior e o fantasma custa
// uma tarde. Em produção a entrada morre com a última instância desmontada.
afterEach(limparEstadosTabelaParaTeste);

interface Lancamento {
  numero: string;
  descricao: string;
  categoria: string;
  valor: number;
  parcelas: number;
}

const REGISTROS: Lancamento[] = [
  {
    numero: "LAN-2026-0015",
    descricao: "Compra de cimento",
    categoria: "Material",
    valor: 512340,
    parcelas: 3,
  },
  {
    numero: "LAN-2026-0016",
    descricao: "Diesel S10 da frota",
    categoria: "Combustível",
    valor: 1940.5,
    parcelas: 1,
  },
  {
    numero: "LAN-2026-0017",
    descricao: "Locação de escavadeira",
    categoria: "Equipamento",
    valor: 87200,
    parcelas: 12,
  },
];

const IDS_COLUNAS = ["numero", "descricao", "valor", "parcelas"];

const COLUNAS: ColumnDef<Lancamento, unknown>[] = [
  colunaTexto<Lancamento>("numero", "Número"),
  {
    accessorKey: "descricao",
    header: "Descrição",
    // Célula de duas linhas, como a da fila de aprovação: é ela que o modo
    // automático tem que manter inteira e a altura fixa tem que igualar.
    meta: { naoTruncar: true },
    cell: ({ row }) => (
      <div>
        <p>{row.original.descricao}</p>
        <p>Categoria: {row.original.categoria}</p>
      </div>
    ),
  },
  colunaDinheiro<Lancamento>("valor", "Valor"),
  colunaNumero<Lancamento>("parcelas", "Parcelas"),
];

function renderizar(props: Partial<DataTableProps<Lancamento>> = {}) {
  return render(
    <DataTable<Lancamento>
      idTabela="financeiro.lancamentos"
      columns={COLUNAS}
      data={REGISTROS}
      {...props}
    />,
  );
}

/** Renderiza com uma preferência já gravada para o usuário e espera a hidratação. */
async function renderizarComAlturaSalva(alturaLinha: number | null) {
  preferencia.salva = escreverPreferenciasTabela({
    ...preferenciasVazias(),
    alturaLinha,
  });
  await act(async () => {
    renderizar();
  });
}

/** thead e tbody são os dois rowgroups da tabela. */
function corpo(): HTMLElement {
  return screen.getAllByRole("rowgroup")[1];
}

function linhas(): HTMLElement[] {
  return within(corpo()).getAllByRole("row");
}

function alturasDasLinhas(): string[] {
  return linhas().map((linha) => linha.style.height);
}

function cabecalhos(): HTMLElement[] {
  return screen.getAllByRole("columnheader");
}

function cabecalho(rotulo: string): HTMLElement {
  const encontrado = cabecalhos().find((celula) =>
    celula.textContent?.includes(rotulo),
  );
  if (!encontrado) throw new Error(`Coluna "${rotulo}" não está na tabela`);
  return encontrado;
}

function celulas(rotulo: string): HTMLElement[] {
  const indice = cabecalhos().indexOf(cabecalho(rotulo));
  return linhas().map((linha) => within(linha).getAllByRole("cell")[indice]);
}

const ALINHAMENTOS = ["text-left", "text-center", "text-right"];

/**
 * Alinhamento que o navegador vai aplicar de fato. O `cn` é tailwind-merge, então
 * das classes conflitantes sobra uma só e é ela que vale. Sobrar mais de uma é
 * bug de composição, não empate a favor de ninguém, por isso estoura.
 */
function alinhamento(elemento: HTMLElement): string {
  const sobreviventes = elemento.className
    .split(/\s+/)
    .filter((classe) => ALINHAMENTOS.includes(classe));
  if (sobreviventes.length !== 1) {
    throw new Error(
      `Esperava um alinhamento só, achei ${sobreviventes.length} em "${elemento.className}"`,
    );
  }
  return sobreviventes[0];
}

/** As alças de arraste de altura, uma por linha (só quando personalizável). */
function alcas(): HTMLElement[] {
  return screen.getAllByTitle(/altura de todas as linhas/i);
}

/**
 * Arrasta a borda de baixo de uma linha. O mouse sai da linha durante o gesto, e
 * é por isso que quem escuta o movimento é a janela.
 */
function arrastarAltura(indiceLinha: number, deslocamento: number) {
  fireEvent.mouseDown(alcas()[indiceLinha], { clientY: 200 });
  fireEvent.mouseMove(window, { clientY: 200 + deslocamento });
  fireEvent.mouseUp(window);
}

/** Largura em px que a coluna tem na tela (a `th` é quem manda no table-fixed). */
const LARGURA_TEXTO_PADRAO = 180;
/** A mesma coisa para coluna de número (`colunaNumero`, a "Parcelas" daqui). */
const LARGURA_NUMERO_PADRAO = 110;

/** As alças de largura de uma coluna (uma por tabela na tela). */
function alcasLargura(rotulo: string): HTMLElement[] {
  return screen.getAllByRole("separator", {
    name: `Largura da coluna ${rotulo}`,
  });
}

function alcaLargura(rotulo: string): HTMLElement {
  return alcasLargura(rotulo)[0];
}

/** Largura da coluna na enésima tabela da tela, em px, ou NaN se não tem. */
function larguraNaTabela(indiceTabela: number, rotulo: string): number {
  const tabela = screen.getAllByRole("table")[indiceTabela];
  const celula = within(tabela)
    .getAllByRole("columnheader")
    .find((cabecalho) => cabecalho.textContent?.includes(rotulo));
  if (!celula) throw new Error(`Coluna "${rotulo}" não está na tabela`);
  return Number.parseInt(celula.style.width, 10);
}

function largura(rotulo: string): number {
  return larguraNaTabela(0, rotulo);
}

/**
 * Arrasta a divisória do cabeçalho de uma coluna. O mouse sai do cabeçalho no
 * meio do gesto, então quem escuta o movimento é a janela.
 */
function arrastarLargura(rotulo: string, deslocamento: number, indice = 0) {
  fireEvent.mouseDown(alcasLargura(rotulo)[indice], { clientX: 300 });
  fireEvent.mouseMove(window, { clientX: 300 + deslocamento });
  fireEvent.mouseUp(window);
}

/**
 * O MESMO arraste, mas com todos os eventos numa tarefa só de JavaScript, que é
 * como o navegador entrega um gesto rápido de verdade: o mousedown e os mousemove
 * chegam sem o React ter chance de renderizar nem de rodar efeito entre eles.
 *
 * O `act` de fora é o que reproduz isso aqui dentro: cada `fireEvent` do
 * Testing Library abre um `act` próprio, e o de fora segura o flush até o fim (act
 * aninhado só descarrega no mais externo). Sem ele o teste ganha de graça um flush
 * de efeito entre os eventos, que o navegador não dá.
 *
 * `eventos` recebe cada função de disparo (não o evento já disparado), senão elas
 * rodariam ANTES de o act começar e a corrida seria outra.
 */
function naMesmaTarefa(eventos: (() => void)[]) {
  act(() => {
    for (const disparar of eventos) disparar();
  });
}

/** Última preferência que foi para o servidor. */
function ultimaPreferenciaSalva() {
  const chamadas = vi.mocked(salvarPreferenciaTabela).mock.calls;
  if (chamadas.length === 0) throw new Error("Nada foi gravado");
  return lerPreferenciasTabela(chamadas[chamadas.length - 1][1], IDS_COLUNAS);
}

/** Abre o menu "Altura". O menu do Radix abre no pointerdown, não no click. */
function abrirMenuAltura() {
  fireEvent.pointerDown(screen.getByRole("button", { name: "Altura" }), {
    button: 0,
    ctrlKey: false,
  });
}

/** Escolhe uma altura no menu. */
function escolherAltura(rotulo: string) {
  abrirMenuAltura();
  fireEvent.click(screen.getByText(rotulo));
}

/**
 * Fecha o menu aberto. Menu do Radix aberto marca o resto da tela com
 * aria-hidden, e aí `getByRole` não acha mais o botão que o abriu.
 */
function fecharMenu() {
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
}

/**
 * Degraus do menu "Altura", na ordem, com o px que cada um mostra ao lado
 * (`null` = automática, que não tem número).
 */
function degrausDeAltura(): { rotulo: string; px: number | null }[] {
  abrirMenuAltura();
  const degraus = screen.getAllByRole("menuitemradio").map((item) => {
    const texto = item.textContent ?? "";
    const emPx = /(\d+) px$/.exec(texto);
    return {
      rotulo: texto.replace(/\d+ px$/, "").trim(),
      px: emPx === null ? null : Number(emPx[1]),
    };
  });
  fecharMenu();
  return degraus;
}

/** Clica em "Restaurar padrão" no menu "Colunas" da enésima tabela da tela. */
function restaurarPadrao(indiceTabela = 0) {
  fireEvent.pointerDown(
    screen.getAllByRole("button", { name: "Colunas" })[indiceTabela],
    { button: 0, ctrlKey: false },
  );
  fireEvent.click(screen.getByText("Restaurar padrão"));
}

/** Liga ou desliga uma coluna no menu "Colunas" da enésima tabela da tela. */
function alternarColuna(indiceTabela: number, rotulo: string) {
  fireEvent.pointerDown(
    screen.getAllByRole("button", { name: "Colunas" })[indiceTabela],
    { button: 0, ctrlKey: false },
  );
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: rotulo }));
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
}

/**
 * Duas DataTables na mesma tela dividindo o mesmo `idTabela`, como a tela de
 * categorias faz (uma tabela por grupo de insumo, quatro na tela, de propósito,
 * porque são a mesma tabela repartida).
 */
function renderizarIrmas(idTabela = "cadastros.categorias") {
  return render(
    <>
      <DataTable<Lancamento>
        idTabela={idTabela}
        columns={COLUNAS}
        data={[REGISTROS[0]]}
      />
      <DataTable<Lancamento>
        idTabela={idTabela}
        columns={COLUNAS}
        data={[REGISTROS[1], REGISTROS[2]]}
      />
    </>,
  );
}

/**
 * Espera o debounce de gravação estourar de verdade. Com timer real porque o
 * menu do Radix não coopera com timer falso.
 */
async function esperarGravacao() {
  await act(async () => {
    await new Promise((resolver) => setTimeout(resolver, 500));
  });
}

/** Alturas das linhas da enésima tabela da tela (thead e tbody são rowgroups). */
function alturasDaTabela(indice: number): string[] {
  const tabela = screen.getAllByRole("table")[indice];
  const corpoDaTabela = within(tabela).getAllByRole("rowgroup")[1];
  return within(corpoDaTabela)
    .getAllByRole("row")
    .map((linha) => linha.style.height);
}

describe("DataTable: alinhamento do texto", () => {
  it("nasce com o cabeçalho e as células centralizados", () => {
    renderizar();
    for (const coluna of ["Número", "Descrição"]) {
      expect(alinhamento(cabecalho(coluna))).toBe("text-center");
      for (const celula of celulas(coluna)) {
        expect(alinhamento(celula)).toBe("text-center");
      }
    }
  });

  it("mantém dinheiro à direita, com tabular-nums", () => {
    // ESTE TESTE PROTEGE UMA DECISÃO, NÃO UM DETALHE. Centralizado é o padrão da
    // tabela, mas valor monetário fica à direita para a vírgula cair embaixo da
    // vírgula: é o que faz "R$ 512.340,00" saltar aos olhos ao lado de
    // "R$ 1.940,50". Centralizar dinheiro é regressão. Se este teste ficar
    // vermelho, o conserto é devolver o alinhamento à direita, não mudar o teste.
    renderizar();
    expect(alinhamento(cabecalho("Valor"))).toBe("text-right");
    for (const celula of celulas("Valor")) {
      expect(alinhamento(celula)).toBe("text-right");
      expect(within(celula).getByText(/^R\$/)).toHaveClass("tabular-nums");
    }
  });

  it("mantém quantidade e contagem à direita", () => {
    renderizar();
    expect(alinhamento(cabecalho("Parcelas"))).toBe("text-right");
    for (const celula of celulas("Parcelas")) {
      expect(alinhamento(celula)).toBe("text-right");
    }
  });

  it("centraliza igual nas tabelas que não são personalizáveis", () => {
    // Sem idTabela não há menu "Altura" nem preferência salva, mas centralizar é
    // do desenho da tabela e vale em toda listagem do app.
    renderizar({ idTabela: undefined });
    expect(alinhamento(cabecalho("Número"))).toBe("text-center");
    expect(alinhamento(celulas("Número")[0])).toBe("text-center");
    expect(screen.queryByRole("button", { name: "Altura" })).toBeNull();
  });

  it("centraliza o estado vazio", () => {
    renderizar({ data: [], emptyState: "Nenhum lançamento no período" });
    const vazio = screen.getByText("Nenhum lançamento no período");
    expect(alinhamento(vazio.closest("td") as HTMLElement)).toBe("text-center");
  });
});

describe("DataTable: altura automática é o padrão", () => {
  it("não fixa altura em nenhuma linha", () => {
    renderizar();
    expect(alturasDasLinhas()).toEqual(["", "", ""]);
  });

  it("deixa a célula de duas linhas inteira", () => {
    renderizar();
    expect(screen.getByText("Compra de cimento")).toBeInTheDocument();
    expect(screen.getByText("Categoria: Material")).toBeInTheDocument();

    // Nada dentro da célula limita a altura: é isso que deixa a linha crescer e a
    // segunda linha aparecer.
    const dentroDaCelula = Array.from(
      celulas("Descrição")[0].querySelectorAll<HTMLElement>("*"),
    );
    expect(dentroDaCelula.every((no) => no.style.maxHeight === "")).toBe(true);
  });

  it("não fixa altura nas linhas de carregamento", () => {
    renderizar({ isLoading: true });
    expect(new Set(alturasDasLinhas())).toEqual(new Set([""]));
  });
});

describe("DataTable: altura ajustada pelo usuário", () => {
  it("arrastar uma linha iguala TODAS as linhas", () => {
    renderizar();
    // Arrasta a segunda linha: quem muda de altura é a tabela inteira, não ela.
    arrastarAltura(1, 16);
    expect(alturasDasLinhas()).toEqual(["52px", "52px", "52px"]);
  });

  it("mostra em px a altura enquanto a mão está arrastando", () => {
    renderizar();
    fireEvent.mouseDown(alcas()[0], { clientY: 200 });
    expect(screen.getByText(`${ALTURA_MEDIDA} px`)).toBeInTheDocument();
    fireEvent.mouseMove(window, { clientY: 216 });
    expect(screen.getByText("52 px")).toBeInTheDocument();
    fireEvent.mouseUp(window);
    // Soltou: a etiqueta sai da tela e a altura fica.
    expect(screen.queryByText("52 px")).toBeNull();
    expect(alturasDasLinhas()).toEqual(["52px", "52px", "52px"]);
  });

  it("aplica o preset do menu em todas as linhas", () => {
    renderizar();
    escolherAltura("Compacta");
    expect(alturasDasLinhas()).toEqual(
      Array.from(REGISTROS, () => `${ALTURA_LINHA_MINIMA}px`),
    );
  });

  it("cada degrau do menu Altura é perceptível ao lado do anterior", () => {
    // ESTE TESTE PROTEGE A FEATURE DE PARECER QUEBRADA, e o jsdom não ajuda: ele
    // não faz layout, então "36px fixo" e "automática" ficam diferentes no DOM
    // mesmo desenhando a MESMA tabela na tela. Por isso a checagem é nos números
    // do menu, não no style das linhas.
    //
    // O menu tinha Compacta (34), Padrão (36), Confortável (52) e Automática: numa
    // linha de texto simples a automática rende 36, então "Padrão" era a mesma
    // tabela que ela e ficava a 2px da Compacta. Três cliques, uma tabela só.
    //
    // A Compacta é a exceção justificada: ela É o mínimo (a altura do botão de
    // ação da linha) e o que a distingue da automática não é o pixel, é o clamp
    // da célula de duas linhas, que a automática deixa crescer. Todo degrau ACIMA
    // dela precisa estar longe do vizinho E da altura natural da linha, senão não
    // é degrau, é enfeite.
    const FOLGA_MINIMA = 8;
    renderizar();
    const degraus = degrausDeAltura();

    expect(degraus).toEqual([
      { rotulo: "Automática", px: null },
      { rotulo: "Compacta", px: ALTURA_LINHA_MINIMA },
      { rotulo: "Confortável", px: 48 },
      { rotulo: "Ampla", px: 64 },
    ]);

    const fixos = degraus.slice(1).map((degrau) => degrau.px as number);
    for (const [indice, px] of fixos.entries()) {
      if (indice > 0) {
        expect(px - fixos[indice - 1]).toBeGreaterThanOrEqual(FOLGA_MINIMA);
      }
      if (px !== ALTURA_LINHA_MINIMA) {
        expect(Math.abs(px - ALTURA_MEDIDA)).toBeGreaterThanOrEqual(FOLGA_MINIMA);
      }
    }
  });

  it("os degraus de respiro chegam às linhas", () => {
    renderizar();
    escolherAltura("Confortável");
    expect(alturasDasLinhas()).toEqual(Array.from(REGISTROS, () => "48px"));

    fecharMenu();
    escolherAltura("Ampla");
    expect(alturasDasLinhas()).toEqual(Array.from(REGISTROS, () => "64px"));
  });

  it("volta para automática pelo menu, soltando a altura de todas", () => {
    renderizar();
    arrastarAltura(0, 16);
    expect(alturasDasLinhas()).toEqual(["52px", "52px", "52px"]);

    escolherAltura("Automática");
    expect(alturasDasLinhas()).toEqual(["", "", ""]);
  });

  it("usa a mesma altura no carregamento, para o layout não pular", () => {
    const { rerender } = renderizar();
    arrastarAltura(0, 16);

    rerender(
      <DataTable<Lancamento>
        idTabela="financeiro.lancamentos"
        columns={COLUNAS}
        data={REGISTROS}
        isLoading
      />,
    );
    const alturas = alturasDasLinhas();
    expect(alturas.length).toBeGreaterThan(0);
    expect(new Set(alturas)).toEqual(new Set(["52px"]));
  });

  it("para de deixar a célula de duas linhas crescer", () => {
    renderizar();
    arrastarAltura(0, 16);

    // Altura na `tr` é MÍNIMO, não máximo: sem limitar aqui dentro a célula de
    // duas linhas continuaria mais alta que as outras e nada ficaria igual.
    const limitadores = Array.from(
      celulas("Descrição")[0].querySelectorAll<HTMLElement>("*"),
    ).filter((no) => no.style.maxHeight !== "");
    expect(limitadores).toHaveLength(1);
    expect(limitadores[0].style.maxHeight).toBe("52px");
    // O texto continua no documento: a altura corta o que sobra, não apaga dado.
    expect(screen.getByText("Categoria: Material")).toBeInTheDocument();
  });

  it("o Restaurar padrão do menu Colunas devolve a altura automática", () => {
    renderizar();
    arrastarAltura(0, 16);

    fireEvent.pointerDown(screen.getByRole("button", { name: "Colunas" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(screen.getByText("Restaurar padrão"));
    expect(alturasDasLinhas()).toEqual(["", "", ""]);
  });

  it("grava a altura do usuário uma vez só, no fim do arraste", async () => {
    vi.useFakeTimers();
    try {
      renderizar();
      fireEvent.mouseDown(alcas()[0], { clientY: 200 });
      for (const y of [204, 210, 216]) {
        fireEvent.mouseMove(window, { clientY: y });
      }
      fireEvent.mouseUp(window);

      // Um arraste é uma decisão, não trinta: nada de uma gravação por pixel.
      expect(salvarPreferenciaTabela).not.toHaveBeenCalled();
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      expect(salvarPreferenciaTabela).toHaveBeenCalledTimes(1);

      const [tabela, json] = vi.mocked(salvarPreferenciaTabela).mock.calls[0];
      expect(tabela).toBe("financeiro.lancamentos");
      expect(lerPreferenciasTabela(json, IDS_COLUNAS)?.alturaLinha).toBe(52);
    } finally {
      vi.useRealTimers();
    }
  });

  it("devolve a altura que o usuário salvou na visita anterior", async () => {
    await renderizarComAlturaSalva(52);
    expect(alturasDasLinhas()).toEqual(["52px", "52px", "52px"]);
  });

  it("lê como automática a preferência antiga, salva antes da altura existir", async () => {
    // Blob v2 sem o campo: quem configurou colunas ontem não pode ter a tabela
    // clipada hoje só porque o campo passou a existir.
    preferencia.salva = JSON.stringify({
      versao: 2,
      visiveis: {},
      ordem: [],
      larguras: { valor: 200 },
      filtros: {},
    });
    await act(async () => {
      renderizar();
    });
    expect(alturasDasLinhas()).toEqual(["", "", ""]);
  });
});

describe("DataTable: limites da altura", () => {
  it("arrastar para cima além do limite para na altura mínima", () => {
    renderizar();
    arrastarAltura(0, -500);
    expect(alturasDasLinhas()).toEqual(
      Array.from(REGISTROS, () => `${ALTURA_LINHA_MINIMA}px`),
    );
  });

  it("arrastar para baixo além do limite para na altura máxima", () => {
    renderizar();
    arrastarAltura(0, 5000);
    expect(alturasDasLinhas()).toEqual(
      Array.from(REGISTROS, () => `${ALTURA_LINHA_MAXIMA}px`),
    );
  });

  it("não aplica altura absurda que esteja salva na preferência", async () => {
    await renderizarComAlturaSalva(9999);
    expect(alturasDasLinhas()).toEqual(
      Array.from(REGISTROS, () => `${ALTURA_LINHA_MAXIMA}px`),
    );
  });

  it("não aplica altura menor que a mínima que esteja salva na preferência", async () => {
    await renderizarComAlturaSalva(4);
    expect(alturasDasLinhas()).toEqual(
      Array.from(REGISTROS, () => `${ALTURA_LINHA_MINIMA}px`),
    );
  });

  it("o preset Compacta cabe o botão de ação da linha", () => {
    // O `⋮` da coluna de ações é `size="icon-sm"` (32px), e os botões
    // Aprovar/Revisar da fila de aprovação são `size="sm"` (32px). Com altura
    // fixa o conteúdo entra num contêiner com maxHeight e overflow-hidden, então
    // um preset abaixo de 32 decepa esses botões em TODA listagem do app.
    renderizar({ acoesLinha: () => null });
    escolherAltura("Compacta");
    const limitadores = Array.from(
      linhas()[0].querySelectorAll<HTMLElement>("[style*='max-height']"),
    );
    expect(limitadores.length).toBeGreaterThan(0);
    for (const no of limitadores) {
      expect(Number.parseInt(no.style.maxHeight, 10)).toBeGreaterThanOrEqual(32);
    }
  });
});

describe("DataTable: instâncias que dividem o mesmo idTabela", () => {
  // A tela de categorias monta uma DataTable por grupo de insumo, quatro na tela,
  // todas com idTabela="cadastros.categorias", porque são a mesma tabela
  // repartida. Com estado por instância, ajustar a altura num grupo não mexia nos
  // outros, e a interação seguinte de um grupo irmão gravava o estado DELE na
  // mesma chave, apagando o ajuste em silêncio.

  it("ajustar a altura numa tabela iguala as linhas das irmãs", () => {
    renderizarIrmas();
    arrastarAltura(0, 16);
    expect(alturasDaTabela(0)).toEqual(["52px"]);
    expect(alturasDaTabela(1)).toEqual(["52px", "52px"]);
  });

  it("a interação de uma irmã não apaga o ajuste da outra", async () => {
    renderizarIrmas();
    arrastarAltura(0, 16);

    // A irmã mexe em OUTRA coisa. Antes, ela gravava o estado dela (altura nula)
    // na mesma chave e a altura recém-ajustada morria sem aviso.
    alternarColuna(1, "Parcelas");

    expect(alturasDaTabela(0)).toEqual(["52px"]);
    expect(alturasDaTabela(1)).toEqual(["52px", "52px"]);

    await esperarGravacao();
    const chamadas = vi.mocked(salvarPreferenciaTabela).mock.calls;
    const ultimo = lerPreferenciasTabela(
      chamadas[chamadas.length - 1][1],
      IDS_COLUNAS,
    );
    expect(ultimo?.alturaLinha).toBe(52);
    expect(ultimo?.visiveis.parcelas).toBe(false);
  });

  it("lê a preferência uma vez só, não uma por instância", async () => {
    preferencia.salva = escreverPreferenciasTabela({
      ...preferenciasVazias(),
      alturaLinha: 52,
    });
    await act(async () => {
      renderizarIrmas();
    });
    expect(buscarPreferenciaTabela).toHaveBeenCalledTimes(1);
    expect(alturasDaTabela(0)).toEqual(["52px"]);
    expect(alturasDaTabela(1)).toEqual(["52px", "52px"]);
  });

  it("grava uma vez só quando as irmãs mudam juntas", async () => {
    renderizarIrmas();
    arrastarAltura(0, 16);
    await esperarGravacao();
    expect(salvarPreferenciaTabela).toHaveBeenCalledTimes(1);
  });
});

describe("DataTable: tabela de instância única não muda de comportamento", () => {
  // São ~40 no app. Compartilhar estado por idTabela não pode encostar nelas.

  it("idTabela diferente não compartilha nada", () => {
    render(
      <>
        <DataTable<Lancamento>
          idTabela="financeiro.lancamentos"
          columns={COLUNAS}
          data={[REGISTROS[0]]}
        />
        <DataTable<Lancamento>
          idTabela="compras.ordens"
          columns={COLUNAS}
          data={[REGISTROS[1], REGISTROS[2]]}
        />
      </>,
    );
    arrastarAltura(0, 16);
    expect(alturasDaTabela(0)).toEqual(["52px"]);
    expect(alturasDaTabela(1)).toEqual(["", ""]);
  });

  it("remontar a tela nasce do banco, não do estado da visita anterior", async () => {
    renderizar();
    arrastarAltura(0, 16);
    expect(alturasDasLinhas()).toEqual(["52px", "52px", "52px"]);

    // Desmontou a última instância: a entrada compartilhada morre com ela.
    cleanup();
    await act(async () => {
      renderizar();
    });
    expect(alturasDasLinhas()).toEqual(["", "", ""]);
  });

  it("tabela sem idTabela não lê nem grava preferência", async () => {
    await act(async () => {
      renderizar({ idTabela: undefined });
    });
    expect(buscarPreferenciaTabela).not.toHaveBeenCalled();
    expect(salvarPreferenciaTabela).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Colunas" })).toBeNull();
  });
});

describe("DataTable: a gravação não se perde nem chega fora de ordem", () => {
  it("grava ao fechar a aba, que não roda cleanup de efeito", () => {
    vi.useFakeTimers();
    try {
      renderizar();
      arrastarAltura(0, 16);
      // O debounce de 400ms ainda está correndo: navegação client-side salvaria
      // no cleanup do efeito, mas fechar a aba e recarregar não rodam cleanup.
      expect(salvarPreferenciaTabela).not.toHaveBeenCalled();

      fireEvent(window, new Event("pagehide"));
      expect(salvarPreferenciaTabela).toHaveBeenCalledTimes(1);

      // E o temporizador que sobrou não grava de novo o mesmo estado.
      vi.advanceTimersByTime(1000);
      expect(salvarPreferenciaTabela).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("grava quando a aba vai para segundo plano", () => {
    // No Safari do iPhone é este par (pagehide + visibilitychange) que funciona;
    // beforeunload não é confiável lá.
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    try {
      renderizar();
      arrastarAltura(0, 16);
      expect(salvarPreferenciaTabela).not.toHaveBeenCalled();

      fireEvent(document, new Event("visibilitychange"));
      expect(salvarPreferenciaTabela).toHaveBeenCalledTimes(1);
    } finally {
      Reflect.deleteProperty(document, "visibilityState");
      vi.useRealTimers();
    }
  });

  it("erro síncrono da gravação não derruba a fila nem a aba", async () => {
    // Server Action de verdade devolve promessa, mas a fila não pode depender
    // disso: se a tarefa estourar ANTES de virar promessa, o `.catch` da fila
    // recebe undefined e vira TypeError. Esse caminho é justo o do `pagehide`,
    // com a aba morrendo, onde ninguém vê o erro e a preferência some.
    vi.mocked(salvarPreferenciaTabela).mockImplementation(() => {
      throw new Error("estourou antes de virar promessa");
    });

    renderizar();
    arrastarAltura(0, 16);
    await esperarGravacao();
    expect(salvarPreferenciaTabela).toHaveBeenCalledTimes(1);

    // A fila liberou: o que vem depois ainda chega ao servidor.
    restaurarPadrao();
    await act(async () => {});
    expect(limparPreferenciaTabela).toHaveBeenCalledTimes(1);
  });

  it("o Restaurar padrão só apaga depois do save que já tinha partido", async () => {
    // O flush do debounce pode ter saído poucos ms ANTES do clique. Sem ordem
    // garantida, o delete chega primeiro e a preferência que a pessoa acabou de
    // apagar volta viva no próximo carregamento.
    const ordem: string[] = [];
    let concluirSave = () => {};
    vi.mocked(salvarPreferenciaTabela).mockImplementation(
      () =>
        new Promise<void>((resolver) => {
          concluirSave = () => {
            ordem.push("salvar");
            resolver();
          };
        }),
    );
    vi.mocked(limparPreferenciaTabela).mockImplementation(async () => {
      ordem.push("limpar");
    });

    renderizar();
    arrastarAltura(0, 16);
    await esperarGravacao();
    expect(salvarPreferenciaTabela).toHaveBeenCalledTimes(1);

    // Save no ar, delete pedido agora: ele espera na fila.
    restaurarPadrao();
    await act(async () => {});
    expect(limparPreferenciaTabela).not.toHaveBeenCalled();

    concluirSave();
    await act(async () => {});
    expect(ordem).toEqual(["salvar", "limpar"]);
  });
});

describe("DataTable: alça de largura da coluna", () => {
  // O que o jsdom NÃO prova: mira. Ele não faz layout, então nenhum teste aqui
  // mede px de área de pega na tela. O que dá para travar é a GEOMETRIA declarada
  // (largura da área e de que lado da divisória ela fica), e é ela que estava
  // errada: a alça antiga era uma tira de 6px presa em `right-0`, toda dentro da
  // célula, com a linha que a pessoa mira na borda da área clicável. Foi o mesmo
  // defeito da alça de ALTURA, que escapava com 4px mesmo com teste verde.

  it("monta a área de pega SOBRE a divisória, o dobro da tira que se vê", () => {
    renderizar();
    const alca = alcaLargura("Número");
    // 12px de área (w-3) deslocados meia área para fora (-right-1.5): 6px de cada
    // lado da divisória, com a linha visível no CENTRO da área de clique.
    expect(alca).toHaveClass("w-3");
    expect(alca).toHaveClass("-right-1.5");
    // O que se vê continua fino: gradiente de 40% a 60% dos 12px.
    expect(alca.className).toMatch(/from-40%/);
    expect(alca.className).toMatch(/to-60%/);
  });

  it("na última coluna a alça fica dentro, para não inventar rolagem", () => {
    // Transbordar 6px na última coluna sobra para fora da tabela e acrescenta
    // rolagem horizontal do nada.
    renderizar();
    expect(alcaLargura("Parcelas")).toHaveClass("right-0");
    expect(alcaLargura("Parcelas").className).not.toMatch(/-right-1\.5/);
  });

  it("arrastar a divisória muda a largura da coluna", () => {
    renderizar();
    expect(largura("Número")).toBe(LARGURA_TEXTO_PADRAO);
    arrastarLargura("Número", 40);
    expect(largura("Número")).toBe(LARGURA_TEXTO_PADRAO + 40);
    arrastarLargura("Número", -30);
    expect(largura("Número")).toBe(LARGURA_TEXTO_PADRAO + 10);
  });

  it("mostra a largura em px enquanto a mão está arrastando", () => {
    renderizar();
    fireEvent.mouseDown(alcaLargura("Número"), { clientX: 300 });
    // A etiqueta aparece já no clique, na largura de partida, igual à alça de
    // ALTURA: o app não pode ter dois pesos para o mesmo gesto.
    expect(screen.getByText(`${LARGURA_TEXTO_PADRAO} px`)).toBeInTheDocument();
    fireEvent.mouseMove(window, { clientX: 340 });
    expect(screen.getByText(`${LARGURA_TEXTO_PADRAO + 40} px`)).toBeInTheDocument();
    fireEvent.mouseUp(window);
    // Soltou: a etiqueta e a linha guia saem da tela e a largura fica.
    expect(screen.queryByText(`${LARGURA_TEXTO_PADRAO + 40} px`)).toBeNull();
    expect(largura("Número")).toBe(LARGURA_TEXTO_PADRAO + 40);
  });

  it("arrastar além dos limites para no mínimo e no máximo", () => {
    renderizar();
    arrastarLargura("Número", -900);
    expect(largura("Número")).toBe(LARGURA_MINIMA);
    arrastarLargura("Número", 5000);
    expect(largura("Número")).toBe(LARGURA_MAXIMA);
  });

  it("grava a largura uma vez só, no fim do arraste", async () => {
    vi.useFakeTimers();
    try {
      renderizar();
      fireEvent.mouseDown(alcaLargura("Número"), { clientX: 300 });
      for (const x of [304, 310, 320, 340]) {
        fireEvent.mouseMove(window, { clientX: x });
      }
      fireEvent.mouseUp(window);

      // Sem o debounce, arrastar borda de coluna era uma chamada de servidor POR
      // PIXEL. É a razão de o debounce existir e ele continua de pé.
      expect(salvarPreferenciaTabela).not.toHaveBeenCalled();
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      expect(salvarPreferenciaTabela).toHaveBeenCalledTimes(1);
      expect(ultimaPreferenciaSalva()?.larguras.numero).toBe(
        LARGURA_TEXTO_PADRAO + 40,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("não re-renderiza a tabela a cada pixel do arraste", () => {
    // MEDIDO com o código anterior (columnResizeMode "onChange"), nesta mesma
    // montagem de 25 linhas x 15 colunas: um arraste de 20 passos custava 7.875
    // renderizações de célula, 375 por pixel andado. É o engasgo que o Tiago vê.
    // Agora o gesto escreve a largura direto na `th` e no guia, sem passar pelo
    // estado do React, e só o valor final vira preferência.
    let renderizacoes = 0;
    const colunas: ColumnDef<Lancamento, unknown>[] = Array.from(
      { length: 15 },
      (_, indice) => ({
        id: `c${indice}`,
        accessorKey: "descricao",
        header: `Coluna ${indice}`,
        cell: ({ getValue }) => {
          renderizacoes += 1;
          return String(getValue());
        },
      }),
    );
    render(
      <DataTable<Lancamento>
        idTabela="financeiro.lancamentos"
        columns={colunas}
        data={Array.from({ length: 25 }, () => REGISTROS[0])}
      />,
    );

    fireEvent.mouseDown(alcaLargura("Coluna 0"), { clientX: 300 });
    const antes = renderizacoes;
    for (let passo = 1; passo <= 20; passo += 1) {
      fireEvent.mouseMove(window, { clientX: 300 + passo * 4 });
    }
    expect(renderizacoes - antes).toBe(0);
    // E a largura na tela acompanhou a mão do mesmo jeito: o retorno ao vivo não
    // dependia da re-renderização.
    expect(largura("Coluna 0")).toBe(150 + 80);

    fireEvent.mouseUp(window);
    // Soltar comita: aí sim a tabela renderiza, uma vez.
    expect(renderizacoes).toBeGreaterThan(antes);
    expect(largura("Coluna 0")).toBe(150 + 80);
  });

  it("clicar na divisória sem arrastar não cria preferência", async () => {
    // Gravar aqui inventaria uma largura personalizada (e acenderia o "Restaurar
    // padrão") num clique que não mudou nada na tela.
    renderizar();
    fireEvent.mouseDown(alcaLargura("Número"), { clientX: 300 });
    fireEvent.mouseUp(window);
    await esperarGravacao();
    expect(salvarPreferenciaTabela).not.toHaveBeenCalled();
    expect(largura("Número")).toBe(LARGURA_TEXTO_PADRAO);
  });

  it("não mexe na altura das linhas nem rouba o gesto da alça de altura", () => {
    // As duas alças convivem: a de altura na borda de baixo da linha, a de largura
    // na divisória do cabeçalho. Nenhuma pode disparar a outra.
    renderizar();
    arrastarLargura("Número", 40);
    expect(alturasDasLinhas()).toEqual(["", "", ""]);

    arrastarAltura(0, 16);
    expect(alturasDasLinhas()).toEqual(["52px", "52px", "52px"]);
    expect(largura("Número")).toBe(LARGURA_TEXTO_PADRAO + 40);
  });
});

/** Os eventos de janela que o gesto de largura escuta, do mouse e do dedo. */
const EVENTOS_DO_GESTO = [
  "mousemove",
  "mouseup",
  "touchmove",
  "touchend",
  "touchcancel",
];

/** O suficiente de um espião de vi.spyOn para conferir os pares add/remove. */
interface EspiaDeOuvinte {
  mock: { calls: unknown[][] };
}

/**
 * Ouvintes de gesto que entraram na janela e NÃO saíram, por tipo. Confere par a
 * par pela função registrada (não pelo tipo), que é o que `removeEventListener`
 * também exige: tipo igual com função diferente não desfaz nada.
 */
function ouvintesDoGestoAbertos(
  adicionar: EspiaDeOuvinte,
  remover: EspiaDeOuvinte,
): string[] {
  const doGesto = (chamadas: unknown[][]) =>
    chamadas.filter(
      ([tipo]) => typeof tipo === "string" && EVENTOS_DO_GESTO.includes(tipo),
    );
  const removidos = doGesto(remover.mock.calls);
  return doGesto(adicionar.mock.calls)
    .filter(
      ([tipo, ouvinte]) =>
        !removidos.some(([outro, mesmo]) => outro === tipo && mesmo === ouvinte),
    )
    .map(([tipo]) => String(tipo));
}

describe("DataTable: o arraste começa a escutar no próprio mousedown", () => {
  // O defeito que este bloco tranca: os ouvintes de `mousemove`/`mouseup` nasciam
  // num `useEffect` que reagia ao estado do mousedown, e efeito passivo roda DEPOIS
  // da pintura. Entre o clique e o efeito havia uma janela cega em que o gesto não
  // escutava nada. Movimento que caía ali era perdido; gesto que cabia todo ali não
  // acontecia, e nada se movia, nem a guia.
  //
  // Não era hipótese: o `left_click_drag` da automação do Chrome (eventos de
  // entrada reais, os mesmos que o navegador gera para uma pessoa) não conseguia
  // redimensionar coluna nenhuma, e na mão isso é o "às vezes o arraste não pega".
  //
  // A alça de ALTURA convive com o mesmo atraso de efeito e nunca sofreu porque a
  // conta dela é absoluta (altura de partida + deslocamento total do clique): basta
  // UM movimento chegar depois do efeito. A de largura soma passos e desenha já no
  // clique, então movimento perdido é largura perdida.
  //
  // Os casos de "tarefa só" REPROVAM no código de antes (conferido reintroduzindo
  // o registro por efeito: nada se movia e nada era gravado). Os outros trancam o
  // que o conserto não pode ter perdido, porque vinha de graça no cleanup do efeito
  // e agora é responsabilidade do gesto: ouvinte órfão no desmonte e no soltar, e
  // um segundo mousedown no meio do arraste.

  it("gesto inteiro numa tarefa só de JavaScript muda a largura", () => {
    renderizar();
    const alca = alcaLargura("Número");
    naMesmaTarefa([
      () => fireEvent.mouseDown(alca, { clientX: 300 }),
      () => fireEvent.mouseMove(window, { clientX: 340 }),
      () => fireEvent.mouseUp(window),
    ]);
    expect(largura("Número")).toBe(LARGURA_TEXTO_PADRAO + 40);
  });

  it("a largura do gesto de uma tarefa só vira preferência gravada", async () => {
    // O gesto que o navegador entrega inteiro numa tarefa não pode ser um ajuste de
    // segunda classe: some ao recarregar seria o mesmo defeito, adiado.
    renderizar();
    const alca = alcaLargura("Número");
    naMesmaTarefa([
      () => fireEvent.mouseDown(alca, { clientX: 300 }),
      () => fireEvent.mouseMove(window, { clientX: 340 }),
      () => fireEvent.mouseUp(window),
    ]);
    await esperarGravacao();
    expect(ultimaPreferenciaSalva()?.larguras.numero).toBe(
      LARGURA_TEXTO_PADRAO + 40,
    );
  });

  it("gesto repartido entre duas tarefas soma os dois pedaços", () => {
    // O caso misto: 40px de mão chegam na tarefa do clique e 40 depois. O gesto soma
    // PASSOS (é o que faz o limite não guardar excedente), então é aqui que passo
    // engolido na virada apareceria como largura a menos.
    renderizar();
    const alca = alcaLargura("Número");
    naMesmaTarefa([
      () => fireEvent.mouseDown(alca, { clientX: 300 }),
      () => fireEvent.mouseMove(window, { clientX: 340 }),
    ]);
    fireEvent.mouseMove(window, { clientX: 380 });
    fireEvent.mouseUp(window);
    expect(largura("Número")).toBe(LARGURA_TEXTO_PADRAO + 80);
  });

  it("a guia nasce na borda medida mesmo tendo montado depois do movimento", () => {
    // A guia e a etiqueta só entram no DOM na renderização que o mousedown dispara,
    // então num gesto rápido a mão já andou antes de elas existirem. Quando montam,
    // têm que aparecer na borda de AGORA (medida), não na de partida.
    //
    // A largura conferida aqui trava outra coisa junto: essa renderização traz no
    // `style` da `th` a largura de PARTIDA (o `getSize()` só muda no soltar), e ela
    // não pode desfazer o que o gesto escreveu no DOM. Não desfaz porque o valor da
    // propriedade não mudou entre as duas renderizações, e o React só escreve o que
    // mudou.
    renderizar();
    fingirFatorFixo("Número", 2);
    const alca = alcaLargura("Número");
    naMesmaTarefa([
      () => fireEvent.mouseDown(alca, { clientX: 300 }),
      // Com fator 2 na tela, 10px de mouse são 5px de largura declarada.
      () => fireEvent.mouseMove(window, { clientX: 310 }),
    ]);
    expect(largura("Número")).toBe(LARGURA_TEXTO_PADRAO + 5);
    expect(bordaDaGuia()).toBe((LARGURA_TEXTO_PADRAO + 5) * 2);
    expect(rotuloDaGuia().textContent).toBe(`${(LARGURA_TEXTO_PADRAO + 5) * 2} px`);
    fireEvent.mouseUp(window);
  });

  it("desmontar no meio do arraste não deixa ouvinte órfão na janela", () => {
    // Antes era o cleanup do efeito que garantia isso. Agora quem registra é o
    // mousedown, então a saída passou a ser um cleanup de desmontagem: sem ele,
    // trocar de tela com o botão apertado deixaria um mousemove vivo escrevendo em
    // `th` que não está mais na tela.
    const adicionar = vi.spyOn(window, "addEventListener");
    const remover = vi.spyOn(window, "removeEventListener");
    try {
      const { unmount } = renderizar();
      fireEvent.mouseDown(alcaLargura("Número"), { clientX: 300 });
      fireEvent.mouseMove(window, { clientX: 340 });
      expect(ouvintesDoGestoAbertos(adicionar, remover)).toEqual(
        EVENTOS_DO_GESTO,
      );

      unmount();
      expect(ouvintesDoGestoAbertos(adicionar, remover)).toEqual([]);
    } finally {
      adicionar.mockRestore();
      remover.mockRestore();
    }
  });

  it("soltar o mouse fecha os ouvintes do gesto", () => {
    // O par do caso acima no caminho normal: o gesto tira os próprios ouvintes no
    // mouseup, sem depender de a tela desmontar.
    const adicionar = vi.spyOn(window, "addEventListener");
    const remover = vi.spyOn(window, "removeEventListener");
    try {
      renderizar();
      arrastarLargura("Número", 40);
      expect(ouvintesDoGestoAbertos(adicionar, remover)).toEqual([]);
      // E um movimento depois do gesto não mexe mais na coluna.
      fireEvent.mouseMove(window, { clientX: 900 });
      expect(largura("Número")).toBe(LARGURA_TEXTO_PADRAO + 40);
    } finally {
      adicionar.mockRestore();
      remover.mockRestore();
    }
  });

  it("um segundo mousedown na mesma coluna continua o gesto, não recomeça", () => {
    // Tela híbrida manda touchstart E mousedown no mesmo toque, e mouseup solto
    // fora da janela nunca chega. Recomeçar o gesto leria a largura de partida do
    // TanStack, que só muda no soltar: a coluna daria um pulo de volta para 180 e o
    // que a mão já tinha andado iria embora. Continuar de onde está soma os dois
    // trechos, 40 + 20.
    renderizar();
    fireEvent.mouseDown(alcaLargura("Número"), { clientX: 300 });
    fireEvent.mouseMove(window, { clientX: 340 });
    fireEvent.mouseDown(alcaLargura("Número"), { clientX: 340 });
    fireEvent.mouseMove(window, { clientX: 360 });
    fireEvent.mouseUp(window);
    expect(largura("Número")).toBe(LARGURA_TEXTO_PADRAO + 60);
  });

  it("mousedown em outra coluna fecha o gesto anterior sem perder largura", () => {
    // Mesmo caso do mouseup perdido, mas a mão vai para OUTRA divisória: ali
    // continuar seria arrastar a coluna errada. O gesto antigo fecha gravando a
    // largura que está na tela e o novo começa limpo.
    renderizar();
    fireEvent.mouseDown(alcaLargura("Número"), { clientX: 300 });
    fireEvent.mouseMove(window, { clientX: 340 });

    fireEvent.mouseDown(alcaLargura("Parcelas"), { clientX: 500 });
    fireEvent.mouseMove(window, { clientX: 520 });
    fireEvent.mouseUp(window);
    expect(largura("Número")).toBe(LARGURA_TEXTO_PADRAO + 40);
    expect(largura("Parcelas")).toBe(LARGURA_NUMERO_PADRAO + 20);
  });
});

describe("DataTable: largura pelo teclado", () => {
  // A alça é role="separator" com valor, e agora é focável: sem isto largura de
  // coluna simplesmente não existia para quem não usa mouse, e a definição de
  // pronto do projeto exige a tela usável sem mouse.

  it("anuncia a largura e os limites para o leitor de tela", () => {
    renderizar();
    const alca = alcaLargura("Número");
    expect(alca).toHaveAttribute("tabindex", "0");
    expect(alca).toHaveAttribute("aria-valuenow", String(LARGURA_TEXTO_PADRAO));
    expect(alca).toHaveAttribute("aria-valuemin", String(LARGURA_MINIMA));
    expect(alca).toHaveAttribute("aria-valuemax", String(LARGURA_MAXIMA));

    fireEvent.keyDown(alca, { key: "ArrowRight" });
    expect(alcaLargura("Número")).toHaveAttribute(
      "aria-valuenow",
      String(LARGURA_TEXTO_PADRAO + 8),
    );
  });

  it("seta mexe de pouco em pouco e com Shift mexe de muito em muito", () => {
    renderizar();
    fireEvent.keyDown(alcaLargura("Número"), { key: "ArrowRight" });
    expect(largura("Número")).toBe(LARGURA_TEXTO_PADRAO + 8);

    fireEvent.keyDown(alcaLargura("Número"), { key: "ArrowLeft" });
    expect(largura("Número")).toBe(LARGURA_TEXTO_PADRAO);

    fireEvent.keyDown(alcaLargura("Número"), {
      key: "ArrowRight",
      shiftKey: true,
    });
    expect(largura("Número")).toBe(LARGURA_TEXTO_PADRAO + 48);

    fireEvent.keyDown(alcaLargura("Número"), {
      key: "ArrowLeft",
      shiftKey: true,
    });
    expect(largura("Número")).toBe(LARGURA_TEXTO_PADRAO);
  });

  it("Home vai para o mínimo e End para o máximo", () => {
    renderizar();
    fireEvent.keyDown(alcaLargura("Número"), { key: "Home" });
    expect(largura("Número")).toBe(LARGURA_MINIMA);
    fireEvent.keyDown(alcaLargura("Número"), { key: "End" });
    expect(largura("Número")).toBe(LARGURA_MAXIMA);
  });

  it("o teclado não passa dos limites nem com muitos toques", () => {
    renderizar();
    for (let toque = 0; toque < 30; toque += 1) {
      fireEvent.keyDown(alcaLargura("Número"), {
        key: "ArrowLeft",
        shiftKey: true,
      });
    }
    expect(largura("Número")).toBe(LARGURA_MINIMA);
    for (let toque = 0; toque < 30; toque += 1) {
      fireEvent.keyDown(alcaLargura("Número"), {
        key: "ArrowRight",
        shiftKey: true,
      });
    }
    expect(largura("Número")).toBe(LARGURA_MAXIMA);
  });

  it("tecla na alça não abre o registro da linha", () => {
    const abertos: string[] = [];
    renderizar({ onRowClick: (registro) => abertos.push(registro.numero) });
    fireEvent.keyDown(alcaLargura("Número"), { key: "ArrowRight" });
    expect(abertos).toEqual([]);
  });

  it("a largura do teclado vira preferência gravada", async () => {
    renderizar();
    fireEvent.keyDown(alcaLargura("Número"), { key: "End" });
    await esperarGravacao();
    expect(ultimaPreferenciaSalva()?.larguras.numero).toBe(LARGURA_MAXIMA);
  });
});

describe("DataTable: ajustar a largura ao conteúdo", () => {
  // O que o jsdom NÃO prova: a MEDIDA. Ele não faz layout, então todo retângulo
  // volta zero e a largura medida cai no mínimo. O que dá para provar é a REGRA:
  // o duplo clique dispara o ajuste, o valor sai da largura anterior, fica preso
  // entre o mínimo e o máximo e vira preferência do usuário. Se a folga do `px-3`
  // ou do ícone de ordenação estiver errada, é o navegador que mostra.

  it("duplo clique na divisória ajusta a coluna e respeita os limites", async () => {
    renderizar();
    expect(largura("Número")).toBe(LARGURA_TEXTO_PADRAO);

    fireEvent.doubleClick(alcaLargura("Número"));
    const ajustada = largura("Número");
    expect(ajustada).not.toBe(LARGURA_TEXTO_PADRAO);
    expect(ajustada).toBeGreaterThanOrEqual(LARGURA_MINIMA);
    expect(ajustada).toBeLessThanOrEqual(LARGURA_MAXIMA);

    await esperarGravacao();
    expect(ultimaPreferenciaSalva()?.larguras.numero).toBe(ajustada);
  });

  it("devolve o estilo de tudo que tocou para medir", () => {
    // Para medir, o ajuste solta a largura do conteúdo (`max-content`, `nowrap`,
    // sem encolher). Se algum desses estilos vazar, a coluna passa a ignorar a
    // largura escolhida e a tabela quebra em TODA listagem do app. É o pior efeito
    // colateral possível desta feature, e é o único pedaço da medição que o jsdom
    // consegue provar.
    renderizar();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Colunas" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(screen.getByText("Ajustar largura ao conteúdo"));
    fecharMenu();

    const medidos = Array.from(
      screen.getAllByRole("table")[0].querySelectorAll<HTMLElement>("[data-medir]"),
    );
    expect(medidos.length).toBeGreaterThan(0);
    for (const no of medidos) {
      expect(no.style.width).toBe("");
      expect(no.style.whiteSpace).toBe("");
      expect(no.style.maxWidth).toBe("");
      expect(no.style.flexShrink).toBe("");
    }
  });

  it("as alças ficam fora da medição", () => {
    // As duas alças moram DENTRO da célula (a de largura no cabeçalho, a de altura
    // na primeira célula da linha). Numa célula de texto puro a alça é o primeiro
    // elemento, e sem a marca `data-alca` a medição mediria ela: 12px em toda
    // coluna, e o "ajustar ao conteúdo" viraria "encolhe tudo para o mínimo".
    renderizar();
    expect(alcaLargura("Número")).toHaveAttribute("data-alca", "largura");
    for (const alca of alcas()) {
      expect(alca).toHaveAttribute("data-alca", "altura");
    }
  });

  it("Enter na alça ajusta ao conteúdo, sem mouse", () => {
    renderizar();
    fireEvent.keyDown(alcaLargura("Número"), { key: "Enter" });
    expect(largura("Número")).not.toBe(LARGURA_TEXTO_PADRAO);
    expect(largura("Número")).toBeGreaterThanOrEqual(LARGURA_MINIMA);
  });

  it("o menu Colunas ajusta TODAS as colunas de uma vez", async () => {
    // Acertar quinze larguras uma a uma ninguém faz.
    renderizar();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Colunas" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(screen.getByText("Ajustar largura ao conteúdo"));

    await esperarGravacao();
    const larguras = ultimaPreferenciaSalva()?.larguras ?? {};
    expect(Object.keys(larguras).sort()).toEqual([...IDS_COLUNAS].sort());
    for (const valor of Object.values(larguras)) {
      expect(valor).toBeGreaterThanOrEqual(LARGURA_MINIMA);
      expect(valor).toBeLessThanOrEqual(LARGURA_MAXIMA);
    }
  });

  it("não oferece o ajuste na tabela que não é personalizável", () => {
    renderizar({ idTabela: undefined });
    expect(screen.queryByRole("button", { name: "Colunas" })).toBeNull();
    expect(screen.queryByText("Ajustar largura ao conteúdo")).toBeNull();
    // E sem idTabela não há alça de largura nenhuma: a tabela se comporta como
    // sempre, que é o que mantém as outras listagens intactas.
    expect(screen.queryAllByRole("separator")).toEqual([]);
  });
});

describe("DataTable: a largura segue as regras da preferência", () => {
  it("largura ajustada numa tabela chega nas irmãs do mesmo idTabela", () => {
    // A tela de categorias tem quatro DataTables com a mesma identidade, de
    // propósito: largura nova tem que chegar em todas.
    renderizarIrmas();
    arrastarLargura("Número", 40);
    expect(larguraNaTabela(0, "Número")).toBe(LARGURA_TEXTO_PADRAO + 40);
    expect(larguraNaTabela(1, "Número")).toBe(LARGURA_TEXTO_PADRAO + 40);
  });

  it("a interação de uma irmã não apaga a largura da outra", async () => {
    renderizarIrmas();
    arrastarLargura("Número", 40);
    alternarColuna(1, "Parcelas");

    await esperarGravacao();
    const salvo = ultimaPreferenciaSalva();
    expect(salvo?.larguras.numero).toBe(LARGURA_TEXTO_PADRAO + 40);
    expect(salvo?.visiveis.parcelas).toBe(false);
  });

  it("o Restaurar padrão devolve a largura de fábrica", () => {
    renderizar();
    arrastarLargura("Número", 40);
    expect(largura("Número")).toBe(LARGURA_TEXTO_PADRAO + 40);

    restaurarPadrao();
    expect(largura("Número")).toBe(LARGURA_TEXTO_PADRAO);
  });

  it("devolve a largura que o usuário salvou na visita anterior", async () => {
    preferencia.salva = escreverPreferenciasTabela({
      ...preferenciasVazias(),
      larguras: { numero: 260 },
    });
    await act(async () => {
      renderizar();
    });
    expect(largura("Número")).toBe(260);
  });

  it("não aplica largura absurda que esteja salva na preferência", async () => {
    preferencia.salva = escreverPreferenciasTabela({
      ...preferenciasVazias(),
      larguras: { numero: 9999, valor: 2 },
    });
    await act(async () => {
      renderizar();
    });
    expect(largura("Número")).toBe(LARGURA_MAXIMA);
    expect(largura("Valor")).toBe(LARGURA_MINIMA);
  });
});

/**
 * Finge o retângulo de um elemento. O jsdom não faz layout (todo rect volta
 * zero) e a guia do arraste sai justamente da MEDIDA da `th`: sem fingir aqui
 * não há como provar de ONDE ela sai. Recebe função porque a medida muda no meio
 * do gesto, que é o que o navegador faz.
 */
function fingirRect(elemento: Element, rect: () => Partial<DOMRect>) {
  Object.defineProperty(elemento, "getBoundingClientRect", {
    configurable: true,
    value: (): DOMRect => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => ({}),
      ...rect(),
    }),
  });
}

/** A linha guia do arraste de largura. Só existe durante o gesto. */
function guiaDeLargura(): HTMLElement {
  const guia = document.querySelector<HTMLElement>('[data-guia="largura"]');
  if (guia === null) throw new Error("A guia de largura não está na tela");
  return guia;
}

/** A etiqueta "NN px" do arraste de largura. */
function rotuloDaGuia(): HTMLElement {
  const rotulo = document.querySelector<HTMLElement>('[data-guia="rotulo"]');
  if (rotulo === null) throw new Error("A etiqueta da guia não está na tela");
  return rotulo;
}

describe("DataTable: a guia do arraste diz a verdade do que está na tela", () => {
  // O que o jsdom NÃO prova: pixel. Ele não faz layout, então a medida da `th` é
  // fingida aqui e só o navegador confere o número. O que dá para provar é a
  // REGRA, e era ela que estava errada: a guia saía de uma CONTA sobre a largura
  // declarada, e com `w-full table-fixed` o navegador escala todas as colunas
  // para preencher o contêiner quando a soma das declaradas é menor que ele.
  // Somar 100px na declarada movia a borda 85 a 96px na tela (Formas de pagamento
  // e Contas bancárias, ~1.110px declarados em ~1.450px de contêiner), e a guia
  // descolava da divisória.

  it("põe a guia na borda medida da th, não na conta da largura declarada", () => {
    renderizar();
    fingirRect(screen.getAllByRole("table")[0], () => ({ left: 0, top: 0 }));
    // 180px declarados rendendo 234px na tela: é o escalonamento do table-fixed.
    let naTela = 234;
    fingirRect(cabecalho("Número"), () => ({
      left: 0,
      right: naTela,
      width: naTela,
      top: 0,
      bottom: 36,
      height: 36,
    }));

    fireEvent.mouseDown(alcaLargura("Número"), { clientX: 300 });
    expect(guiaDeLargura().style.left).toBe("234px");

    // A mão andou 100px e a borda na tela andou 86 (o resto foi para as outras
    // colunas). A guia acompanha a BORDA, não os 100 da conta declarada.
    naTela = 320;
    fireEvent.mouseMove(window, { clientX: 400 });
    expect(guiaDeLargura().style.left).toBe("320px");

    fireEvent.mouseUp(window);
    // E o que fica na coluna (e vai para a preferência) é a largura DECLARADA: é
    // ela que o TanStack consome e que reproduz o ajuste na próxima visita.
    expect(largura("Número")).toBe(LARGURA_TEXTO_PADRAO + 100);
  });

  it("mostra na etiqueta a largura que a coluna tem na tela", () => {
    // A etiqueta mostrando a declarada era a parte pior: a coluna na tela estava
    // ~30% mais larga que o número na etiqueta.
    renderizar();
    fingirRect(screen.getAllByRole("table")[0], () => ({ left: 0, top: 0 }));
    fingirRect(cabecalho("Número"), () => ({
      left: 0,
      right: 234,
      width: 234,
      top: 0,
      bottom: 36,
      height: 36,
    }));

    fireEvent.mouseDown(alcaLargura("Número"), { clientX: 300 });
    expect(rotuloDaGuia().textContent).toBe("234 px");
    fireEvent.mouseUp(window);
  });

  it("gruda a etiqueta no cabeçalho fixo que está à vista", () => {
    // A guia mora no topo do CONTEÚDO, dentro do contêiner que rola. Com meia tela
    // rolada em Ordens, Cotações, Aprovação de pagamentos e Pagamentos diretos a
    // linha âmbar aparecia e o "NN px" ficava fora de vista, lá em cima.
    renderizar({ cabecalhoFixo: true });
    // Tabela 200px acima da área visível; a `th` é sticky e ficou no topo dela.
    fingirRect(screen.getAllByRole("table")[0], () => ({ left: 0, top: -200 }));
    fingirRect(cabecalho("Número"), () => ({
      left: 0,
      right: 234,
      width: 234,
      top: 0,
      bottom: 36,
      height: 36,
    }));

    fireEvent.mouseDown(alcaLargura("Número"), { clientX: 300 });
    // 36 (base do cabeçalho visível) + 200 (rolagem) + 4 de respiro.
    expect(rotuloDaGuia().style.top).toBe("240px");
    fireEvent.mouseUp(window);
  });

  it("sem layout para medir, a guia cai na conta da largura declarada", () => {
    // Rect zerado é "não deu para medir" (jsdom, tabela fora da tela), não coluna
    // de 0px: sem esta saída a guia iria para o canto e a etiqueta diria "0 px".
    renderizar();
    fireEvent.mouseDown(alcaLargura("Número"), { clientX: 300 });
    expect(rotuloDaGuia().textContent).toBe(`${LARGURA_TEXTO_PADRAO} px`);
    fireEvent.mouseMove(window, { clientX: 340 });
    expect(rotuloDaGuia().textContent).toBe(`${LARGURA_TEXTO_PADRAO + 40} px`);
    expect(guiaDeLargura().style.left).toBe("40px");
    fireEvent.mouseUp(window);
  });
});

/**
 * Finge uma coluna cuja borda anda `fator` px na tela por px de largura DECLARADA.
 * É o mínimo para exercitar a regra do ganho: o jsdom não faz layout, então o
 * pixel só o navegador confere, mas a REGRA (dividir o passo do mouse pelo que a
 * tela rende) é a mesma.
 */
function fingirFatorFixo(rotulo: string, fator: number) {
  const th = cabecalho(rotulo);
  fingirRect(screen.getAllByRole("table")[0], () => ({ left: 0, top: 0 }));
  fingirRect(th, () => {
    const declarada = Number.parseInt(th.style.width, 10);
    return {
      left: 0,
      right: declarada * fator,
      width: declarada * fator,
      top: 0,
      bottom: 36,
      height: 36,
    };
  });
}

/**
 * Finge o layout de uma tabela `w-full table-fixed` de verdade: cada coluna rende
 * `declarada x contêiner / soma das declaradas` enquanto a soma não alcança o
 * contêiner, e 1 para 1 depois disso (aí a tabela transborda e rola). A borda de
 * uma coluna é a soma do que está à esquerda dela, então engordar uma coluna
 * encolhe todas, inclusive as de trás da borda que a mão está arrastando: é essa
 * conta, e não um fator fixo, que o gesto tem que vencer.
 */
function fingirTabelaQueEscala(contêiner: number) {
  const tabela = screen.getAllByRole("table")[0];
  const colunas = Array.from(
    tabela.querySelectorAll<HTMLElement>("thead th"),
  );
  const declarada = (th: HTMLElement) => Number.parseInt(th.style.width, 10);
  const soma = () => colunas.reduce((total, th) => total + declarada(th), 0);
  const fator = () => Math.max(1, contêiner / soma());
  fingirRect(tabela, () => ({
    left: 0,
    top: 0,
    width: soma() * fator(),
    right: soma() * fator(),
  }));
  colunas.forEach((th, indice) => {
    fingirRect(th, () => {
      const escala = fator();
      const antes = colunas
        .slice(0, indice)
        .reduce((total, outra) => total + declarada(outra), 0);
      return {
        left: antes * escala,
        right: (antes + declarada(th)) * escala,
        width: declarada(th) * escala,
        top: 0,
        bottom: 36,
        height: 36,
      };
    });
  });
}

/** Onde a guia está, em px, já como número (a borda medida é fracionária). */
function bordaDaGuia(): number {
  return Number.parseFloat(guiaDeLargura().style.left);
}

describe("DataTable: a borda acompanha o cursor 1 para 1", () => {
  // O que faltava depois de a guia passar a sair da borda MEDIDA: arrastar 100px
  // movia a borda 86 e o cursor ficava 14px à frente do que estava arrastando.
  // Alça que não acompanha o dedo é a sensação de quebrado, e em planilha a borda
  // acompanha o cursor, ponto.
  //
  // A causa não é só a escala: numa `w-full table-fixed` o navegador reparte a
  // sobra proporcionalmente, então engordar a coluna aumenta a soma e derruba a
  // escala de TODAS no mesmo movimento, incluindo as que estão à esquerda da
  // borda. Por isso o gesto mede quanto a borda ANDOU por pixel declarado (o
  // ganho) em vez de deduzir da razão tela/declarada, que erra até de direção.

  it("com o fator 2 na tela, 10px de mouse viram 5px de largura declarada", () => {
    renderizar();
    fingirFatorFixo("Número", 2);
    fireEvent.mouseDown(alcaLargura("Número"), { clientX: 300 });
    expect(bordaDaGuia()).toBe(LARGURA_TEXTO_PADRAO * 2);

    // O PRIMEIRO movimento já compensa, porque a sonda do mousedown mediu o fator
    // antes de a mão andar. Sem ela este passo andaria 10px de largura declarada e
    // o atraso ficaria até o fim do gesto.
    fireEvent.mouseMove(window, { clientX: 310 });
    expect(largura("Número")).toBe(LARGURA_TEXTO_PADRAO + 5);
    // O que importa: a borda andou os 10px do cursor.
    expect(bordaDaGuia()).toBe(LARGURA_TEXTO_PADRAO * 2 + 10);

    fireEvent.mouseUp(window);
    // E o que fica na coluna (e vai para a preferência) é a DECLARADA.
    expect(largura("Número")).toBe(LARGURA_TEXTO_PADRAO + 5);
  });

  it("de 1px em 1px o resto não se perde no arredondamento", () => {
    // Com fator 2 cada pixel de mouse vale meio pixel declarado, e a `th` só
    // recebe px inteiro. Se o gesto arredondasse PASSO a passo, dez movimentos de
    // 1px virariam 10px declarados (ou zero), e a borda andaria o dobro da mão.
    renderizar();
    fingirFatorFixo("Número", 2);
    fireEvent.mouseDown(alcaLargura("Número"), { clientX: 300 });
    for (let passo = 1; passo <= 10; passo += 1) {
      fireEvent.mouseMove(window, { clientX: 300 + passo });
    }
    expect(largura("Número")).toBe(LARGURA_TEXTO_PADRAO + 5);
    expect(bordaDaGuia()).toBe(LARGURA_TEXTO_PADRAO * 2 + 10);
    fireEvent.mouseUp(window);
  });

  it("no limite a borda para e voltar anda no primeiro pixel", () => {
    // O erro clássico é guardar o deslocamento bruto desde o clique: a coluna fica
    // parada no mínimo acumulando 500px de mouse e DISPARA quando a mão volta.
    renderizar();
    fingirFatorFixo("Número", 2);
    fireEvent.mouseDown(alcaLargura("Número"), { clientX: 300 });

    // 600px para a esquerda: a largura declarada para no mínimo e o cursor segue.
    fireEvent.mouseMove(window, { clientX: -300 });
    expect(largura("Número")).toBe(LARGURA_MINIMA);
    // Voltando 10px, a coluna anda os 5 do fator na hora, sem pulo.
    fireEvent.mouseMove(window, { clientX: -290 });
    expect(largura("Número")).toBe(LARGURA_MINIMA + 5);

    // Mesma coisa no teto.
    fireEvent.mouseMove(window, { clientX: 5000 });
    expect(largura("Número")).toBe(LARGURA_MAXIMA);
    fireEvent.mouseMove(window, { clientX: 4980 });
    expect(largura("Número")).toBe(LARGURA_MAXIMA - 10);
    fireEvent.mouseUp(window);
  });

  it("borda que não anda cai no 1 para 1 em vez de jogar a coluna no máximo", () => {
    // A última coluna de uma tabela que escala tem a borda direita presa na do
    // contêiner: nenhuma largura declarada a move. O ganho medido é zero, e
    // dividir por zero (ou por quase zero) mandaria a coluna para 800px num
    // movimento. O 1 para 1 é o comportamento de sempre, e a etiqueta continua
    // mostrando a largura real crescendo.
    renderizar();
    fingirRect(screen.getAllByRole("table")[0], () => ({ left: 0, top: 0 }));
    fingirRect(cabecalho("Número"), () => ({
      left: 0,
      right: 234,
      width: 234,
      top: 0,
      bottom: 36,
      height: 36,
    }));
    fireEvent.mouseDown(alcaLargura("Número"), { clientX: 300 });
    fireEvent.mouseMove(window, { clientX: 340 });
    expect(largura("Número")).toBe(LARGURA_TEXTO_PADRAO + 40);
    fireEvent.mouseUp(window);
  });

  it("sem layout nenhum para medir, o gesto é 1 para 1 como sempre foi", () => {
    // Rect zerado (jsdom cru, tabela oculta) é "não deu para medir": ganho 1.
    renderizar();
    arrastarLargura("Número", 40);
    expect(largura("Número")).toBe(LARGURA_TEXTO_PADRAO + 40);
  });

  it("na tabela que escala de verdade, a borda chega junto com o cursor", () => {
    // 580px declarados (180 + 150 + 140 + 110) num contêiner de 870: fator 1,5.
    // Sem compensar, estes mesmos 100px de mão moviam a borda 88 e a guia (que sai
    // da borda) ficava 12px atrás do cursor. É a tela do Tiago em miniatura.
    renderizar();
    fingirTabelaQueEscala(870);
    fireEvent.mouseDown(alcaLargura("Número"), { clientX: 300 });
    const partida = bordaDaGuia();
    for (let passo = 1; passo <= 20; passo += 1) {
      fireEvent.mouseMove(window, { clientX: 300 + passo * 5 });
    }
    // Um mouse de verdade anda em passos curtos, e é assim que o ganho medido a
    // cada movimento acompanha a escala mudando durante o arraste.
    expect(bordaDaGuia() - partida).toBeGreaterThan(95);
    expect(bordaDaGuia() - partida).toBeLessThan(105);
    // E para a borda andar 100 na tela, a largura declarada andou bem mais que
    // 100: é a sobra que sai das outras colunas conforme a soma cresce.
    expect(largura("Número")).toBeGreaterThan(LARGURA_TEXTO_PADRAO + 100);
    fireEvent.mouseUp(window);
  });

  it("na tabela que não escala, um pixel de mouse é um pixel declarado", () => {
    // Contêiner menor que a soma das declaradas: a tabela transborda e rola
    // (Lançamentos, fila de aprovação). Ali o gesto sempre foi 1 para 1 e o
    // conserto não pode ter mexido nisso.
    renderizar();
    fingirTabelaQueEscala(200);
    fireEvent.mouseDown(alcaLargura("Número"), { clientX: 300 });
    const partida = bordaDaGuia();
    for (let passo = 1; passo <= 20; passo += 1) {
      fireEvent.mouseMove(window, { clientX: 300 + passo * 5 });
    }
    expect(largura("Número")).toBe(LARGURA_TEXTO_PADRAO + 100);
    expect(bordaDaGuia() - partida).toBe(100);
    fireEvent.mouseUp(window);
  });

  it("a sonda do mousedown não muda largura nem cria preferência", async () => {
    // A sonda escreve 2px na `th` para medir a borda e devolve a largura original
    // na mesma tarefa (o navegador só pinta no fim dela). Se ela vazasse, um
    // clique na divisória gravaria preferência do nada e acenderia o "Restaurar
    // padrão".
    renderizar();
    fingirFatorFixo("Número", 2);
    fireEvent.mouseDown(alcaLargura("Número"), { clientX: 300 });
    expect(largura("Número")).toBe(LARGURA_TEXTO_PADRAO);
    expect(rotuloDaGuia().textContent).toBe(`${LARGURA_TEXTO_PADRAO * 2} px`);
    fireEvent.mouseUp(window);
    await esperarGravacao();
    expect(salvarPreferenciaTabela).not.toHaveBeenCalled();
    expect(largura("Número")).toBe(LARGURA_TEXTO_PADRAO);
  });
});

/**
 * Emula a regra do Tailwind para a classe `hidden`, que é o que `esconderAte`
 * aplica na coluna abaixo do breakpoint. O jsdom não tem media query nem o CSS
 * do app, mas aplica folha de estilo no `getComputedStyle`, e `display: none` é
 * a única coisa que a regra da medição olha.
 */
function esconderPeloBreakpoint(): () => void {
  const estilo = document.createElement("style");
  estilo.textContent = ".hidden { display: none; }";
  document.head.append(estilo);
  return () => estilo.remove();
}

const COLUNAS_COM_BREAKPOINT: ColumnDef<Lancamento, unknown>[] = [
  colunaTexto<Lancamento>("numero", "Número"),
  // Como em Ordens de compra e Cotações, as duas telas com `esconderAte` hoje.
  colunaTexto<Lancamento>("categoria", "Categoria", {
    meta: { esconderAte: "md" },
  }),
];

function renderizarComBreakpoint() {
  return render(
    <DataTable<Lancamento>
      idTabela="compras.ordens"
      columns={COLUNAS_COM_BREAKPOINT}
      data={REGISTROS}
    />,
  );
}

/**
 * A `th` de uma coluna pelo id, e a largura declarada nela. Vai pelo DOM porque
 * `getByRole` não acha coluna `display:none`: ela sai da árvore de
 * acessibilidade, que é justamente a prova de que a emulação do breakpoint pegou.
 */
function cabecalhoPeloId(idColuna: string): HTMLElement {
  const th = screen
    .getAllByRole("table")[0]
    .querySelector<HTMLElement>(`th[data-coluna="${idColuna}"]`);
  if (th === null) throw new Error(`Coluna "${idColuna}" não está na tabela`);
  return th;
}

function larguraDeclarada(idColuna: string): number {
  return Number.parseInt(cabecalhoPeloId(idColuna).style.width, 10);
}

/** Larguras da última preferência gravada, para as colunas desta montagem. */
function largurasSalvasComBreakpoint(): Record<string, number> {
  const chamadas = vi.mocked(salvarPreferenciaTabela).mock.calls;
  if (chamadas.length === 0) throw new Error("Nada foi gravado");
  const salvo = lerPreferenciasTabela(chamadas[chamadas.length - 1][1], [
    "numero",
    "categoria",
  ]);
  return salvo?.larguras ?? {};
}

function ajustarPeloMenu() {
  fireEvent.pointerDown(screen.getByRole("button", { name: "Colunas" }), {
    button: 0,
    ctrlKey: false,
  });
  fireEvent.click(screen.getByText("Ajustar largura ao conteúdo"));
  fecharMenu();
}

describe("DataTable: coluna escondida pelo CSS fica intacta no ajuste", () => {
  // A visibilidade do TanStack não sabe da visibilidade do CSS: coluna com
  // `esconderAte` está `display:none` abaixo do breakpoint, mede ZERO e saía com
  // 60px GRAVADO na preferência. Quem ajustava com a janela estreita achava a
  // coluna esmagada ao abrir a mesma tela num monitor grande, e a única saída era
  // o "Restaurar padrão", que joga fora ordem e visibilidade também.

  it("o menu não mede nem grava a coluna que o breakpoint escondeu", async () => {
    const mostrarDeNovo = esconderPeloBreakpoint();
    try {
      renderizarComBreakpoint();
      ajustarPeloMenu();
      await esperarGravacao();
      // A visível entrou na preferência; a escondida nem apareceu nela.
      expect(Object.keys(largurasSalvasComBreakpoint())).toEqual(["numero"]);
      expect(larguraDeclarada("categoria")).toBe(LARGURA_TEXTO_PADRAO);
    } finally {
      mostrarDeNovo();
    }
  });

  it("o duplo clique na alça também não esmaga a escondida", async () => {
    // Na tela ninguém alcança a alça de uma coluna `display:none` (o `getByRole`
    // também não acha, por isso o clique vai pelo DOM). O que este caso trava é
    // que os dois caminhos, duplo clique e menu, passam pela MESMA regra.
    const mostrarDeNovo = esconderPeloBreakpoint();
    try {
      renderizarComBreakpoint();
      const alca = cabecalhoPeloId("categoria").querySelector(
        '[data-alca="largura"]',
      );
      if (alca === null) throw new Error("A coluna não tem alça de largura");
      fireEvent.doubleClick(alca);
      await esperarGravacao();
      expect(salvarPreferenciaTabela).not.toHaveBeenCalled();
      expect(larguraDeclarada("categoria")).toBe(LARGURA_TEXTO_PADRAO);
    } finally {
      mostrarDeNovo();
    }
  });

  it("com a coluna renderizada (janela larga) ela volta a ser medida", async () => {
    // A regra é `display:none`, não "tem esconderAte": acima do breakpoint a mesma
    // coluna é medida e ajustada como qualquer outra.
    renderizarComBreakpoint();
    ajustarPeloMenu();
    await esperarGravacao();
    expect(Object.keys(largurasSalvasComBreakpoint()).sort()).toEqual([
      "categoria",
      "numero",
    ]);
  });
});
