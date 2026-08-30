import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { LINHAS_CABECALHO_MARCA } from "@/lib/planilha-marca";
import {
  aba,
  dataDeRelatorioParaCelula,
  montarPlanilhaDeRelatorio,
  nomeArquivoDeRelatorio,
  type ColunaRelatorio,
} from "@/modules/financeiro/relatorios/planilha-relatorio";

/**
 * A moldura das planilhas da aba Relatórios.
 *
 * Os testes releem o .xlsx GERADO, e não o objeto em memória: o que precisa
 * estar certo é o arquivo que chega na mão de quem recebe. Um total apontando
 * uma linha adiante, ou um intervalo de filtro deslocado, abre sem erro nenhum
 * e mostra número errado — é o defeito que este módulo existe para impedir.
 */

interface LinhaFake {
  centro: string;
  valor: number;
  parcelas: number;
  participacao: number;
}

const COLUNAS: ColunaRelatorio<LinhaFake>[] = [
  {
    cabecalho: "Centro de custo",
    largura: 30,
    tipo: "texto",
    celula: (l) => l.centro,
  },
  {
    cabecalho: "Custo",
    largura: 16,
    tipo: "dinheiro",
    celula: (l) => l.valor,
    somar: true,
  },
  {
    cabecalho: "Parcelas",
    largura: 10,
    tipo: "inteiro",
    celula: (l) => l.parcelas,
    somar: true,
  },
  {
    cabecalho: "Participação",
    largura: 14,
    tipo: "percentual",
    // A coluna NÃO soma: percentual somado dá 100% num caso e 340% noutro.
    celula: (l) => l.participacao,
  },
];

const LINHAS: LinhaFake[] = [
  { centro: "009 - BR-364", valor: 1000.5, parcelas: 3, participacao: 0.5 },
  { centro: "003 - Ramal do Gama", valor: 600.25, parcelas: 2, participacao: 0.3 },
  { centro: "Escritório Central", valor: 400.25, parcelas: 1, participacao: 0.2 },
];

const LINHA_HEADER = LINHAS_CABECALHO_MARCA + 1;

/** Número da coluna em letra do Excel (1 = A), para montar a referência A1. */
function colunaEmLetra(numero: number): string {
  return String.fromCharCode("A".charCodeAt(0) + numero - 1);
}

async function gerar(abas: Parameters<typeof montarPlanilhaDeRelatorio>[0]) {
  const workbook = montarPlanilhaDeRelatorio(abas);
  const buffer = await workbook.xlsx.writeBuffer();
  const lido = new ExcelJS.Workbook();
  await lido.xlsx.load(buffer as ArrayBuffer);
  return lido;
}

describe("moldura da planilha de relatório", () => {
  it("escreve cabeçalho de colunas na linha que a marca reservou", async () => {
    const livro = await gerar([
      aba({
        nome: "Custo",
        titulo: "Custo por centro de custo · ago/2026",
        colunas: COLUNAS,
        linhas: LINHAS,
      }),
    ]);
    const planilha = livro.worksheets[0];

    const cabecalhos = planilha.getRow(LINHA_HEADER).values as unknown[];
    expect(cabecalhos.slice(1)).toEqual([
      "Centro de custo",
      "Custo",
      "Parcelas",
      "Participação",
    ]);
  });

  it("congela o cabeçalho e liga o filtro até a última linha de dado", async () => {
    const livro = await gerar([
      aba({ nome: "Custo", titulo: "Custo", colunas: COLUNAS, linhas: LINHAS }),
    ]);
    const planilha = livro.worksheets[0];

    expect(planilha.views[0]).toMatchObject({
      state: "frozen",
      ySplit: LINHA_HEADER,
    });
    // O filtro para na última linha de DADO: incluir a linha de total faria o
    // Excel esconder o total ao filtrar.
    //
    // Relido do ARQUIVO, o `autoFilter` volta como referência A1 ("A6:D9"), e
    // não como o objeto `{from,to}` que foi escrito — é o formato que o xlsx
    // guarda. Asserir o objeto passaria a vida toda comparando com `undefined`.
    expect(planilha.autoFilter).toBe(
      `A${LINHA_HEADER}:${colunaEmLetra(COLUNAS.length)}${LINHA_HEADER + LINHAS.length}`,
    );
  });

  it("soma SÓ as colunas marcadas, por SUBTOTAL e no intervalo certo", async () => {
    const livro = await gerar([
      aba({
        nome: "Custo",
        titulo: "Custo",
        colunas: COLUNAS,
        linhas: LINHAS,
        rotuloTotal: "Total (3 centros)",
      }),
    ]);
    const planilha = livro.worksheets[0];
    const totais = planilha.getRow(LINHA_HEADER + LINHAS.length + 1);

    expect(totais.getCell(1).value).toBe("Total (3 centros)");

    const comFormula: string[] = [];
    totais.eachCell((cell, coluna) => {
      if (typeof cell.value === "object" && cell.value && "formula" in cell.value) {
        comFormula.push(COLUNAS[coluna - 1].cabecalho);
        // O intervalo tem que começar na primeira linha de dado e parar na
        // última: um deslocamento aqui soma o intervalo errado em silêncio.
        expect(String(cell.value.formula)).toContain(
          `${LINHA_HEADER + 1}:`,
        );
        expect(String(cell.value.formula)).toContain(
          `${LINHA_HEADER + LINHAS.length})`,
        );
        expect(String(cell.value.formula)).toContain("SUBTOTAL(109");
      }
    });

    // Participação é percentual e NÃO entra: somar percentual não significa nada.
    expect(comFormula).toEqual(["Custo", "Parcelas"]);
  });

  it("o dinheiro vai como NÚMERO, para a planilha somar", async () => {
    const livro = await gerar([
      aba({ nome: "Custo", titulo: "Custo", colunas: COLUNAS, linhas: LINHAS }),
    ]);
    const planilha = livro.worksheets[0];

    // "R$ 1.000,50" como texto viraria coluna que não soma, e somar é o motivo
    // de exportar.
    expect(planilha.getRow(LINHA_HEADER + 1).getCell(2).value).toBe(1000.5);
    expect(planilha.getColumn(2).numFmt).toBe("R$ #,##0.00");
  });

  it("aba sem linha nenhuma não escreve filtro nem total", async () => {
    // `autoFilter` com `to` antes de `from` deixa o arquivo com intervalo
    // inválido e o Excel reclama ao ABRIR — o erro aparece na mão de quem
    // recebeu, não na de quem exportou.
    const livro = await gerar([
      aba({ nome: "Vazio", titulo: "Sem dado", colunas: COLUNAS, linhas: [] }),
    ]);
    const planilha = livro.worksheets[0];

    expect(planilha.autoFilter).toBeUndefined();
    expect(planilha.getRow(LINHA_HEADER + 1).getCell(1).value).toBeNull();
  });

  it("escreve várias abas, cada uma com o próprio tipo de linha", async () => {
    interface Conta {
      nome: string;
      saldo: number;
    }
    const livro = await gerar([
      aba({ nome: "Custo", titulo: "Custo", colunas: COLUNAS, linhas: LINHAS }),
      aba<Conta>({
        nome: "Contas",
        titulo: "Posição bancária",
        colunas: [
          { cabecalho: "Conta", largura: 24, tipo: "texto", celula: (c) => c.nome },
          {
            cabecalho: "Saldo",
            largura: 16,
            tipo: "dinheiro",
            celula: (c) => c.saldo,
            // Saldo NÃO soma: o total de uma coluna de saldos não quer dizer
            // nada. É por isso que `somar` é opt-in e não vem do tipo.
          },
        ],
        linhas: [{ nome: "BB 102.124-9", saldo: 128852.68 }],
      }),
    ]);

    expect(livro.worksheets.map((w) => w.name)).toEqual(["Custo", "Contas"]);
    const contas = livro.worksheets[1];
    // Sem coluna somada, não há linha de total nenhuma.
    expect(contas.getRow(LINHA_HEADER + 2).getCell(1).value).toBeNull();
  });

  it("corta nome de aba que o Excel recusaria", async () => {
    // O Excel não avisa: ele recusa o ARQUIVO INTEIRO ao abrir.
    const livro = await gerar([
      aba({
        nome: "Custo/receita por centro de custo detalhado por mês",
        titulo: "x",
        colunas: COLUNAS,
        linhas: LINHAS,
      }),
    ]);

    const nome = livro.worksheets[0].name;
    expect(nome.length).toBeLessThanOrEqual(31);
    expect(nome).not.toMatch(/[\\/?*[\]:]/);
  });
});

describe("dataDeRelatorioParaCelula", () => {
  it("vira o dia do calendário, sem deslocar pelo fuso", () => {
    const data = dataDeRelatorioParaCelula("2026-08-28");
    expect(data?.toISOString()).toBe("2026-08-28T00:00:00.000Z");
  });

  it("texto que não é data vira célula em branco", () => {
    expect(dataDeRelatorioParaCelula(null)).toBeNull();
    expect(dataDeRelatorioParaCelula("28/08/2026")).toBeNull();
  });
});

describe("nomeArquivoDeRelatorio", () => {
  it("distingue relatório e dia na pasta de downloads", () => {
    expect(nomeArquivoDeRelatorio("custo-cc", "2026-08-29")).toBe(
      "custo-cc-2026-08-29.xlsx",
    );
  });
});
