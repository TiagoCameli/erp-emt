// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O xlsx para baixar no detalhe da versão casa pelo SHA-256 (arquivos.hash_sha256 =
 * versao.arquivo_hash), e não pelo nome: dois envios com o mesmo nome e conteúdo diferente.
 */

type Vinculo = { id: string; created_at: string; arquivos: { nome_original: string; hash_sha256: string | null } | null };

const estado = vi.hoisted(() => ({
  vinculos: [] as Vinculo[],
  filtros: [] as [string, unknown][],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (tabela: string) => {
      estado.filtros.push(["from", tabela]);
      const q = {
        select: (colunas: string) => (estado.filtros.push(["select", colunas]), q),
        eq: (coluna: string, valor: unknown) => (estado.filtros.push([coluna, valor]), q),
        order: () => q,
        limit: async (n: number) => {
          // Aplica os filtros de igualdade como o PostgREST faria (inclusive no recurso embutido).
          const hash = estado.filtros.find(([c]) => c === "arquivos.hash_sha256")?.[1];
          const achados = estado.vinculos
            .filter((v) => v.arquivos && v.arquivos.hash_sha256 === hash)
            .sort((a, b) => b.created_at.localeCompare(a.created_at));
          return { data: achados.slice(0, n), error: null };
        },
      };
      return q;
    },
  }),
}));

import { xlsxImportadoDaVersao } from "@/modules/medicao/planilha/queries";

const V = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  estado.filtros = [];
  estado.vinculos = [
    { id: "v1", created_at: "2026-09-01T10:00:00Z", arquivos: { nome_original: "planilha.xlsx", hash_sha256: "aaa" } },
    // Mesmo nome, conteúdo diferente, enviado depois: o casamento por nome escolheria este.
    { id: "v2", created_at: "2026-09-02T10:00:00Z", arquivos: { nome_original: "planilha.xlsx", hash_sha256: "bbb" } },
  ];
});

describe("xlsxImportadoDaVersao", () => {
  it("escolhe o anexo com o hash da versão, mesmo havendo outro de mesmo nome mais recente", async () => {
    await expect(xlsxImportadoDaVersao(V, "aaa")).resolves.toEqual({ vinculoId: "v1", nome: "planilha.xlsx" });
    expect(estado.filtros).toContainEqual(["arquivos.hash_sha256", "aaa"]);
    expect(estado.filtros).toContainEqual(["entidade_tipo", "mc_planilha_versao"]);
    expect(estado.filtros).toContainEqual(["entidade_id", V]);
    expect(estado.filtros.find(([c]) => c === "select")?.[1]).toContain("arquivos!inner");
  });

  it("nenhum anexo com o hash: não oferece baixar", async () => {
    await expect(xlsxImportadoDaVersao(V, "ccc")).resolves.toBeNull();
  });

  it("versão sem hash (ainda não importada): nem consulta", async () => {
    await expect(xlsxImportadoDaVersao(V, null)).resolves.toBeNull();
    expect(estado.filtros).toEqual([]);
  });
});
