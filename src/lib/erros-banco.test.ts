import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ERRO_SALARIO_NEGATIVO,
  mensagemDeNegocio,
  traduzErroSalario,
} from "@/lib/erros-banco";

/**
 * Mensagens MEDIDAS no banco vivo (Task 5, provas em `begin; ... rollback;`),
 * não inventadas aqui: é o texto que o trigger e o check devolvem de verdade.
 * Se o SQL mudar a frase, estes testes têm que quebrar.
 */
const MSG_TRAVA_PROVISOES =
  "A soma dos percentuais das provisões ativas não pode passar de 100%. As outras provisões ativas somam 80%, e esta acrescentaria 30%.";
const MSG_TRAVA_ENCARGOS =
  "A soma dos percentuais dos encargos ativos não pode passar de 100%. Os outros encargos ativos somam 80%, e este acrescentaria 30%.";
const MSG_CHECK_SALARIO =
  'new row for relation "colaboradores" violates check constraint "colaboradores_salario_nao_negativo"';
const MSG_CHECK_OUTRO =
  'new row for relation "colaboradores" violates check constraint "colaboradores_cnh_categoria_check"';

describe("mensagemDeNegocio", () => {
  it("entrega ao usuário a mensagem da trava de soma (P0001)", () => {
    expect(
      mensagemDeNegocio(
        { code: "P0001", message: MSG_TRAVA_PROVISOES },
        "Não foi possível salvar a provisão. Tente novamente",
      ),
    ).toBe(MSG_TRAVA_PROVISOES);

    expect(
      mensagemDeNegocio(
        { code: "P0001", message: MSG_TRAVA_ENCARGOS },
        "Não foi possível salvar o encargo. Tente novamente",
      ),
    ).toBe(MSG_TRAVA_ENCARGOS);
  });

  it("não vaza erro de infraestrutura: permission denied fica no fallback", () => {
    expect(
      mensagemDeNegocio(
        { code: "42501", message: "permission denied for table folha_provisoes" },
        "Não foi possível salvar a provisão. Tente novamente",
      ),
    ).toBe("Não foi possível salvar a provisão. Tente novamente");
  });

  it("cai no fallback com P0001 sem mensagem, com outro código, e com erro ausente", () => {
    expect(mensagemDeNegocio({ code: "P0001" }, "fallback")).toBe("fallback");
    expect(
      mensagemDeNegocio({ code: "23505", message: "duplicate key" }, "fallback"),
    ).toBe("fallback");
    expect(mensagemDeNegocio(null, "fallback")).toBe("fallback");
    expect(mensagemDeNegocio(undefined, "fallback")).toBe("fallback");
  });
});

describe("traduzErroSalario", () => {
  it("traduz o 23514 do check do salário", () => {
    expect(traduzErroSalario({ code: "23514", message: MSG_CHECK_SALARIO })).toBe(
      ERRO_SALARIO_NEGATIVO,
    );
  });

  it("traduz também quando o código só aparece dentro da mensagem", () => {
    expect(
      traduzErroSalario({ message: `23514: ${MSG_CHECK_SALARIO}` }),
    ).toBe(ERRO_SALARIO_NEGATIVO);
  });

  it("não rouba a mensagem de outro check da mesma tabela", () => {
    expect(traduzErroSalario({ code: "23514", message: MSG_CHECK_OUTRO })).toBeNull();
  });

  it("devolve null para outros erros", () => {
    expect(traduzErroSalario({ code: "23505", message: "duplicate key" })).toBeNull();
    expect(traduzErroSalario({ code: "23514" })).toBeNull();
    expect(traduzErroSalario(null)).toBeNull();
    expect(traduzErroSalario(undefined)).toBeNull();
  });
});

/* ------------------------------------------------------------------------- */
/* A tradução só serve se CHEGAR na tela: as três actions, com o banco falso  */
/* ------------------------------------------------------------------------- */

/**
 * O defeito que a revisão da Task 1 achou não foi um tradutor errado, foi um
 * tradutor que não estava ligado no caminho do erro. Estes testes são a prova
 * de ligação: mandam o erro exato do banco pela action e conferem a mensagem
 * que volta para o toast. Ficam neste arquivo, com um só conjunto de mocks,
 * porque é uma regra só atravessando três módulos.
 */
const estado = vi.hoisted(() => ({
  erro: null as { code?: string; message?: string } | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissoes", () => ({
  exigirPermissao: vi.fn(async () => ({
    id: "00000000-0000-0000-0000-000000000001",
  })),
  getUsuarioLogado: vi.fn(async () => ({
    id: "00000000-0000-0000-0000-000000000001",
  })),
  temPermissao: vi.fn(() => true),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      insert: () => Promise.resolve({ error: estado.erro }),
      update: () => ({
        eq: () => Promise.resolve({ error: estado.erro }),
      }),
    }),
  }),
}));

import {
  criar as criarColaborador,
  editar as editarColaborador,
} from "@/modules/cadastros/colaboradores/actions";
import type { ColaboradorInput } from "@/modules/cadastros/colaboradores/schemas";
import { salvarEncargo } from "@/modules/rh/encargos/actions";
import { salvarProvisao } from "@/modules/rh/provisoes/actions";

const ID = "11111111-2222-4333-8444-555555555555";

const colaborador: ColaboradorInput = {
  nome: "Colaborador de teste",
  cpf: null,
  funcaoId: null,
  jornadaId: null,
  vinculo: "clt",
  obraId: null,
  centroCustoId: null,
  dataAdmissao: null,
  telefone: null,
  ativo: true,
  salario: 3000,
  valorDiaria: null,
  banco: null,
  agencia: null,
  conta: null,
  tipoConta: null,
  chavePix: null,
};

describe("a mensagem da trava chega pela action, em vez de 'Tente novamente'", () => {
  beforeEach(() => {
    estado.erro = null;
    // erroAcao loga o erro real com console.error; aqui só atrapalharia a saída.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("salvarProvisao devolve a mensagem do teto no insert e no update", async () => {
    estado.erro = { code: "P0001", message: MSG_TRAVA_PROVISOES };

    await expect(
      salvarProvisao({ nome: "Provisão de férias", percentual: 11.111, ativo: true }),
    ).resolves.toEqual({ erro: MSG_TRAVA_PROVISOES });

    await expect(
      salvarProvisao(
        { nome: "Provisão de férias", percentual: 11.111, ativo: true },
        ID,
      ),
    ).resolves.toEqual({ erro: MSG_TRAVA_PROVISOES });
  });

  it("salvarEncargo devolve a mensagem do teto no insert e no update", async () => {
    estado.erro = { code: "P0001", message: MSG_TRAVA_ENCARGOS };

    await expect(
      salvarEncargo({ nome: "INSS patronal", percentual: 20, ativo: true }),
    ).resolves.toEqual({ erro: MSG_TRAVA_ENCARGOS });

    await expect(
      salvarEncargo({ nome: "INSS patronal", percentual: 20, ativo: true }, ID),
    ).resolves.toEqual({ erro: MSG_TRAVA_ENCARGOS });
  });

  it("criar e editar colaborador devolvem a mensagem do salário negativo", async () => {
    estado.erro = { code: "23514", message: MSG_CHECK_SALARIO };

    await expect(criarColaborador(colaborador)).resolves.toEqual({
      erro: ERRO_SALARIO_NEGATIVO,
    });
    await expect(editarColaborador(ID, colaborador)).resolves.toEqual({
      erro: ERRO_SALARIO_NEGATIVO,
    });
  });

  it("erro de infraestrutura continua genérico nas três", async () => {
    estado.erro = {
      code: "42501",
      message: "permission denied for table folha_provisoes",
    };

    await expect(
      salvarProvisao({ nome: "Provisão de férias", percentual: 11.111, ativo: true }),
    ).resolves.toEqual({
      erro: "Não foi possível salvar a provisão. Tente novamente",
    });
    await expect(
      salvarEncargo({ nome: "INSS patronal", percentual: 20, ativo: true }),
    ).resolves.toEqual({
      erro: "Não foi possível salvar o encargo. Tente novamente",
    });
    await expect(criarColaborador(colaborador)).resolves.toEqual({
      erro: "Não foi possível salvar o colaborador. Tente novamente",
    });
  });
});
