// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  negadas: [] as string[],
  chamadas: [] as { fn: string; args: Record<string, unknown> }[],
  status: "pendente_aprovacao" as string | null,
  resposta: { data: null as unknown, error: null as { code?: string; message?: string } | null },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissoes", () => ({
  exigirPermissao: vi.fn(async (recurso: string, acao: string) => {
    if (estado.negadas.includes(`${recurso}/${acao}`)) throw new Error("Sem permissão");
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      estado.chamadas.push({ fn, args });
      return estado.resposta;
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: estado.status === null ? null : { status: estado.status }, error: null }),
        }),
      }),
    }),
  }),
}));

import { aprovarAjuste, desaprovarAjuste, rejeitarAjuste, salvarAjuste } from "@/modules/frete/ajustes/actions";
import type { AjusteInput } from "@/modules/frete/ajustes/schemas";

const ID = "33333333-3333-4333-8333-333333333333";
const DADOS: AjusteInput = {
  transportadoraId: "11111111-1111-4111-8111-111111111111",
  sinal: "credito",
  valor: 1000.1234,
  data: "2026-09-23T19:30:00-05:00",
  mesReferencia: "2026-09-01",
  centroCustoId: null,
  descricao: "Diferença de preço",
};

beforeEach(() => {
  estado.negadas = [];
  estado.chamadas = [];
  estado.status = "pendente_aprovacao";
  estado.resposta = { data: ID, error: null };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("salvarAjuste", () => {
  it("sem frete.ajustes/criar não chama o banco", async () => {
    estado.negadas = ["frete.ajustes/criar"];
    await expect(salvarAjuste(null, DADOS)).resolves.toEqual({ erro: "Sem permissão para ajustar saldo" });
    expect(estado.chamadas).toEqual([]);
  });

  it("cria com p_id nulo e p_dados da RPC", async () => {
    await expect(salvarAjuste(null, DADOS)).resolves.toEqual({ ok: true, id: ID });
    expect(estado.chamadas).toEqual([
      {
        fn: "fn_frete_ajuste_salvar",
        args: {
          p_id: null,
          p_dados: {
            transportadora_id: DADOS.transportadoraId,
            sinal: "credito",
            valor: 1000.1234,
            data: DADOS.data,
            mes_referencia: "2026-09-01",
            centro_custo_id: null,
            descricao: "Diferença de preço",
          },
        },
      },
    ]);
  });

  it("edita pelo id; id ruim ou valor zero não chega ao banco", async () => {
    await salvarAjuste(ID, DADOS);
    expect(estado.chamadas[0]!.args.p_id).toBe(ID);
    estado.chamadas = [];
    await expect(salvarAjuste("x", DADOS)).resolves.toEqual({ erro: "Ajuste inválido" });
    await expect(salvarAjuste(null, { ...DADOS, valor: 0 })).resolves.toHaveProperty("erro");
    expect(estado.chamadas).toEqual([]);
  });

  it("a trava do banco (editar aprovado) chega à tela", async () => {
    estado.resposta = { data: null, error: { code: "P0001", message: "Só dá para editar ajuste pendente: desaprove antes" } };
    await expect(salvarAjuste(ID, DADOS)).resolves.toEqual({ erro: "Só dá para editar ajuste pendente: desaprove antes" });
  });
});

describe("aprovar, rejeitar e desaprovar", () => {
  it("aprovar pede frete.ajustes/aprovar", async () => {
    estado.negadas = ["frete.ajustes/aprovar"];
    await expect(aprovarAjuste(ID)).resolves.toEqual({ erro: "Sem permissão para aprovar ajuste" });
    estado.negadas = [];
    estado.resposta = { data: null, error: null };
    await expect(aprovarAjuste(ID)).resolves.toEqual({ ok: true });
    expect(estado.chamadas).toEqual([{ fn: "fn_frete_ajuste_aprovar", args: { p_id: ID } }]);
  });

  it("rejeitar pede aprovar, motivo, e só o pendente", async () => {
    estado.resposta = { data: null, error: null };
    estado.negadas = ["frete.ajustes/aprovar"];
    await expect(rejeitarAjuste(ID, "Duplicado")).resolves.toEqual({ erro: "Sem permissão para rejeitar ajuste" });
    estado.negadas = [];
    await expect(rejeitarAjuste(ID, "  ")).resolves.toEqual({ erro: "Informe o motivo" });
    estado.status = "aprovado";
    await expect(rejeitarAjuste(ID, "Duplicado")).resolves.toEqual({
      erro: "Só dá para rejeitar ajuste pendente de aprovação",
    });
    expect(estado.chamadas).toEqual([]);
    estado.status = "pendente_aprovacao";
    await expect(rejeitarAjuste(ID, " Duplicado ")).resolves.toEqual({ ok: true });
    expect(estado.chamadas).toEqual([{ fn: "fn_frete_ajuste_desaprovar", args: { p_id: ID, p_motivo: "Duplicado" } }]);
  });

  it("desaprovar pede desaprovar e só o aprovado", async () => {
    estado.resposta = { data: null, error: null };
    estado.negadas = ["frete.ajustes/desaprovar"];
    await expect(desaprovarAjuste(ID, "Valor errado")).resolves.toEqual({ erro: "Sem permissão para desaprovar ajuste" });
    estado.negadas = [];
    await expect(desaprovarAjuste(ID, "Valor errado")).resolves.toEqual({ erro: "Só dá para desaprovar ajuste aprovado" });
    estado.status = null;
    await expect(desaprovarAjuste(ID, "Valor errado")).resolves.toEqual({ erro: "Ajuste não encontrado" });
    expect(estado.chamadas).toEqual([]);
    estado.status = "aprovado";
    await expect(desaprovarAjuste(ID, "Valor errado")).resolves.toEqual({ ok: true });
    expect(estado.chamadas).toEqual([{ fn: "fn_frete_ajuste_desaprovar", args: { p_id: ID, p_motivo: "Valor errado" } }]);
  });
});
