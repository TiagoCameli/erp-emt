import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { EMPRESA } from "@/config/marca";
import { LINHAS_CABECALHO_MARCA } from "@/lib/planilha-marca";
import {
  ABA_PLANILHA_BOLETIM,
  COLUNAS_FIXAS_BOLETIM,
  montarPlanilhaBoletim,
  nomeArquivoBoletim,
} from "@/modules/medicao/boletim/planilha";
import type { Boletim, LinhaBoletim } from "@/modules/medicao/boletim/tipos";

/**
 * Export do boletim com o contrato K da prova da Task 3 (sem_arredondar), o mesmo da tabela da
 * tela. Os números são os que a RPC devolveu: a planilha só copia o texto do banco para a célula
 * (D7), nunca soma nem arredonda.
 */

function linha(
  id: string, ordem: number, codigo: string, pai_id: string | null, tipo: "titulo" | "servico",
  preco: string | null, qtd: string | null, qtds: Record<string, string>,
  previsto: string, valor: string, acumulado: string, saldo: string, pct: string, pctAMedir: string,
): LinhaBoletim {
  return {
    id, ordem, codigo, pai_id, nivel: codigo.split(".").length, descricao: `Serviço número ${ordem}`,
    unidade: tipo === "servico" ? "m3" : null, tipo, item_id: `i${id}`, preco_unitario: preco, quantidade_prevista: qtd,
    qtds, previsto, valor_medicao: valor, acumulado, saldo, pct_executado: pct, pct_a_medir: pctAMedir,
    reajuste_medicao: "0", reajuste_acumulado: "0",
  };
}

function boletimK(over: Partial<Boletim> = {}): Boletim {
  return {
    contrato: { id: "k", codigo: "K", nome_obra: "Obra K", numero_contrato: "1/2026", contratante_nome: "Cliente", regra_arredondamento: "sem_arredondar" },
    versao: { id: "v0", numero: 0, vigente_desde: "2026-01-01" },
    ate: 2,
    medicoes: [
      { id: "m1", numero: 1, periodo_inicio: "2026-01-01", periodo_fim: "2026-01-31", status: "aberta", valor: "50.51", reajuste: null, reajuste_situacao: null },
      { id: "m2", numero: 2, periodo_inicio: "2026-02-01", periodo_fim: "2026-02-28", status: "aberta", valor: "10.51", reajuste: null, reajuste_situacao: null },
    ],
    linhas: [
      linha("1", 1, "01", null, "titulo", null, null, {}, "22.02", "10.51", "11.01", "11.01", "0.5000", "0.5000"),
      linha("2", 2, "01.01", "1", "servico", "0.335", "3", { "1": "1.5", "2": "1.5" }, "1.01", "0.50", "1.01", "0.00", "1.0000", "0.0000"),
      linha("3", 3, "01.02", "1", "servico", "0.335", "3", {}, "1.01", "0.00", "0.00", "1.01", "0.0000", "1.0000"),
      linha("4", 4, "01.02.01", "3", "servico", "10.004", "2", { "2": "1" }, "20.01", "10.00", "10.00", "10.01", "0.4998", "0.5002"),
      linha("5", 5, "02", null, "titulo", null, null, {}, "101.01", "0.00", "50.00", "51.01", "0.4950", "0.5050"),
      linha("6", 6, "02.01", "5", "servico", "100.005", "1", { "1": "0.5" }, "100.01", "0.00", "50.00", "50.01", "0.4999", "0.5001"),
      linha("7", 7, "02.01", "5", "servico", "1", "1", {}, "1.00", "0.00", "0.00", "1.00", "0.0000", "1.0000"),
    ],
    fora_da_versao: [],
    total: {
      previsto: "123.02", valor_medicao: "10.51", acumulado: "61.01", saldo: "62.01",
      pct_executado: "0.49593561981791578605", pct_a_medir: "0.50406438018208421395",
      reajuste_medicao: "0", reajuste_acumulado: "0",
    },
    ...over,
  };
}

/** Escreve em buffer e abre de novo, como o Excel faria. */
async function relerWorkbook(boletim: Boletim): Promise<ExcelJS.Workbook> {
  const buffer = await (await montarPlanilhaBoletim(boletim)).xlsx.writeBuffer();
  const lido = new ExcelJS.Workbook();
  await lido.xlsx.load(buffer);
  return lido;
}

async function relerPlanilha(boletim: Boletim): Promise<ExcelJS.Worksheet> {
  const aba = (await relerWorkbook(boletim)).getWorksheet(ABA_PLANILHA_BOLETIM);
  if (!aba) throw new Error("aba não encontrada no arquivo gerado");
  return aba;
}

/** A linha do cabeçalho de colunas: a primeira com "Item" na coluna A depois da marca. */
function linhaDoCabecalho(aba: ExcelJS.Worksheet): number {
  for (let r = LINHAS_CABECALHO_MARCA + 1; r <= aba.rowCount; r += 1) {
    if (aba.getRow(r).getCell(1).value === "Item") return r;
  }
  throw new Error("cabeçalho de colunas não encontrado");
}

/** Os títulos do cabeçalho, na ordem das colunas. */
function cabecalhos(aba: ExcelJS.Worksheet): string[] {
  const r = aba.getRow(linhaDoCabecalho(aba));
  const titulos: string[] = [];
  for (let c = 1; c <= r.cellCount; c += 1) titulos.push(String(r.getCell(c).value ?? ""));
  return titulos;
}

function coluna(aba: ExcelJS.Worksheet, titulo: string): number {
  const i = cabecalhos(aba).indexOf(titulo);
  if (i < 0) throw new Error(`coluna "${titulo}" não encontrada`);
  return i + 1;
}

/** Linha da planilha cujo código (coluna A) é `codigo`; `indice` para códigos repetidos. */
function linhaDoCodigo(aba: ExcelJS.Worksheet, codigo: string, indice = 0): ExcelJS.Row {
  const achadas: ExcelJS.Row[] = [];
  for (let r = linhaDoCabecalho(aba) + 1; r <= aba.rowCount; r += 1) {
    if (aba.getRow(r).getCell(1).value === codigo) achadas.push(aba.getRow(r));
  }
  expect(achadas.length).toBeGreaterThan(indice);
  return achadas[indice];
}

describe("montarPlanilhaBoletim, arquivo relido", () => {
  it("embute a logo no arquivo e abre com a marca da EMT", async () => {
    const lido = await relerWorkbook(boletimK());
    expect(lido.model.media).toHaveLength(1);
    expect(lido.model.media[0].extension).toBe("png");

    const aba = lido.getWorksheet(ABA_PLANILHA_BOLETIM)!;
    expect(aba.getRow(2).getCell(1).value).toBe(`${EMPRESA.razaoSocial} · CNPJ: ${EMPRESA.cnpj}`);
    expect(String(aba.getRow(3).getCell(1).value)).toContain("Boletim de medição");
  });

  it("linha de contexto logo depois da marca e cabeçalho na linha 7", async () => {
    const aba = await relerPlanilha(boletimK());
    expect(aba.getRow(LINHAS_CABECALHO_MARCA + 1).getCell(1).value).toBe(
      "Contrato K · CT 1/2026 · Obra K · Até a 2ª medição (01/02 a 28/02/2026) · Planilha v0",
    );
    expect(linhaDoCabecalho(aba)).toBe(7);
    expect(linhaDoCabecalho(aba)).toBe(LINHAS_CABECALHO_MARCA + 2);
  });

  it("até a 2ª: duas colunas de medição, na ordem do boletim oficial", async () => {
    const aba = await relerPlanilha(boletimK());
    expect(COLUNAS_FIXAS_BOLETIM).toBe(6);
    expect(cabecalhos(aba)).toEqual([
      "Item", "Discriminação", "Unid.", "Preço Unitário", "Quantidade Prevista Total", "Valor (R$) Previsto Total",
      "1ª Medição", "2ª Medição",
      "Valor (R$) Executado na 2ª Medição", "Valor (R$) Executado Acumulado", "Porcentagem Executada (%)",
      "Saldo a Medir (R$)", "Porcentagem a Medir (%)",
      "Reajuste na 2ª", "Reajuste acumulado",
    ]);
  });

  it("até a 1ª com 2 medições no contrato: uma coluna só e o valor é o da 1ª", async () => {
    const aba = await relerPlanilha(boletimK({ ate: 1 }));
    expect(cabecalhos(aba)).toContain("1ª Medição");
    expect(cabecalhos(aba)).not.toContain("2ª Medição");
    expect(cabecalhos(aba)).toContain("Valor (R$) Executado na 1ª Medição");
    expect(cabecalhos(aba)).toHaveLength(COLUNAS_FIXAS_BOLETIM + 1 + 7);
    expect(aba.getRow(LINHAS_CABECALHO_MARCA + 1).getCell(1).value).toContain("Até a 1ª medição (01/01 a 31/01/2026)");
  });

  it("01.01: Valor na 2ª = 0.5 como número, com formato de moeda", async () => {
    const aba = await relerPlanilha(boletimK());
    const celula = linhaDoCodigo(aba, "01.01").getCell(coluna(aba, "Valor (R$) Executado na 2ª Medição"));
    expect(celula.value).toBe(0.5);
    expect(celula.numFmt).toBe('"R$" #,##0.00');
  });

  it("01.02.01: quantidade da 2ª = 1 e a célula da 1ª fica vazia", async () => {
    const aba = await relerPlanilha(boletimK());
    const r = linhaDoCodigo(aba, "01.02.01");
    expect(r.getCell(coluna(aba, "2ª Medição")).value).toBe(1);
    expect(r.getCell(coluna(aba, "1ª Medição")).value).toBeNull();
  });

  it("código e descrição como texto, % como número com 0.00%", async () => {
    const aba = await relerPlanilha(boletimK());
    const r = linhaDoCodigo(aba, "01.02.01");
    expect(r.getCell(1).value).toBe("01.02.01");
    expect(r.getCell(2).value).toBe("Serviço número 4");
    expect(r.getCell(3).value).toBe("m3");
    const pct = r.getCell(coluna(aba, "Porcentagem Executada (%)"));
    expect(pct.value).toBe(0.4998);
    expect(pct.numFmt).toBe("0.00%");
    expect(r.getCell(coluna(aba, "Porcentagem a Medir (%)")).value).toBe(0.5002);
    expect(r.getCell(coluna(aba, "Saldo a Medir (R$)")).value).toBe(10.01);
  });

  it("uma linha por linha do boletim, na ordem (inclusive o 02.01 repetido)", async () => {
    const aba = await relerPlanilha(boletimK());
    const h = linhaDoCabecalho(aba);
    const codigos: unknown[] = [];
    for (let r = h + 1; r <= h + 7; r += 1) codigos.push(aba.getRow(r).getCell(1).value);
    expect(codigos).toEqual(["01", "01.01", "01.02", "01.02.01", "02", "02.01", "02.01"]);
    expect(linhaDoCodigo(aba, "02.01", 1).getCell(coluna(aba, "Preço Unitário")).value).toBe(1);
  });

  it("título em negrito com preenchimento claro; serviço sem", async () => {
    const aba = await relerPlanilha(boletimK());
    const titulo = linhaDoCodigo(aba, "01").getCell(2);
    expect(titulo.font?.bold).toBe(true);
    expect(titulo.fill).toMatchObject({ type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F5F1" } });
    expect(linhaDoCodigo(aba, "01.01").getCell(2).font?.bold).toBeFalsy();
    // Título sem unidade: célula vazia, não texto vazio (a conferência lê vazio no oficial).
    expect(linhaDoCodigo(aba, "01").getCell(3).value).toBeNull();
  });

  it("linha Total: com os valores da RPC, sem fórmula (acumulado 61.01)", async () => {
    const aba = await relerPlanilha(boletimK());
    const h = linhaDoCabecalho(aba);
    const total = aba.getRow(h + 8);
    expect(total.getCell(1).value).toBe("Total:");
    expect(total.getCell(coluna(aba, "Valor (R$) Previsto Total")).value).toBe(123.02);
    expect(total.getCell(coluna(aba, "Valor (R$) Executado na 2ª Medição")).value).toBe(10.51);
    expect(total.getCell(coluna(aba, "Valor (R$) Executado Acumulado")).value).toBe(61.01);
    expect(total.getCell(coluna(aba, "Saldo a Medir (R$)")).value).toBe(62.01);
    expect(total.getCell(coluna(aba, "Porcentagem Executada (%)")).value).toBe(0.49593561981791578605);
    expect(total.getCell(coluna(aba, "Porcentagem a Medir (%)")).value).toBe(0.50406438018208421395);
    total.eachCell((c) => expect(c.formula).toBeUndefined());
    expect(total.getCell(1).font?.bold).toBe(true);
  });

  it("o total é o texto do banco mesmo quando difere da soma das linhas (D7)", async () => {
    const b = boletimK();
    b.total = { ...b.total, acumulado: "50.51" };
    const aba = await relerPlanilha(b);
    const total = aba.getRow(linhaDoCabecalho(aba) + 8);
    expect(total.getCell(coluna(aba, "Valor (R$) Executado Acumulado")).value).toBe(50.51);
  });

  it("preço e quantidade voltam ao MESMO double do texto (21154.63583333333, 102.34700000000001)", async () => {
    const b = boletimK();
    b.linhas[1] = { ...b.linhas[1], preco_unitario: "21154.63583333333", quantidade_prevista: "102.34700000000001", qtds: { "1": "0.30000000000000004", "2": "580.8643" } };
    const aba = await relerPlanilha(b);
    const r = linhaDoCodigo(aba, "01.01");
    const preco = r.getCell(coluna(aba, "Preço Unitário"));
    expect(preco.value).toBe(21154.63583333333);
    expect(preco.numFmt).toBe("#,##0.00########");
    expect(r.getCell(coluna(aba, "Quantidade Prevista Total")).value).toBe(102.34700000000001);
    expect(r.getCell(coluna(aba, "1ª Medição")).value).toBe(0.30000000000000004);
    expect(r.getCell(coluna(aba, "2ª Medição")).value).toBe(580.8643);
    expect(r.getCell(coluna(aba, "2ª Medição")).numFmt).toBe("#,##0.00########");
  });

  it("sem regra de arredondamento: dinheiro e % em branco, quantidades continuam", async () => {
    const b = boletimK({ contrato: { ...boletimK().contrato, regra_arredondamento: null } });
    b.linhas = b.linhas.map((l) => ({ ...l, previsto: null, valor_medicao: null, acumulado: null, saldo: null, pct_executado: null, pct_a_medir: null, reajuste_medicao: null, reajuste_acumulado: null }));
    b.total = { previsto: null, valor_medicao: null, acumulado: null, saldo: null, pct_executado: null, pct_a_medir: null, reajuste_medicao: null, reajuste_acumulado: null };
    const aba = await relerPlanilha(b);
    const r = linhaDoCodigo(aba, "01.01");
    expect(r.getCell(coluna(aba, "Valor (R$) Previsto Total")).value).toBeNull();
    expect(r.getCell(coluna(aba, "Porcentagem Executada (%)")).value).toBeNull();
    expect(r.getCell(coluna(aba, "1ª Medição")).value).toBe(1.5);
  });

  it("congela as 2 primeiras colunas e até o cabeçalho, pelo número da linha", async () => {
    const aba = await relerPlanilha(boletimK());
    expect(aba.views[0]).toMatchObject({ state: "frozen", xSplit: 2, ySplit: linhaDoCabecalho(aba) });
  });

  it("sem itens fora da versão: o bloco não aparece", async () => {
    const aba = await relerPlanilha(boletimK());
    const h = linhaDoCabecalho(aba);
    const textos: unknown[] = [];
    for (let r = h + 1; r <= aba.rowCount; r += 1) textos.push(aba.getRow(r).getCell(1).value);
    expect(textos).not.toContain("Itens medidos fora da versão vigente");
    expect(aba.rowCount).toBe(h + 8);
  });

  it("itens fora da versão vêm depois do total, sob o título do bloco", async () => {
    const b = boletimK({
      fora_da_versao: [
        { item_id: "x", codigo: "03.01", descricao: "Serviço que saiu no aditivo", unidade: "m2", qtds: { "2": "4" }, valor_medicao: "8.00", acumulado: "8.00", reajuste_medicao: "1.25", reajuste_acumulado: "3.75" },
      ],
    });
    const aba = await relerPlanilha(b);
    const h = linhaDoCabecalho(aba);
    expect(aba.getRow(h + 8).getCell(1).value).toBe("Total:");
    const rotulo = aba.getRow(h + 10);
    expect(rotulo.getCell(1).value).toBe("Itens medidos fora da versão vigente");
    expect(rotulo.getCell(1).font?.bold).toBe(true);
    const item = aba.getRow(h + 11);
    expect(item.getCell(1).value).toBe("03.01");
    expect(item.getCell(2).value).toBe("Serviço que saiu no aditivo");
    expect(item.getCell(3).value).toBe("m2");
    expect(item.getCell(coluna(aba, "1ª Medição")).value).toBeNull();
    expect(item.getCell(coluna(aba, "2ª Medição")).value).toBe(4);
    expect(item.getCell(coluna(aba, "Valor (R$) Executado na 2ª Medição")).value).toBe(8);
    expect(item.getCell(coluna(aba, "Valor (R$) Executado Acumulado")).value).toBe(8);
    expect(item.getCell(coluna(aba, "Valor (R$) Previsto Total")).value).toBeNull();
    expect(item.getCell(coluna(aba, "Reajuste na 2ª")).value).toBe(1.25);
    expect(item.getCell(coluna(aba, "Reajuste acumulado")).value).toBe(3.75);
  });

  it("contrato sem medição: nenhuma coluna de medição e contexto sem Nª", async () => {
    const b = boletimK({ ate: null, medicoes: [] });
    b.linhas = b.linhas.map((l) => ({ ...l, qtds: {}, valor_medicao: null, acumulado: "0.00" }));
    const aba = await relerPlanilha(b);
    expect(cabecalhos(aba)).toHaveLength(COLUNAS_FIXAS_BOLETIM + 7);
    expect(cabecalhos(aba)).toContain("Valor (R$) Executado na Medição");
    expect(cabecalhos(aba)).toContain("Reajuste na medição");
    expect(aba.getRow(LINHAS_CABECALHO_MARCA + 1).getCell(1).value).toBe(
      "Contrato K · CT 1/2026 · Obra K · Sem medição · Planilha v0",
    );
  });
});

describe("montarPlanilhaBoletim, reajuste (Fase 6)", () => {
  /** L09 até a 4ª com o SIAC da 4ª: grupo 04 = -48.781,32 e total -40.021,28 (prova 6h). */
  function boletimL09(): Boletim {
    const b = boletimK({ ate: 4 });
    b.medicoes = [1, 2, 3, 4].map((n) => ({
      id: `m${n}`, numero: n, periodo_inicio: "2026-02-01", periodo_fim: "2026-02-28", status: "aprovada", valor: "1.00",
      reajuste: n === 4 ? "-40021.28" : null, reajuste_situacao: n === 4 ? "definitivo" : null,
    }));
    b.linhas = [
      { ...linha("40", 1, "04", null, "titulo", null, null, {}, "100.00", "10.00", "50.00", "50.00", "0.5", "0.5"), reajuste_medicao: "-48781.32", reajuste_acumulado: "-48781.32" },
      { ...linha("41", 2, "04.03.02", "40", "servico", "95.54", "10", { "4": "1" }, "100.00", "10.00", "50.00", "50.00", "0.5", "0.5"), reajuste_medicao: "-95030.34", reajuste_acumulado: "-95030.34" },
    ];
    b.total = { ...b.total, reajuste_medicao: "-40021.28", reajuste_acumulado: "-40021.28" };
    return b;
  }

  it("as duas colunas novas ficam no fim, depois de % a Medir, em formato de dinheiro", async () => {
    const aba = await relerPlanilha(boletimL09());
    const titulos = cabecalhos(aba);
    expect(titulos.slice(-3)).toEqual(["Porcentagem a Medir (%)", "Reajuste na 4ª", "Reajuste acumulado"]);
    expect(titulos).toHaveLength(COLUNAS_FIXAS_BOLETIM + 4 + 7);
    const r = linhaDoCodigo(aba, "04");
    expect(r.getCell(coluna(aba, "Reajuste na 4ª")).value).toBe(-48781.32);
    expect(r.getCell(coluna(aba, "Reajuste acumulado")).value).toBe(-48781.32);
    expect(r.getCell(coluna(aba, "Reajuste acumulado")).numFmt).toBe('"R$" #,##0.00');
    expect(linhaDoCodigo(aba, "04.03.02").getCell(coluna(aba, "Reajuste na 4ª")).value).toBe(-95030.34);
  });

  it("o total é o do jsonb (-40021.28), não a soma das linhas", async () => {
    const aba = await relerPlanilha(boletimL09());
    const total = aba.getRow(linhaDoCabecalho(aba) + 3);
    expect(total.getCell(1).value).toBe("Total:");
    expect(total.getCell(coluna(aba, "Reajuste na 4ª")).value).toBe(-40021.28);
    expect(total.getCell(coluna(aba, "Reajuste acumulado")).value).toBe(-40021.28);
  });

  it("as colunas antigas continuam no mesmo lugar", async () => {
    const aba = await relerPlanilha(boletimL09());
    expect(coluna(aba, "Valor (R$) Executado na 4ª Medição")).toBe(COLUNAS_FIXAS_BOLETIM + 4 + 1);
    expect(coluna(aba, "Porcentagem a Medir (%)")).toBe(COLUNAS_FIXAS_BOLETIM + 4 + 5);
  });

  it("contrato sem regra de arredondamento: reajuste nulo vira célula vazia", async () => {
    const b = boletimL09();
    b.linhas = b.linhas.map((l) => ({ ...l, reajuste_medicao: null, reajuste_acumulado: null }));
    b.total = { ...b.total, reajuste_medicao: null, reajuste_acumulado: null };
    const aba = await relerPlanilha(b);
    expect(linhaDoCodigo(aba, "04").getCell(coluna(aba, "Reajuste acumulado")).value).toBeNull();
    const total = aba.getRow(linhaDoCabecalho(aba) + 3);
    expect(total.getCell(coluna(aba, "Reajuste na 4ª")).value).toBeNull();
  });
});

describe("nomeArquivoBoletim", () => {
  it("boletim-<codigo>-ate-<N>a-medicao.xlsx", () => {
    expect(nomeArquivoBoletim(boletimK())).toBe("boletim-K-ate-2a-medicao.xlsx");
    expect(nomeArquivoBoletim(boletimK({ ate: 10 }))).toBe("boletim-K-ate-10a-medicao.xlsx");
  });

  it("código com espaço ou barra não quebra o nome do arquivo", () => {
    const b = boletimK({ contrato: { ...boletimK().contrato, codigo: "BR 364/L09" } });
    expect(nomeArquivoBoletim(b)).toBe("boletim-BR-364-L09-ate-2a-medicao.xlsx");
  });

  it("contrato sem medição", () => {
    expect(nomeArquivoBoletim(boletimK({ ate: null }))).toBe("boletim-K-sem-medicao.xlsx");
  });
});
