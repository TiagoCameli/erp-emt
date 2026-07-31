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
