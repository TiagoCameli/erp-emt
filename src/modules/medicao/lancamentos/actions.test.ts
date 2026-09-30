// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Server Actions de Lançamentos: `salvarLancamento` grava o texto com PONTO decimal (D7: nunca
 * por Number) e distingue o excesso (`MCEXC`) do erro comum (`P0001`); `excluirLancamento` exige
 * permissão; `conferirColagem`/`gravarColagem` tratam os dois formatos em que a RPC devolve o
 * resultado (jsonb direto, ou o P0001 "Nada foi gravado" com a lista de erros no `details`).
 */

const estado = vi.hoisted(() => ({
  negadas: [] as string[],
  chamadas: [] as { fn: string; args: Record<string, unknown> }[],
  resposta: { data: null as unknown, error: null as { code?: string; message?: string; details?: string } | null },
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
  }),
}));

import {
  conferirColagem,
  excluirLancamento,
  gravarColagem,
  salvarLancamento,
} from "@/modules/medicao/lancamentos/actions";
import type { LancamentoFormInput } from "@/modules/medicao/lancamentos/schemas";
import type { LinhaParaColar } from "@/modules/medicao/lancamentos/tipos";

const CONTRATO = "33333333-3333-4333-8333-333333333333";
const ITEM = "44444444-4444-4444-8444-444444444444";
const LANCAMENTO = "55555555-5555-4555-8555-555555555555";

function form(over: Partial<LancamentoFormInput> = {}): LancamentoFormInput {
  return {
    contratoId: CONTRATO,
    itemId: ITEM,
    data: "2026-09-10",
    quantidade: "10",
    kmInicial: "",
    kmFinal: "",
    estaca: "",
    localTexto: "",
    observacao: "",
    motivoExcesso: "",
    ...over,
  };
}

beforeEach(() => {
  estado.negadas = [];
  estado.chamadas = [];
  estado.resposta = { data: null, error: null };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("salvarLancamento", () => {
  it("sem medicao.lancamentos/criar não chama o banco", async () => {
    estado.negadas = ["medicao.lancamentos/criar"];
    await expect(salvarLancamento(form())).resolves.toEqual({
      ok: false,
      erro: "Sem permissão para lançar",
      excesso: false,
    });
    expect(estado.chamadas).toEqual([]);
  });

  it("ao editar, confere medicao.lancamentos/editar (não criar)", async () => {
    estado.negadas = ["medicao.lancamentos/criar"];
    estado.resposta = { data: LANCAMENTO, error: null };
    await expect(salvarLancamento(form(), LANCAMENTO)).resolves.toEqual({ ok: true, id: LANCAMENTO });
  });

  it("quantidade pt-BR com milhar vira texto com PONTO decimal, nunca por Number", async () => {
    estado.resposta = { data: "novo-id", error: null };
    await salvarLancamento(form({ quantidade: "1.234,5" }));
    expect(estado.chamadas[0].args.p_dados).toMatchObject({ quantidade: "1234.5" });
  });

  it("km vazio vai como null; km preenchido vira texto com ponto", async () => {
    estado.resposta = { data: "novo-id", error: null };
    await salvarLancamento(form({ kmInicial: "100,25", kmFinal: "" }));
    expect(estado.chamadas[0].args.p_dados).toMatchObject({ km_inicial: "100.25", km_final: null });
  });

  it("motivo do excesso vazio vai como null (não string vazia)", async () => {
    estado.resposta = { data: "novo-id", error: null };
    await salvarLancamento(form({ motivoExcesso: "" }));
    expect(estado.chamadas[0].args.p_dados).toMatchObject({ motivo_excesso: null });
  });

  it("reenvia o motivo do excesso ao editar, para não apagar um excesso já aceito", async () => {
    estado.resposta = { data: LANCAMENTO, error: null };
    await salvarLancamento(form({ motivoExcesso: "Chuva atrasou o cronograma" }), LANCAMENTO);
    expect(estado.chamadas[0].args.p_dados).toMatchObject({ motivo_excesso: "Chuva atrasou o cronograma" });
    expect(estado.chamadas[0].args.p_id).toBe(LANCAMENTO);
  });

  it("grava com sucesso e devolve o id", async () => {
    estado.resposta = { data: "novo-id", error: null };
    await expect(salvarLancamento(form())).resolves.toEqual({ ok: true, id: "novo-id" });
    expect(estado.chamadas).toEqual([
      {
        fn: "fn_mc_lancamento_salvar",
        args: {
          p_contrato: CONTRATO,
          p_dados: {
            item_id: ITEM,
            data: "2026-09-10",
            quantidade: "10",
            km_inicial: null,
            km_final: null,
            estaca: null,
            local_texto: null,
            observacao: null,
            motivo_excesso: null,
          },
          p_id: undefined,
        },
      },
    ]);
  });

  it("excesso (MCEXC): excesso:true e a mensagem do banco, sem virar log de erro", async () => {
    estado.resposta = {
      data: null,
      error: { code: "MCEXC", message: "O acumulado do 02.02 passa a 1.100 m3, acima do previsto de 1.000 m3. Informe o motivo" },
    };
    await expect(salvarLancamento(form())).resolves.toEqual({
      ok: false,
      erro: "O acumulado do 02.02 passa a 1.100 m3, acima do previsto de 1.000 m3. Informe o motivo",
      excesso: true,
    });
  });

  it("erro comum (P0001) chega como está, pt-BR, excesso:false", async () => {
    estado.resposta = { data: null, error: { code: "P0001", message: "Não há medição aberta para 10/09/2026" } };
    await expect(salvarLancamento(form())).resolves.toEqual({
      ok: false,
      erro: "Não há medição aberta para 10/09/2026",
      excesso: false,
    });
  });

  it("erro de infraestrutura vira mensagem genérica, sem vazar detalhe técnico", async () => {
    estado.resposta = { data: null, error: { code: "42501", message: "permission denied for table mc_lancamentos" } };
    await expect(salvarLancamento(form())).resolves.toEqual({
      ok: false,
      erro: "Não foi possível lançar. Tente novamente",
      excesso: false,
    });
  });

  it("quantidade que não dá para interpretar não chama o banco", async () => {
    await expect(salvarLancamento(form({ quantidade: "abc" }))).resolves.toEqual({
      ok: false,
      erro: "Quantidade inválida",
      excesso: false,
    });
    expect(estado.chamadas).toEqual([]);
  });

  it("item vazio não chama o banco (zod recusa antes)", async () => {
    await expect(salvarLancamento(form({ itemId: "" }))).resolves.toHaveProperty("erro");
    expect(estado.chamadas).toEqual([]);
  });
});

describe("excluirLancamento", () => {
  it("sem medicao.lancamentos/excluir não chama o banco", async () => {
    estado.negadas = ["medicao.lancamentos/excluir"];
    await expect(excluirLancamento(LANCAMENTO, "motivo qualquer")).resolves.toEqual({
      erro: "Sem permissão para excluir lançamento",
    });
    expect(estado.chamadas).toEqual([]);
  });

  it("exclui com sucesso", async () => {
    estado.resposta = { data: null, error: null };
    await expect(excluirLancamento(LANCAMENTO, "Lançado em duplicidade")).resolves.toEqual({ ok: true });
    expect(estado.chamadas).toEqual([
      { fn: "fn_mc_lancamento_excluir", args: { p_id: LANCAMENTO, p_motivo: "Lançado em duplicidade" } },
    ]);
  });

  it("a recusa do banco (motivo curto) chega como está", async () => {
    estado.resposta = { data: null, error: { code: "P0001", message: "Informe o motivo da exclusão" } };
    await expect(excluirLancamento(LANCAMENTO, "ab")).resolves.toEqual({ erro: "Informe o motivo da exclusão" });
  });
});

function linha(over: Partial<LinhaParaColar> = {}): LinhaParaColar {
  return {
    linha: 1,
    data: "2026-09-10",
    itemId: ITEM,
    quantidade: "10",
    kmInicial: null,
    kmFinal: null,
    estaca: null,
    observacao: null,
    motivoExcesso: null,
    ...over,
  };
}

describe("conferirColagem", () => {
  it("sem medicao.lancamentos/criar não chama o banco", async () => {
    estado.negadas = ["medicao.lancamentos/criar"];
    await expect(conferirColagem(CONTRATO, [linha()])).resolves.toEqual({ erro: "Sem permissão para lançar" });
    expect(estado.chamadas).toEqual([]);
  });

  it("sem linhas não chama o banco", async () => {
    await expect(conferirColagem(CONTRATO, [])).resolves.toEqual({ erro: "Cole pelo menos uma linha" });
    expect(estado.chamadas).toEqual([]);
  });

  it("chama com p_gravar false e devolve o jsonb como veio", async () => {
    estado.resposta = { data: { gravadas: 0, validas: 1, erros: [] }, error: null };
    await expect(conferirColagem(CONTRATO, [linha()])).resolves.toEqual({
      ok: true,
      resultado: { gravadas: 0, validas: 1, erros: [] },
    });
    expect(estado.chamadas).toEqual([
      {
        fn: "fn_mc_lancamentos_colar",
        args: {
          p_contrato: CONTRATO,
          p_linhas: [
            {
              linha: 1,
              data: "2026-09-10",
              item_id: ITEM,
              quantidade: "10",
              km_inicial: null,
              km_final: null,
              estaca: null,
              observacao: null,
              motivo_excesso: null,
            },
          ],
          p_gravar: false,
        },
      },
    ]);
  });

  it("linha com excesso: o erro da linha traz excesso:true", async () => {
    estado.resposta = {
      data: { gravadas: 0, validas: 1, erros: [{ linha: 2, erro: "O acumulado passa do previsto", excesso: true }] },
      error: null,
    };
    const resultado = await conferirColagem(CONTRATO, [linha(), linha({ linha: 2 })]);
    expect(resultado).toEqual({
      ok: true,
      resultado: { gravadas: 0, validas: 1, erros: [{ linha: 2, erro: "O acumulado passa do previsto", excesso: true }] },
    });
  });
});

describe("gravarColagem", () => {
  it("p_gravar true e sem erro: grava e devolve gravadas > 0", async () => {
    estado.resposta = { data: { gravadas: 2, validas: 2, erros: [] }, error: null };
    await expect(gravarColagem(CONTRATO, [linha(), linha({ linha: 2 })])).resolves.toEqual({
      ok: true,
      resultado: { gravadas: 2, validas: 2, erros: [] },
    });
    expect(estado.chamadas[0].args.p_gravar).toBe(true);
  });

  it('"Nada foi gravado" (P0001 com detail): vira o MESMO formato de resultado, sem virar toast solto', async () => {
    const erros = [{ linha: 2, erro: "Código repetido na planilha: lance esta linha pelo formulário", excesso: false }];
    estado.resposta = {
      data: null,
      error: { code: "P0001", message: "Nada foi gravado: 1 linha(s) com erro", details: JSON.stringify(erros) },
    };
    const resultado = await gravarColagem(CONTRATO, [linha(), linha({ linha: 2 })]);
    expect(resultado).toEqual({ ok: true, resultado: { gravadas: 0, validas: 1, erros } });
  });

  it("erro sem detail estruturado (ex.: mais de 500 linhas) vira {erro} comum", async () => {
    estado.resposta = { data: null, error: { code: "P0001", message: "Cole no máximo 500 linhas por vez" } };
    await expect(gravarColagem(CONTRATO, [linha()])).resolves.toEqual({ erro: "Cole no máximo 500 linhas por vez" });
  });

  it("erro de infraestrutura vira mensagem genérica", async () => {
    estado.resposta = { data: null, error: { code: "42501", message: "permission denied" } };
    await expect(gravarColagem(CONTRATO, [linha()])).resolves.toEqual({
      erro: "Não foi possível conferir a colagem. Tente novamente",
    });
  });
});
