import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `listarFornecedores` alimenta o Combobox de fornecedor do formulário de
 * lançamento, do filtro da listagem e do relatório de custo por centro de custo.
 * Ela lia a tabela sem paginar, e o PostgREST corta em 1.000 linhas SEM ERRO.
 *
 * Medido em 15/08/2026: 939 fornecedores, 938 ativos. Faltam 62 cadastros para o
 * corte começar, e quando começar ele é invisível — o fornecedor simplesmente não
 * aparece no seletor, nem digitando o nome, porque a busca da tela roda sobre o
 * que chegou. O desfecho previsível é alguém cadastrar um fornecedor duplicado
 * "porque não estava na lista".
 *
 * É o MESMO defeito que já mordeu duas vezes neste repo: 1.000 dos 3.349 insumos
 * na ordem de compra, e o saldo das contas bancárias somando 1.000 das 1.696
 * parcelas pagas.
 *
 * Este teste trava a correção pelo comportamento: com mais de mil cadastros, a
 * função tem que pedir mais de uma página e devolver todos.
 */

const { from } = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from }),
}));

const { listarFornecedores } = await import(
  "@/modules/financeiro/lancamentos/queries"
);

/** Teto de linhas por requisição do PostgREST. */
const PAGINA = 1000;

/**
 * Uma tabela falsa de `n` fornecedores que respeita o teto do PostgREST: ela
 * NUNCA devolve mais de mil linhas por chamada, exatamente como o servidor real.
 */
function tabelaCom(n: number) {
  const todos = Array.from({ length: n }, (_, i) => ({
    id: `id-${i}`,
    razao_social: `Fornecedor ${String(i).padStart(4, "0")} LTDA`,
    nome_fantasia: null,
  }));

  const faixasPedidas: Array<[number, number]> = [];

  from.mockImplementation((tabela: string) => {
    if (tabela !== "fornecedores") {
      throw new Error(`leu ${tabela} em vez de fornecedores`);
    }
    const construtor = {
      select: () => construtor,
      eq: () => construtor,
      order: () => construtor,
      range: (de: number, ate: number) => {
        faixasPedidas.push([de, ate]);
        return Promise.resolve({
          data: todos.slice(de, Math.min(ate + 1, de + PAGINA)),
          error: null,
        });
      },
      // Sem `.range()` o awaited direto devolveria no máximo uma página. Se a
      // implementação voltar a fazer isso, o teste falha em vez de passar com
      // menos fornecedores.
      then: (resolver: (r: unknown) => void) =>
        resolver({ data: todos.slice(0, PAGINA), error: null }),
    };
    return construtor;
  });

  return faixasPedidas;
}

beforeEach(() => {
  from.mockReset();
});

describe("listarFornecedores", () => {
  it("devolve todos quando cabem numa página", async () => {
    const faixas = tabelaCom(938);
    const fornecedores = await listarFornecedores();

    expect(fornecedores).toHaveLength(938);
    expect(faixas[0]).toEqual([0, 999]);
  });

  it("passa do teto de mil e devolve todos", async () => {
    // O caso que vai acontecer: 62 cadastros a mais que hoje.
    const faixas = tabelaCom(1200);
    const fornecedores = await listarFornecedores();

    expect(fornecedores).toHaveLength(1200);
    expect(faixas.length).toBeGreaterThan(1);
    expect(faixas[1]).toEqual([1000, 1999]);
  });

  it("não perde nem repete fornecedor ao virar a página", async () => {
    tabelaCom(1500);
    const fornecedores = await listarFornecedores();

    const ids = fornecedores.map((fornecedor) => fornecedor.id);
    expect(new Set(ids).size).toBe(1500);
    // A ordem da consulta é por razão social, e o nome de exibição vem dela
    // quando não há fantasia.
    expect(fornecedores[0].nome).toBe("Fornecedor 0000 LTDA");
    expect(fornecedores[1499].nome).toBe("Fornecedor 1499 LTDA");
  });

  it("lista vazia não vira erro", async () => {
    tabelaCom(0);
    await expect(listarFornecedores()).resolves.toEqual([]);
  });
});
