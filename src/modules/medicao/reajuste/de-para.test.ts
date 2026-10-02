// @vitest-environment node
import { readFile } from "node:fs/promises";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { chaveLinha, sugerirDePara, type ItemCandidato } from "./de-para";
import { extrairTextoPdf } from "./siac/extrair";
import { lerRelatorioSiac, type RelatorioSiac } from "./siac/ler-relatorio";
import { normalizarUnidade } from "./unidade";

// Serviços da v0 do L09 com o valor de cada um na 4ª (mc_v_medicao_itens), tirados do banco em 02/10/2026.
import itensL09 from "./__fixtures__/l09-4a-itens.json";

const ITENS = itensL09 as ItemCandidato[];
const codigoDe = new Map(ITENS.map((i) => [i.itemId, i.codigo]));

// A sugestão esperada para as 34 linhas com valor da 4ª (conferida linha a linha contra a planilha).
const ESPERADO: Record<string, string> = {
  "1,0|55072": "01.01",
  "2,2|29083": "02.07.06.01", "2,2|51269": "02.07.05", "2,2|60112": "02.07.07.02", "2,2|86522": "02.07.01",
  "2,2|90224": "02.07.02", "2,2|93793": "02.07.09", "2,2|200134": "02.07.06.02", "2,2|201005": "02.07.07.03",
  "2,2|290300": "02.07.03", "2,2|322022": "02.07.06", "2,2|517556": "02.07.07", "2,2|517557": "02.07.04",
  "2,2|517560": "02.07.08", "2,2|6011205": "02.07.07.01",
  "2,5|49299": "02.10.02", "2,5|49401": "02.10.01", "2,5|517573": "02.10.03",
  "3,5|49321": "03.15.08", "3,5|91396": "03.15.03", "3,5|91826": "03.15.05", "3,5|517521": "03.15.13",
  "4,0|29083": "04.04.01", "4,0|55025": "04.02", "4,0|60112": "04.03.02", "4,0|200134": "04.04.02",
  "4,0|201005": "04.03.03", "4,0|322022": "04.04", "4,0|517555": "04.03", "4,0|6011205": "04.03.01",
  "4,1|49299": "04.05.01", "4,1|517573": "04.05.02",
  "7,0|52482": "07.02",
  "8,0|49408": "08.01",
};

let relatorio: RelatorioSiac;
beforeAll(async () => {
  relatorio = lerRelatorioSiac(await extrairTextoPdf(new Uint8Array(await readFile(path.join(__dirname, "siac", "__fixtures__", "siac-l09-4a.pdf")))));
});

describe("normalizarUnidade", () => {
  it("casa as unidades do SIAC com as da planilha", () => {
    expect(normalizarUnidade("T/KM")).toBe(normalizarUnidade("tkm"));
    expect(normalizarUnidade("UN/DIA")).toBe(normalizarUnidade("un.dia"));
    expect(normalizarUnidade("M²")).toBe(normalizarUnidade("m²"));
    expect(normalizarUnidade("MES")).toBe(normalizarUnidade("mês"));
    expect(normalizarUnidade("UND")).toBe(normalizarUnidade("un"));
    expect(normalizarUnidade("M³")).not.toBe(normalizarUnidade("m²"));
  });
});

describe("sugerirDePara com a 4ª real do L09", () => {
  it("sugere um item para cada uma das 34 linhas com valor, e o certo", () => {
    const s = sugerirDePara(relatorio.linhas, ITENS, []);
    expect(s.size).toBe(34);
    const obtido = Object.fromEntries([...s].map(([k, c]) => [k, c.itens.map((i) => codigoDe.get(i)).join(",")]));
    expect(obtido).toEqual(ESPERADO);
  });

  it("o CAP do 2,2 vai para o 02.07.07.02 e o do 4,0 para o 04.03.02 (mesmo SICRO, preço e unidade)", () => {
    const s = sugerirDePara(relatorio.linhas, ITENS, []);
    expect(codigoDe.get(s.get(chaveLinha("2,2", "60112"))!.itens[0])).toBe("02.07.07.02");
    expect(codigoDe.get(s.get(chaveLinha("4,0", "60112"))!.itens[0])).toBe("04.03.02");
  });

  it("transporte de RR-1C do 4,0 fica no 04.04.02 e não no 04.03.03 (preço a 0,27%, dentro da tolerância)", () => {
    const s = sugerirDePara(relatorio.linhas, ITENS, []);
    expect(codigoDe.get(s.get(chaveLinha("4,0", "200134"))!.itens[0])).toBe("04.04.02");
  });

  it("marca para conferir só a imprimação (02.07.05 sem valor na 4ª)", () => {
    const s = sugerirDePara(relatorio.linhas, ITENS, []);
    expect([...s].filter(([, c]) => c.conferir).map(([k]) => k)).toEqual(["2,2|51269"]);
  });

  it("casamento salvo vale de novo e só a linha nova é sugerida", () => {
    const cap = ITENS.find((i) => i.codigo === "04.03.02")!;
    const outro = ITENS.find((i) => i.codigo === "04.03.03")!;
    const s = sugerirDePara(relatorio.linhas, ITENS, [
      { grupo: "4,0", codigo: "60112", itemId: cap.itemId },
      { grupo: "4,0", codigo: "60112", itemId: outro.itemId },
    ]);
    expect(s.get(chaveLinha("4,0", "60112"))).toEqual({ itens: [cap.itemId, outro.itemId], origem: "salvo", conferir: false });
    expect(s.get(chaveLinha("2,2", "60112"))?.origem).toBe("sugerido");
  });

  it("salvo com item que saiu da planilha volta a ser sugerido; linha sem candidato fica vazia", () => {
    const s = sugerirDePara(
      [...relatorio.linhas, { grupo: "9,0", codigo: "1", unidade: "KG", precoUnitario: "1.0000", valorPiLiquido: "10.00" }],
      ITENS,
      [{ grupo: "8,0", codigo: "49408", itemId: "00000000-0000-4000-8000-000000000000" }],
    );
    expect(s.get(chaveLinha("8,0", "49408"))?.origem).toBe("sugerido");
    expect(s.get(chaveLinha("9,0", "1"))).toEqual({ itens: [], origem: "sem_candidato", conferir: true });
  });
});
