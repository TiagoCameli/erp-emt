// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Jazida é de uma obra (Tiago, 16/10/2026). O banco recusa jazida ativa sem obra e leva a obra
 * para quem está nela (migration v1.20); aqui fica o lado da tela: o schema avisa antes de tocar
 * no mapa e as actions chamam fn_mapa_local_gravar com os nomes de parâmetro que existem.
 */

const rpc = vi.fn();
const exigirPermissao = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissoes", () => ({
  exigirPermissao: (...args: unknown[]) => exigirPermissao(...args),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: (...args: unknown[]) => rpc(...args) }),
}));
vi.mock("@/modules/mapa/queries", () => ({
  carregarEstadoMapa: async () => ({ estado: null }),
}));

import {
  colocarLocal,
  editarLocal,
  inativarLocal,
} from "@/modules/mapa/actions";
import {
  colocarLocalSchema,
  editarLocalSchema,
  ERRO_JAZIDA_SEM_OBRA,
} from "@/modules/mapa/schemas";

const LOCAL = "11111111-1111-4111-8111-111111111111";
const OBRA = "22222222-2222-4222-8222-222222222222";
const PONTO = { lng: -72.7, lat: -7.6 };

describe("jazida exige obra no schema", () => {
  it("criar jazida sem obra é recusado; com obra passa; outro tipo não pede obra", () => {
    const base = { nome: "Jazida Nova", ...PONTO };
    const sem = colocarLocalSchema.safeParse({ ...base, tipos: ["jazida"] });
    expect(sem.success).toBe(false);
    expect(sem.error?.issues[0]?.message).toBe(ERRO_JAZIDA_SEM_OBRA);
    expect(
      colocarLocalSchema.safeParse({ ...base, tipos: ["jazida"], obraId: OBRA })
        .success,
    ).toBe(true);
    expect(
      colocarLocalSchema.safeParse({ ...base, tipos: ["oficina"] }).success,
    ).toBe(true);
  });

  it("jazida como tipo secundário também exige obra", () => {
    const r = colocarLocalSchema.safeParse({
      nome: "Pátio e jazida",
      tipos: ["patio", "jazida"],
      ...PONTO,
    });
    expect(r.success).toBe(false);
  });

  it("editar: jazida sem obra recusa; tirar o tipo jazida deixa salvar sem obra", () => {
    const base = { localidadeId: LOCAL, nome: "Jazida" };
    expect(
      editarLocalSchema.safeParse({ ...base, tipos: ["jazida"], obraId: null })
        .success,
    ).toBe(false);
    expect(
      editarLocalSchema.safeParse({ ...base, tipos: ["jazida"], obraId: OBRA })
        .success,
    ).toBe(true);
    expect(
      editarLocalSchema.safeParse({ ...base, tipos: ["patio"], obraId: null })
        .success,
    ).toBe(true);
  });
});

describe("actions de local chamam fn_mapa_local_gravar", () => {
  beforeEach(() => {
    exigirPermissao.mockReset().mockResolvedValue(undefined);
    rpc.mockReset().mockResolvedValue({ data: LOCAL, error: null });
  });

  it("criar jazida leva a obra", async () => {
    const r = await colocarLocal({
      nome: "Jazida Nova",
      tipos: ["jazida"],
      obraId: OBRA,
      ...PONTO,
    });
    expect(r).toMatchObject({ ok: true });
    expect(rpc).toHaveBeenCalledWith("fn_mapa_local_gravar", {
      p_id: null,
      p_nome: "Jazida Nova",
      p_tipos: ["jazida"],
      p_lng: PONTO.lng,
      p_lat: PONTO.lat,
      p_obra: OBRA,
      p_ativo: null,
    });
  });

  it("mover um local que existe não mexe na obra (p_obra null)", async () => {
    await colocarLocal({ localidadeId: LOCAL, ...PONTO });
    expect(rpc).toHaveBeenCalledWith(
      "fn_mapa_local_gravar",
      expect.objectContaining({ p_id: LOCAL, p_obra: null, p_ativo: null }),
    );
  });

  it("editar troca a obra", async () => {
    await editarLocal({
      localidadeId: LOCAL,
      nome: "Jazida",
      tipos: ["jazida"],
      obraId: OBRA,
    });
    expect(rpc).toHaveBeenCalledWith("fn_mapa_local_gravar", {
      p_id: LOCAL,
      p_nome: "Jazida",
      p_tipos: ["jazida"],
      p_lng: null,
      p_lat: null,
      p_obra: OBRA,
      p_ativo: null,
    });
  });

  it("inativar manda só p_ativo false", async () => {
    await inativarLocal({ localidadeId: LOCAL });
    expect(rpc).toHaveBeenCalledWith("fn_mapa_local_gravar", {
      p_id: LOCAL,
      p_nome: null,
      p_tipos: null,
      p_lng: null,
      p_lat: null,
      p_obra: null,
      p_ativo: false,
    });
  });

  it("a recusa do banco (23514) chega ao toast com o texto dele", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: "23514",
        message: 'Jazida "Jazida X" precisa estar atrelada a uma obra',
      },
    });
    const r = await colocarLocal({ localidadeId: LOCAL, ...PONTO });
    expect(r).toEqual({
      erro: 'Jazida "Jazida X" precisa estar atrelada a uma obra',
    });
  });
});
