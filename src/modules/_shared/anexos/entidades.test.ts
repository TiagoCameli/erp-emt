// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ENTIDADES_ANEXO,
  ehEntidadeAnexo,
  recursoDaEntidade,
  rotuloDaEntidade,
} from "@/modules/_shared/anexos/entidades";

/**
 * O mapa do TypeScript espelha public.fn_recurso_da_entidade: a RLS dos
 * vínculos deriva a permissão pela função, a Server Action pelo mapa. Se os
 * dois divergem, a tela promete um anexo que o banco recusa (ou o contrário).
 * A prova lê a ÚLTIMA migration que recria a função e compara par a par.
 */
function mapaDaFuncaoNoBanco(): Record<string, string> {
  const pasta = join(process.cwd(), "supabase", "migrations");
  const arquivos = readdirSync(pasta)
    .filter((nome) => nome.endsWith(".sql"))
    .sort();

  let corpo: string | null = null;
  for (const nome of arquivos) {
    const sql = readFileSync(join(pasta, nome), "utf8");
    const inicio = sql.search(
      /create or replace function public\.fn_recurso_da_entidade/i,
    );
    if (inicio === -1) continue;
    const resto = sql.slice(inicio);
    const fim = resto.search(/\bend;/i);
    corpo = fim === -1 ? resto : resto.slice(0, fim);
  }
  if (corpo === null) throw new Error("fn_recurso_da_entidade não encontrada");

  const mapa: Record<string, string> = {};
  for (const par of corpo.matchAll(/when\s+'([^']+)'\s+then\s+'([^']+)'/gi)) {
    mapa[par[1]!] = par[2]!;
  }
  return mapa;
}

describe("entidades de anexo", () => {
  it("documento do equipamento anexa pelo recurso do cadastro de equipamentos", () => {
    expect(ehEntidadeAnexo("equipamento_documento")).toBe(true);
    expect(recursoDaEntidade("equipamento_documento")).toBe(
      "cadastros.equipamentos",
    );
    expect(rotuloDaEntidade("equipamento_documento")).toBe(
      "documento do equipamento",
    );
  });

  it("linha de controle: tipo desconhecido não é entidade", () => {
    expect(ehEntidadeAnexo("equipamento")).toBe(false);
    expect(ehEntidadeAnexo("")).toBe(false);
  });

  it("todo tipo tem rótulo", () => {
    for (const entidade of ENTIDADES_ANEXO) {
      expect(rotuloDaEntidade(entidade)).toBeTruthy();
    }
  });

  it("o mapa do TypeScript é igual ao da função do banco", () => {
    const doBanco = mapaDaFuncaoNoBanco();
    const doTs = Object.fromEntries(
      ENTIDADES_ANEXO.map((entidade) => [entidade, recursoDaEntidade(entidade)]),
    );
    expect(doBanco["equipamento_documento"]).toBe("cadastros.equipamentos");
    expect(doTs).toEqual(doBanco);
  });
});
