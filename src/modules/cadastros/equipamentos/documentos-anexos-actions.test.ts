// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Prova das actions dos anexos dos documentos de equipamento:
 *
 * - `carregarAnexosDosDocumentos` checa `ver` ANTES de tocar no banco, pega os
 *   ids dos documentos no banco (não da tela) e lê os vínculos pela entidade
 *   "equipamento_documento".
 * - `removerDocumento` desfaz os vínculos do documento (a tabela polimórfica
 *   não cascateia), mas só DEPOIS de o delete ter removido a linha: delete
 *   barrado pela RLS volta zero linha, e aí nenhum anexo pode ser desvinculado.
 */

const DOCUMENTO = "11111111-2222-4333-8444-555555555555";
const EQUIPAMENTO = "66666666-7777-4888-8999-000000000000";

const estado = vi.hoisted(() => ({
  permitido: true,
  exigidas: [] as string[],
  operacoes: [] as string[],
  idsDocumentos: [] as { id: string }[],
  vinculos: [] as { id: string }[],
  removidos: [] as { id: string }[],
  rpcs: [] as { nome: string; args: unknown }[],
  listados: [] as { entidade: string; ids: string[] }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissoes", () => ({
  exigirPermissao: vi.fn(async (recurso: string, acao: string) => {
    estado.exigidas.push(`${recurso}/${acao}`);
    if (!estado.permitido) throw new Error("sem permissão");
    return { id: "00000000-0000-0000-0000-000000000001" };
  }),
}));
vi.mock("@/modules/_shared/anexos/queries", () => ({
  listarAnexosPorDocumento: vi.fn(async (entidade: string, ids: string[]) => {
    estado.listados.push({ entidade, ids });
    return { [ids[0]!]: [{ vinculoId: "v1" }] };
  }),
}));

/** Builder encadeável: registra a operação e resolve pelo par tabela/operação. */
function builder(tabela: string) {
  let operacao = "select";
  const filtros: string[] = [];
  const b = {
    select: () => b,
    delete: () => {
      operacao = "delete";
      return b;
    },
    eq: (coluna: string, valor: unknown) => {
      filtros.push(`${coluna}=${String(valor)}`);
      return b;
    },
    then: (resolver: (valor: unknown) => unknown) => {
      estado.operacoes.push(`${operacao} ${tabela} ${filtros.join("&")}`);
      let data: unknown = [];
      if (tabela === "anexo_vinculos") data = estado.vinculos;
      else if (operacao === "delete") data = estado.removidos;
      else data = estado.idsDocumentos;
      return Promise.resolve({ data, error: null }).then(resolver);
    },
  };
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (tabela: string) => builder(tabela),
    rpc: async (nome: string, args: unknown) => {
      estado.rpcs.push({ nome, args });
      estado.operacoes.push(`rpc ${nome}`);
      return { error: null };
    },
  }),
}));

import {
  carregarAnexosDosDocumentos,
  removerDocumento,
} from "@/modules/cadastros/equipamentos/actions";

beforeEach(() => {
  estado.permitido = true;
  estado.exigidas = [];
  estado.operacoes = [];
  estado.idsDocumentos = [];
  estado.vinculos = [];
  estado.removidos = [];
  estado.rpcs = [];
  estado.listados = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("carregarAnexosDosDocumentos", () => {
  it("sem permissão de ver devolve erro e não toca no banco", async () => {
    estado.permitido = false;
    await expect(carregarAnexosDosDocumentos(EQUIPAMENTO)).resolves.toEqual({
      erro: "Sem permissão para ver equipamentos",
    });
    expect(estado.exigidas).toEqual(["cadastros.equipamentos/ver"]);
    expect(estado.operacoes).toEqual([]);
    expect(estado.listados).toEqual([]);
  });

  it("id inválido não consulta nada", async () => {
    await expect(carregarAnexosDosDocumentos("abc")).resolves.toEqual({
      erro: "Equipamento inválido",
    });
    expect(estado.operacoes).toEqual([]);
  });

  it("lê os documentos do equipamento no banco e os vínculos pela entidade", async () => {
    estado.idsDocumentos = [{ id: DOCUMENTO }, { id: "d2" }];
    const resultado = await carregarAnexosDosDocumentos(EQUIPAMENTO);
    expect(estado.operacoes).toEqual([
      `select equipamento_documentos equipamento_id=${EQUIPAMENTO}`,
    ]);
    expect(estado.listados).toEqual([
      { entidade: "equipamento_documento", ids: [DOCUMENTO, "d2"] },
    ]);
    expect(resultado).toEqual({
      ok: true,
      anexos: { [DOCUMENTO]: [{ vinculoId: "v1" }] },
    });
  });

  it("equipamento sem documento não consulta vínculo", async () => {
    await expect(carregarAnexosDosDocumentos(EQUIPAMENTO)).resolves.toEqual({
      ok: true,
      anexos: {},
    });
    expect(estado.listados).toEqual([]);
  });
});

describe("removerDocumento", () => {
  it("desvincula os anexos do documento depois do delete", async () => {
    estado.vinculos = [{ id: "v1" }, { id: "v2" }];
    estado.removidos = [{ id: DOCUMENTO }];
    await expect(removerDocumento(DOCUMENTO)).resolves.toEqual({ ok: true });
    expect(estado.operacoes).toEqual([
      `select anexo_vinculos entidade_tipo=equipamento_documento&entidade_id=${DOCUMENTO}`,
      `delete equipamento_documentos id=${DOCUMENTO}`,
      "rpc fn_desvincular_arquivo",
      "rpc fn_desvincular_arquivo",
    ]);
    expect(estado.rpcs.map((r) => r.args)).toEqual([
      { p_vinculo_id: "v1" },
      { p_vinculo_id: "v2" },
    ]);
  });

  it("delete que não removeu linha não desvincula nada", async () => {
    estado.vinculos = [{ id: "v1" }];
    estado.removidos = [];
    await expect(removerDocumento(DOCUMENTO)).resolves.toEqual({
      erro: "Documento não encontrado ou sem permissão para remover",
    });
    expect(estado.rpcs).toEqual([]);
  });

  it("sem permissão de editar não toca no banco", async () => {
    estado.permitido = false;
    await expect(removerDocumento(DOCUMENTO)).resolves.toEqual({
      erro: "Sem permissão para editar equipamentos",
    });
    expect(estado.exigidas).toEqual(["cadastros.equipamentos/editar"]);
    expect(estado.operacoes).toEqual([]);
  });
});
