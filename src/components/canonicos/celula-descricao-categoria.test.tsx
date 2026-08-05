import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { ColumnDef } from "@tanstack/react-table";

import {
  CelulaDescricaoCategoria,
  linhasDaDescricao,
} from "@/components/canonicos/celula-descricao-categoria";
import {
  DataTable,
  limparEstadosTabelaParaTeste,
} from "@/components/canonicos/data-table";
import {
  ALTURA_LINHA_MAXIMA,
  ALTURA_LINHA_MINIMA,
  escreverPreferenciasTabela,
  preferenciasVazias,
} from "@/components/canonicos/preferencias-tabela";

/**
 * O jsdom não faz layout: não há linha de texto, não há pixel, não há reticências
 * para contar. Então o que estes casos guardam é a REGRA — quantas linhas a célula
 * pede para a altura que a linha tem, qual corte ela aplica e quando o tooltip
 * existe. Quem confere que a quebra e as reticências aparecem é o navegador.
 */

/** O que está salvo para o usuário nesta rodada (a fábrica do vi.mock sobe). */
const preferencia = vi.hoisted(() => ({ salva: null as string | null }));

// A DataTable busca e grava a preferência por Server Action, e Server Action usa
// cookies(), que não existe fora de uma requisição.
vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => preferencia.salva),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

/** Line-heights dos tokens que a célula usa (text-detalhe e text-legenda). */
const ALTURA_POR_LINHA = 20;
const ALTURA_CATEGORIA = 18;

/** Uma descrição de verdade da tela de Lançamentos, que não cabe em uma linha. */
const DESCRICAO =
  "REFERENTE ABASTECIMENTO DA SEMANA 12 DA FROTA DE CAMINHÕES DA BR-364";

interface Lancamento {
  descricao: string;
  categoria: string | null;
}

const REGISTROS: Lancamento[] = [
  { descricao: DESCRICAO, categoria: "Combustível" },
];

const COLUNAS: ColumnDef<Lancamento, unknown>[] = [
  {
    accessorKey: "descricao",
    header: "Descrição e categoria",
    // Sem isto a DataTable embrulha a célula num truncate de uma linha só e o
    // corte de dentro nem chega a valer.
    meta: { naoTruncar: true },
    cell: ({ row }) => (
      <CelulaDescricaoCategoria
        descricao={row.original.descricao}
        categoriaNome={row.original.categoria}
      />
    ),
  },
];

/** Monta a tabela com a altura de linha que o usuário salvou na visita anterior. */
async function renderizarComAltura(alturaLinha: number | null) {
  preferencia.salva = escreverPreferenciasTabela({
    ...preferenciasVazias(),
    alturaLinha,
  });
  await act(async () => {
    render(
      <DataTable<Lancamento>
        idTabela="financeiro.lancamentos"
        columns={COLUNAS}
        data={REGISTROS}
      />,
    );
  });
}

/** O bloco da descrição (o texto mora direto nele). */
function blocoDescricao(): HTMLElement {
  return screen.getByText(DESCRICAO);
}

function blocoCategoria(): HTMLElement {
  return screen.getByText("Categoria: Combustível");
}

/** Quantas linhas o corte multilinha está pedindo, ou `null` quando não há corte. */
function linhasCortadas(elemento: HTMLElement): number | null {
  const valor = elemento.style.getPropertyValue("-webkit-line-clamp");
  return valor === "" ? null : Number(valor);
}

beforeEach(() => {
  preferencia.salva = null;
  limparEstadosTabelaParaTeste();
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  limparEstadosTabelaParaTeste();
});

describe("CelulaDescricaoCategoria: altura automática", () => {
  it("deixa a descrição inteira, quebrando em quantas linhas precisar", async () => {
    await renderizarComAltura(null);
    const descricao = blocoDescricao();

    // Nenhum corte: nem o de uma linha (o `truncate`, que é white-space: nowrap e
    // era o bug — a linha crescia e o texto continuava numa linha só), nem o
    // multilinha. É o que deixa o texto todo aparecer.
    expect(descricao.className).not.toContain("truncate");
    expect(descricao.className).not.toContain("whitespace-nowrap");
    expect(linhasCortadas(descricao)).toBeNull();
    expect(descricao.style.overflow).toBe("");
    expect(descricao).toHaveTextContent(DESCRICAO);
  });

  it("não põe tooltip: o texto está todo na tela", async () => {
    await renderizarComAltura(null);
    expect(blocoDescricao()).not.toHaveAttribute("title");
  });

  it("segura texto sem espaço dentro da coluna", async () => {
    await renderizarComAltura(null);
    // Sem o overflow-hidden do truncate, é o break-words que impede a chave de
    // acesso da nota de vazar por cima da coluna vizinha.
    expect(blocoDescricao().className).toContain("break-words");
  });
});

describe("CelulaDescricaoCategoria: altura fixa", () => {
  it("quebra em quantas linhas cabem e corta a última com reticências", async () => {
    await renderizarComAltura(64); // Ampla: 64 - 18 da categoria = 2 linhas de 20.
    const descricao = blocoDescricao();

    expect(linhasCortadas(descricao)).toBe(2);
    // O trio do corte multilinha. Sem qualquer um deles não há reticências.
    expect(descricao.style.display).toBe("-webkit-box");
    expect(descricao.style.getPropertyValue("-webkit-box-orient")).toBe(
      "vertical",
    );
    expect(descricao.style.overflow).toBe("hidden");
  });

  it("põe o texto inteiro no tooltip, porque pode ter sobrado texto fora", async () => {
    await renderizarComAltura(64);
    expect(blocoDescricao()).toHaveAttribute("title", DESCRICAO);
  });

  it("volta a uma linha quando a linha é fina demais para duas", async () => {
    // Compacta: 34px não cabem duas linhas de texto mais a categoria. É a exceção
    // que o dono do sistema abriu.
    await renderizarComAltura(ALTURA_LINHA_MINIMA);
    expect(linhasCortadas(blocoDescricao())).toBe(1);
  });

  it("dá mais linhas quanto mais alta a linha da tabela", async () => {
    await renderizarComAltura(114);
    // 114 é a altura do print que abriu o problema: antes rendia UMA linha de
    // texto e um vão vazio embaixo.
    expect(linhasCortadas(blocoDescricao())).toBe(4);
  });

  it("não corta a descrição em texto que cabe folgado", async () => {
    await renderizarComAltura(ALTURA_LINHA_MAXIMA);
    expect(linhasCortadas(blocoDescricao())).toBe(7);
  });
});

describe("CelulaDescricaoCategoria: linha da categoria", () => {
  it("fica em uma linha, com o nome inteiro no tooltip", async () => {
    await renderizarComAltura(null);
    const categoria = blocoCategoria();
    // A categoria é nome curto e é dela que sai a conta das linhas da descrição:
    // se ela quebrasse, a conta mudaria a cada registro.
    expect(categoria.className).toContain("truncate");
    expect(categoria).toHaveAttribute("title", "Categoria: Combustível");
  });

  it("sai mesmo sem categoria, para o registro sem classificação aparecer", async () => {
    render(<CelulaDescricaoCategoria descricao="Compra de cimento" />);
    expect(screen.getByText("Categoria: sem categoria")).toBeInTheDocument();
  });
});

describe("CelulaDescricaoCategoria fora de uma tabela", () => {
  it("mostra a descrição inteira", async () => {
    render(<CelulaDescricaoCategoria descricao={DESCRICAO} categoriaNome="Frota" />);
    // Sem tabela em volta não há altura fixa nenhuma, então o padrão é texto
    // inteiro (e não um corte de uma linha, que era o de antes).
    expect(linhasCortadas(blocoDescricao())).toBeNull();
    expect(blocoDescricao()).not.toHaveAttribute("title");
  });

  it("marca a descrição vazia em vez de deixar buraco", async () => {
    render(<CelulaDescricaoCategoria descricao="   " categoriaNome="Frota" />);
    expect(screen.getByLabelText("não informado")).toBeInTheDocument();
  });
});

describe("linhasDaDescricao", () => {
  it("dá a quantidade de linhas de cada preset do menu Altura", () => {
    expect(linhasDaDescricao(ALTURA_LINHA_MINIMA)).toBe(1); // Compacta, 34
    expect(linhasDaDescricao(48)).toBe(1); // Confortável
    expect(linhasDaDescricao(64)).toBe(2); // Ampla
    expect(linhasDaDescricao(ALTURA_LINHA_MAXIMA)).toBe(7);
  });

  it("nunca pede mais espaço do que a linha tem, em nenhuma altura do arraste", () => {
    // A altura pode ser QUALQUER número entre o mínimo e o máximo (o arraste anda
    // de pixel em pixel), então a regra vale para a faixa toda: ou o corte cabe
    // junto com a categoria, ou é o mínimo de uma linha (a linha fina demais).
    for (let altura = ALTURA_LINHA_MINIMA; altura <= ALTURA_LINHA_MAXIMA; altura++) {
      const linhas = linhasDaDescricao(altura);
      expect(linhas).toBeGreaterThanOrEqual(1);
      if (linhas > 1) {
        expect(linhas * ALTURA_POR_LINHA + ALTURA_CATEGORIA).toBeLessThanOrEqual(
          altura,
        );
      }
    }
  });

  it("nunca tira linha de quem aumentou a altura", () => {
    let anterior = 0;
    for (let altura = ALTURA_LINHA_MINIMA; altura <= ALTURA_LINHA_MAXIMA; altura++) {
      const linhas = linhasDaDescricao(altura);
      expect(linhas).toBeGreaterThanOrEqual(anterior);
      anterior = linhas;
    }
  });
});
