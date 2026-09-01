import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O tamanho das consultas de anexo.
 *
 * Este arquivo existe por causa de um defeito que ficou vivo até 01/09/2026 e que
 * NENHUM teste comum pegaria: `listarAnexosPorDocumento` mandava a lista INTEIRA
 * de ids num `in.(...)`. A fila a pagar tem ~900 parcelas, cada uuid custa 37
 * caracteres na URL, e o PostgREST devolveu **400 em 147 requisições só no dia
 * 01/09** (URL de 35.708 caracteres, medido no `edge_logs`). O erro era engolido
 * (`if (error || !data) return {}`), então o clipe de anexo simplesmente não
 * aparecia na fila e ninguém tinha o que reportar.
 *
 * Um teste com dois ids passa com o código quebrado. Por isso o que se afirma
 * aqui é o TAMANHO de cada requisição, com uma lista grande de verdade.
 */

const LOTE = 200; // LOTE_IDS_POSTGREST
const PAGINA_POSTGREST = 1000;

/** Registro do que cada requisição pediu. */
interface Pedido {
  tabela: string;
  coluna: string;
  ids: string[];
  /** As colunas pedidas no `order`, na ordem em que foram pedidas. */
  ordem: string[];
  de: number;
  ate: number;
}

let pedidos: Pedido[] = [];
/** Quantas linhas cada requisição devolve, por índice de pedido. */
let respostas: (indice: number, pedido: Pedido) => unknown[];
let erroDoBanco: { message: string } | null = null;

/**
 * Dublê do builder do PostgREST: acumula os filtros e só resolve no `range`,
 * que é o último elo da corrente em `todasAsLinhas`.
 */
function builderFalso(tabela: string) {
  const pedido: Pedido = {
    tabela,
    coluna: "",
    ids: [],
    ordem: [],
    de: 0,
    ate: 0,
  };

  const encadeia = {
    select: () => encadeia,
    eq: () => encadeia,
    order: (coluna: string) => {
      pedido.ordem.push(coluna);
      return encadeia;
    },
    in: (coluna: string, ids: readonly string[]) => {
      pedido.coluna = coluna;
      pedido.ids = [...ids];
      return encadeia;
    },
    range: (de: number, ate: number) => {
      pedido.de = de;
      pedido.ate = ate;
      pedidos.push(pedido);
      const indice = pedidos.length - 1;
      return Promise.resolve({
        data: erroDoBanco ? null : respostas(indice, pedido),
        error: erroDoBanco,
      });
    },
  };
  return encadeia;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (tabela: string) => builderFalso(tabela),
  }),
}));

const { listarAnexosPorDocumento } =
  await import("@/modules/_shared/anexos/queries");

function ids(quantos: number): string[] {
  return Array.from(
    { length: quantos },
    (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  );
}

function vinculo(entidadeId: string, sufixo: string) {
  return {
    id: `v-${entidadeId}-${sufixo}`,
    entidade_id: entidadeId,
    arquivo_id: `a-${sufixo}`,
    origem: "direto",
    vinculo_origem_id: null,
    nome_exibicao: null,
    created_at: "2026-08-01T00:00:00Z",
    created_by: null,
    arquivos: {
      nome_original: `nota-${sufixo}.pdf`,
      tipo_mime: "application/pdf",
      tamanho_bytes: 10,
    },
  };
}

describe("listarAnexosPorDocumento", () => {
  beforeEach(() => {
    pedidos = [];
    erroDoBanco = null;
    respostas = () => [];
  });

  it("NENHUMA requisição passa de 200 ids, com a fila de 900 parcelas", async () => {
    /*
     * O teste que faltava. 900 uuids num `in` só dão 33 KB de URL e o gateway
     * responde 400 antes de o Postgres ver a consulta -- e antes da RLS, então
     * nem se confunde com falta de permissão.
     */
    await listarAnexosPorDocumento("pagamento", ids(900));

    expect(pedidos.length).toBeGreaterThan(1);
    for (const pedido of pedidos) {
      expect(
        pedido.ids.length,
        `uma requisição levou ${pedido.ids.length} ids`,
      ).toBeLessThanOrEqual(LOTE);
    }
  });

  it("os 900 ids são pedidos, cada um UMA vez", async () => {
    // LINHA DE CONTROLE do teste de cima: lotear sem cobrir tudo devolveria
    // requisições pequenas e anexo faltando, que é o mesmo sintoma de antes.
    await listarAnexosPorDocumento("pagamento", ids(900));

    const pedidos_ids = pedidos.flatMap((p) => p.ids);
    expect(pedidos_ids).toHaveLength(900);
    expect(new Set(pedidos_ids).size).toBe(900);
    expect([...new Set(pedidos_ids)].sort()).toEqual(ids(900).sort());
  });

  it("id repetido em lotes DIFERENTES não duplica o anexo na tela", async () => {
    /*
     * O repetido tem que atravessar o corte do lote, senão o teste não prova
     * nada: com tres ids iguais cai tudo num `in` só e o resultado sai certo
     * mesmo sem deduplicar. Aqui o mesmo documento aparece na posição 0 e na
     * 210 -- em lotes diferentes, se ninguém deduplicar antes.
     */
    const lista = ids(250);
    const repetido = lista[0];
    lista[210] = repetido;

    respostas = (_i, pedido) =>
      pedido.ids.includes(repetido) ? [vinculo(repetido, "1")] : [];

    const mapa = await listarAnexosPorDocumento("pagamento", lista);

    // Sem dedup: dois lotes trazem o mesmo vínculo e a tela mostra dois clipes.
    expect(mapa[repetido]).toHaveLength(1);
    // E o id só é pedido uma vez, em um lote só.
    expect(pedidos.filter((p) => p.ids.includes(repetido))).toHaveLength(1);
  });

  it("passa do teto de mil linhas do PostgREST sem perder anexo", async () => {
    /*
     * Volta uma linha por VÍNCULO, não por documento: 200 documentos com muitos
     * arquivos cada passam de mil, e o corte do PostgREST é SILENCIOSO. Sem
     * paginar, os anexos além da milésima linha somem sem erro nenhum.
     */
    const documento = ids(1)[0];
    // Primeira faixa cheia (mil), segunda com uma só: 1001 vínculos no total.
    respostas = (_i, pedido) => {
      if (pedido.de === 0) {
        return Array.from({ length: PAGINA_POSTGREST }, (_, i) =>
          vinculo(documento, String(i)),
        );
      }
      if (pedido.de === PAGINA_POSTGREST) {
        return [vinculo(documento, "extra")];
      }
      return [];
    };

    const mapa = await listarAnexosPorDocumento("pagamento", [documento]);

    expect(mapa[documento]).toHaveLength(PAGINA_POSTGREST + 1);
  });

  it("a ordem termina em `id`, senão a paginação repete e perde linha", async () => {
    /*
     * `created_at` EMPATA: a carga do Mais Controle gravou milhares de vínculos
     * na mesma transação. Ordenando só por ele, a faixa seguinte pode devolver
     * as linhas empatadas em outra sequência -- e aí um anexo aparece duas vezes
     * e outro desaparece, sem erro nenhum. O desempate tem que ser único.
     */
    await listarAnexosPorDocumento("pagamento", ids(1));

    expect(pedidos).toHaveLength(1);
    expect(pedidos[0].ordem.at(-1)).toBe("id");
    // E dentro de um documento a ordem continua sendo a de criação, que é a que
    // a tela mostra.
    expect(pedidos[0].ordem).toContain("created_at");
    // A faixa é a página do PostgREST: sem `range`, `todasAsLinhas` não pagina.
    expect(pedidos[0].ate - pedidos[0].de + 1).toBe(PAGINA_POSTGREST);
  });

  it("erro do banco NÃO vira silêncio: devolve vazio e registra", async () => {
    // Era `if (error || !data) return {}` sem log. O clipe sumia da fila inteira
    // e não havia o que reportar -- foram 147 requisições com 400 num único dia
    // antes de alguém notar.
    const console_erro = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    erroDoBanco = { message: "URI too long" };

    const mapa = await listarAnexosPorDocumento("pagamento", ids(10));

    expect(mapa).toEqual({});
    expect(console_erro).toHaveBeenCalled();
    console_erro.mockRestore();
  });

  it("lista vazia não vai ao banco", async () => {
    await listarAnexosPorDocumento("pagamento", []);
    expect(pedidos).toEqual([]);
  });
});
