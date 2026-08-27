import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Prova da criação rápida de fornecedor: o que ela faz ANTES de inserir.
 *
 * O valor destes testes está quase todo nas linhas de controle — as que exigem
 * que `insercoes` fique VAZIA. Um dedup que não deduplica passa despercebido na
 * tela (o fornecedor aparece selecionado do mesmo jeito) e só se descobre meses
 * depois, com o cadastro cheio de "Colorado" repetido.
 */

interface LinhaFornecedor {
  id: string;
  ativo: boolean;
}
interface RespostaBusca {
  data: LinhaFornecedor[] | null;
  error: { code?: string; message?: string } | null;
}
interface RespostaInsert {
  data: { id: string } | null;
  error: { code?: string; message?: string } | null;
}

const estado = vi.hoisted(() => ({
  buscas: [] as { coluna: string; padrao: string }[],
  porColuna: {} as Record<
    string,
    { data: { id: string; ativo: boolean }[] | null; error: unknown }
  >,
  insercoes: [] as Record<string, unknown>[],
  insert: { data: null, error: null } as {
    data: { id: string } | null;
    error: { code?: string; message?: string } | null;
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        ilike: (coluna: string, padrao: string) => {
          estado.buscas.push({ coluna, padrao });
          return {
            limit: async (): Promise<RespostaBusca> =>
              (estado.porColuna[coluna] as RespostaBusca) ?? {
                data: [],
                error: null,
              },
          };
        },
      }),
      insert: (linha: Record<string, unknown>) => {
        estado.insercoes.push(linha);
        return {
          select: () => ({
            single: async (): Promise<RespostaInsert> => estado.insert,
          }),
        };
      },
    }),
  }),
}));

import { criarFornecedorRapido } from "@/modules/_shared/fornecedor/actions";

const ID_NOVO = "11111111-2222-4333-8444-555555555555";
const ID_EXISTENTE = "99999999-8888-4777-8666-555555555555";

/** Nada encontrado nas duas colunas: o caminho de quem é mesmo novo. */
function nadaEncontrado(): void {
  estado.porColuna = {
    razao_social: { data: [], error: null },
    nome_fantasia: { data: [], error: null },
  };
}

describe("criarFornecedorRapido", () => {
  beforeEach(() => {
    estado.buscas = [];
    estado.porColuna = {};
    estado.insercoes = [];
    estado.insert = { data: { id: ID_NOVO }, error: null };
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("recusa nome vazio ou curto demais sem tocar no banco", async () => {
    await expect(criarFornecedorRapido("  ")).resolves.toEqual({
      erro: "Informe um nome válido",
    });
    await expect(criarFornecedorRapido("A")).resolves.toEqual({
      erro: "Informe um nome válido",
    });
    expect(estado.buscas).toHaveLength(0);
    expect(estado.insercoes).toHaveLength(0);
  });

  it("cria o fornecedor mínimo quando o nome é mesmo novo", async () => {
    nadaEncontrado();

    await expect(
      criarFornecedorRapido("  Colorado Asfaltos  "),
    ).resolves.toEqual({ id: ID_NOVO });
    // Nasce só com o que o lançamento precisa. CNPJ e endereço vêm depois.
    expect(estado.insercoes).toEqual([
      { razao_social: "Colorado Asfaltos", tipo: "pj", ativo: true },
    ]);
  });

  it("não duplica: nome igual ao de um ativo devolve o que já existe", async () => {
    estado.porColuna = {
      razao_social: {
        data: [{ id: ID_EXISTENTE, ativo: true }],
        error: null,
      },
    };

    await expect(criarFornecedorRapido("Colorado Asfaltos")).resolves.toEqual({
      id: ID_EXISTENTE,
    });
    expect(estado.insercoes).toHaveLength(0);
    // Achou na primeira coluna: nem procura no nome fantasia.
    expect(estado.buscas.map((b) => b.coluna)).toEqual(["razao_social"]);
  });

  it("acha pelo nome fantasia, que é o rótulo que o seletor exibe", async () => {
    estado.porColuna = {
      razao_social: { data: [], error: null },
      nome_fantasia: { data: [{ id: ID_EXISTENTE, ativo: true }], error: null },
    };

    await expect(criarFornecedorRapido("Posto Colorado")).resolves.toEqual({
      id: ID_EXISTENTE,
    });
    expect(estado.insercoes).toHaveLength(0);
    expect(estado.buscas.map((b) => b.coluna)).toEqual([
      "razao_social",
      "nome_fantasia",
    ]);
  });

  it("manda reativar o inativo em vez de criar um segundo cadastro", async () => {
    estado.porColuna = {
      razao_social: { data: [{ id: ID_EXISTENTE, ativo: false }], error: null },
    };

    await expect(criarFornecedorRapido("Colorado Asfaltos")).resolves.toEqual({
      erro: '"Colorado Asfaltos" já existe como fornecedor inativo. Reative em Cadastros > Fornecedores.',
    });
    // Nem cria outro nem devolve o id: o seletor só lista ativo, e devolver o id
    // deixaria o UUID na tela no lugar do nome.
    expect(estado.insercoes).toHaveLength(0);
  });

  it("busca que falhou para a ação, em vez de virar duplicado", async () => {
    estado.porColuna = {
      razao_social: { data: null, error: { message: "connection reset" } },
    };

    await expect(criarFornecedorRapido("Colorado Asfaltos")).resolves.toEqual({
      erro: "Não foi possível conferir se o fornecedor já existe",
    });
    // A linha de controle desta suíte: tratar falha de banco como "não existe"
    // criaria cadastro duplicado justamente na hora errada.
    expect(estado.insercoes).toHaveLength(0);
  });

  it("escapa os curingas do ilike, senão o nome com % casa com qualquer um", async () => {
    nadaEncontrado();

    await criarFornecedorRapido("Posto 100% Diesel_BR");

    expect(estado.buscas[0]?.padrao).toBe("Posto 100\\% Diesel\\_BR");
  });

  it("recusa por permissão vira frase que diz o que fazer", async () => {
    nadaEncontrado();
    estado.insert = {
      data: null,
      error: {
        code: "42501",
        message:
          'new row violates row-level security policy for table "fornecedores"',
      },
    };

    await expect(criarFornecedorRapido("Colorado Asfaltos")).resolves.toEqual({
      erro: "Você não tem permissão para cadastrar fornecedor. Escolha um da lista ou peça a quem cuida de Cadastros.",
    });
  });

  it("qualquer outro erro fica genérico: o texto do Postgres não vaza", async () => {
    nadaEncontrado();
    estado.insert = {
      data: null,
      error: { code: "08006", message: "connection failure to db-prod-1" },
    };

    await expect(criarFornecedorRapido("Colorado Asfaltos")).resolves.toEqual({
      erro: "Não foi possível criar o fornecedor",
    });
  });
});
