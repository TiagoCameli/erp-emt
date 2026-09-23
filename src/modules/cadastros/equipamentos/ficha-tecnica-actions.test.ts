import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Prova da action da ficha técnica: a checagem de permissão vem ANTES de
 * tocar no banco, e o upsert vai por `equipamento_id` com o payload convertido.
 * As linhas de controle são as que exigem `chamadas` vazio: uma action que
 * checasse a permissão depois do upsert passaria na tela do mesmo jeito.
 */

const estado = vi.hoisted(() => ({
  permitido: true,
  chamadas: [] as { tabela: string; payload: unknown; opcoes: unknown }[],
  erroUpsert: null as { code?: string; message?: string } | null,
  exigidas: [] as string[],
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
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (tabela: string) => ({
      upsert: (payload: unknown, opcoes: unknown) => {
        estado.chamadas.push({ tabela, payload, opcoes });
        return Promise.resolve({ error: estado.erroUpsert });
      },
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            estado.chamadas.push({ tabela, payload: "select", opcoes: null });
            return { data: null, error: null };
          },
        }),
      }),
    }),
  }),
}));

import {
  carregarFichaTecnica,
  salvarFichaTecnica,
} from "@/modules/cadastros/equipamentos/actions";
import { fichaParaFormulario } from "@/modules/cadastros/equipamentos/ficha-tecnica";

const EQUIPAMENTO = "11111111-2222-4333-8444-555555555555";

describe("salvarFichaTecnica", () => {
  beforeEach(() => {
    estado.permitido = true;
    estado.chamadas = [];
    estado.erroUpsert = null;
    estado.exigidas = [];
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("sem permissão de editar devolve erro e não toca no banco", async () => {
    estado.permitido = false;
    await expect(
      salvarFichaTecnica(EQUIPAMENTO, fichaParaFormulario(null)),
    ).resolves.toEqual({ erro: "Sem permissão para editar equipamentos" });
    expect(estado.exigidas).toEqual(["cadastros.equipamentos/editar"]);
    expect(estado.chamadas).toEqual([]);
  });

  it("id inválido e formulário inválido não chegam ao banco", async () => {
    await expect(
      salvarFichaTecnica("nao-e-id", fichaParaFormulario(null)),
    ).resolves.toEqual({ erro: "Equipamento inválido" });

    const resultado = await salvarFichaTecnica(EQUIPAMENTO, {
      ...fichaParaFormulario(null),
      capacidadeTanqueL: "1,23456",
    });
    expect(resultado).toHaveProperty("erro");
    expect(estado.chamadas).toEqual([]);
  });

  it("faz upsert por equipamento_id com número convertido e vazio em null", async () => {
    await expect(
      salvarFichaTecnica(EQUIPAMENTO, {
        ...fichaParaFormulario(null),
        capacidadeTanqueL: "350,1234",
        tipoOleoMotor: "",
      }),
    ).resolves.toEqual({ ok: true });

    expect(estado.chamadas).toHaveLength(1);
    const [chamada] = estado.chamadas;
    expect(chamada?.tabela).toBe("equipamento_especificacoes");
    expect(chamada?.opcoes).toEqual({ onConflict: "equipamento_id" });
    expect(chamada?.payload).toMatchObject({
      equipamento_id: EQUIPAMENTO,
      capacidade_tanque_l: 350.1234,
      tipo_oleo_motor: null,
      filtros: null,
    });
  });

  it("erro do banco vira mensagem, sem lançar", async () => {
    estado.erroUpsert = { code: "42501", message: "row-level security" };
    await expect(
      salvarFichaTecnica(EQUIPAMENTO, fichaParaFormulario(null)),
    ).resolves.toEqual({
      erro: "Não foi possível salvar a ficha técnica. Tente novamente",
    });
  });
});

describe("carregarFichaTecnica", () => {
  beforeEach(() => {
    estado.permitido = true;
    estado.chamadas = [];
    estado.exigidas = [];
  });

  it("sem permissão de ver devolve erro e não consulta", async () => {
    estado.permitido = false;
    await expect(carregarFichaTecnica(EQUIPAMENTO)).resolves.toEqual({
      erro: "Sem permissão para ver equipamentos",
    });
    expect(estado.exigidas).toEqual(["cadastros.equipamentos/ver"]);
    expect(estado.chamadas).toEqual([]);
  });

  it("equipamento sem ficha devolve null", async () => {
    await expect(carregarFichaTecnica(EQUIPAMENTO)).resolves.toEqual({
      ok: true,
      ficha: null,
    });
    expect(estado.chamadas).toHaveLength(1);
  });
});
