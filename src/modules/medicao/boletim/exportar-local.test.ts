// @vitest-environment node
import { readFileSync, writeFileSync } from "node:fs";

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { ABA_PLANILHA_BOLETIM, montarPlanilhaBoletim } from "@/modules/medicao/boletim/planilha";
import type { Boletim } from "@/modules/medicao/boletim/tipos";

/**
 * Ferramenta da conferência do Lote 09 (Task 8), não teste de CI: gera o xlsx a partir do jsonb que
 * a RPC `fn_mc_boletim` devolveu no banco de produção.
 *
 *   MC_BOLETIM_JSON=.../boletim_l09.json MC_BOLETIM_XLSX=.../boletim_l09.xlsx \
 *     npx vitest run src/modules/medicao/boletim/exportar-local.test.ts
 *
 * Sem `MC_BOLETIM_JSON` o teste é pulado. O arquivo só é gravado quando as duas variáveis existem;
 * só com o JSON ele monta e relê a planilha, sem gravar nada.
 */

const ENTRADA = process.env.MC_BOLETIM_JSON;
const SAIDA = process.env.MC_BOLETIM_XLSX;

describe("export local do boletim", () => {
  it.runIf(Boolean(ENTRADA))("gera o xlsx a partir do JSON da RPC", async () => {
    const bruto: unknown = JSON.parse(readFileSync(ENTRADA as string, "utf8"));
    // O `execute_sql` devolve `[{ fn_mc_boletim: {...} }]`; o CLI pode devolver o objeto direto.
    const boletim = (
      Array.isArray(bruto) ? Object.values(bruto[0] as Record<string, unknown>)[0] : bruto
    ) as Boletim;
    expect(Array.isArray(boletim.linhas)).toBe(true);

    const buffer = await (await montarPlanilhaBoletim(boletim)).xlsx.writeBuffer();
    const lido = new ExcelJS.Workbook();
    await lido.xlsx.load(buffer);
    expect(lido.getWorksheet(ABA_PLANILHA_BOLETIM)).toBeDefined();

    if (SAIDA) writeFileSync(SAIDA, Buffer.from(buffer));
  });
});
