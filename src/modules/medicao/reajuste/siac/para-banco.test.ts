// @vitest-environment node
import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, it } from "vitest";

import { extrairTextoPdf } from "./extrair";
import { lerRelatorioSiac } from "./ler-relatorio";
import { relatorioParaBanco } from "./para-banco";

it("monta o p_relatorio da 4ª do L09 com as 34 linhas de valor e os itens escolhidos", async () => {
  const r = lerRelatorioSiac(await extrairTextoPdf(new Uint8Array(await readFile(path.join(__dirname, "__fixtures__", "siac-l09-4a.pdf")))));
  const item = "11111111-1111-4111-8111-111111111111";
  const p = relatorioParaBanco(r, { "4,0|60112": { itens: [item], destino: null } }, "22222222-2222-4222-8222-222222222222");
  expect(p).toMatchObject({
    contrato_texto: "24 00615/2025 - CONSÓRCIO EMT-COLORADO I", medicao_numero: "4", situacao: "definitivo",
    valor_pi: "2616306.26", total: "-40021.28", arquivo_id: "22222222-2222-4222-8222-222222222222",
  });
  expect(p.linhas).toHaveLength(34);
  expect(p.grupos).toHaveLength(12);
  expect(p.indices).toHaveLength(14);
  expect(p.linhas.find((l) => l.grupo === "4,0" && l.codigo === "60112")).toMatchObject({ valor_pi: "539026.36", reajuste: "-95030.34", itens: [item] });
  expect(p.linhas.find((l) => l.grupo === "2,2" && l.codigo === "60112")?.itens).toEqual([]);
  expect(p.linhas.some((l) => l.valor_pi === "0.00")).toBe(false);
});
