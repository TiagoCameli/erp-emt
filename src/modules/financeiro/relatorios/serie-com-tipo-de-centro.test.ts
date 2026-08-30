import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O gráfico e os cartões da mesma tela têm que somar o MESMO conjunto.
 *
 * Até 28/08/2026 não somavam: `fn_rel_custo_centro_serie` não tinha o parâmetro
 * `p_tipos_centro`, então os cartões filtravam por tipo de centro e a linha
 * desenhada ao lado deles não. Medido com as 17 raízes escolhidas e o tipo
 * "obra" marcado: cartão R$ 45.625.418,30 contra série R$ 48.013.704,59 — a
 * diferença era a Manutenção inteira, desenhada num gráfico que o número em cima
 * dele não contava. O corte foi para o banco (migration 20260828234000) e a
 * segunda metade da correção é esta: o filtro precisa CHEGAR lá.
 *
 * Este é exatamente o defeito que `centroIds` já teve nesta mesma função — o
 * parâmetro existia e era jogado fora antes da chamada, então a escolha mudava a
 * URL e não mudava número nenhum. Nada na tela acusa: o gráfico continua bonito,
 * só que somando outra coisa. Por isso a trava é por teste.
 *
 * A prova mora aqui, na fronteira TypeScript -> RPC. A prova do lado do banco (a
 * soma da série igual à soma dos cartões) está em SQL, dentro da migration.
 */

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc }),
}));

const { custoPorCentroCusto, serieDosCentros } = await import(
  "@/modules/financeiro/relatorios/queries"
);

/** Uma chamada de `supabase.rpc`, como o mock a registra. */
type ChamadaRpc = [nome: string, argumentos?: Record<string, unknown>];

const CENTROS = [
  "11111111-1111-1111-1111-111111111111",
  "22222222-2222-2222-2222-222222222222",
];

/** O que a página monta e entrega às duas leituras (ver `filtrosDaRpc`). */
function filtros(tiposCentro?: string[]) {
  return {
    inicio: "2026-01-01",
    fim: "2026-09-01",
    centroIds: CENTROS,
    categoriaIds: ["33333333-3333-3333-3333-333333333333"],
    fornecedorIds: ["44444444-4444-4444-4444-444444444444"],
    formaIds: ["55555555-5555-5555-5555-555555555555"],
    semForma: true,
    status: ["aprovado"],
    excluirPrevisto: true,
    tiposCentro,
  };
}

function argumentosDe(nome: string): Record<string, unknown> {
  const chamadas = rpc.mock.calls as unknown as ChamadaRpc[];
  const chamada = chamadas.find(([alvo]) => alvo === nome);
  if (!chamada) throw new Error(`a RPC ${nome} não foi chamada`);
  return chamada[1] ?? {};
}

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: [], error: null });
});

describe("serieDosCentros manda o tipo de centro para o banco", () => {
  it("o parâmetro chega na chamada", async () => {
    await serieDosCentros(CENTROS, filtros(["obra"]));

    expect(argumentosDe("fn_rel_custo_centro_serie").p_tipos_centro).toEqual([
      "obra",
    ]);
  });

  it("o gráfico recebe o MESMO recorte que os cartões", async () => {
    const escolha = filtros(["obra", "escritorio"]);

    await custoPorCentroCusto(escolha);
    await serieDosCentros(CENTROS, escolha);

    const cartoes = argumentosDe("fn_rel_custo_centro_custo");
    const grafico = argumentosDe("fn_rel_custo_centro_serie");

    // O tipo de centro é o que faltava, mas a trava vale para todos os filtros
    // que as duas leituras dividem: basta um deles ir de um lado só para as duas
    // metades da tela discordarem em silêncio.
    for (const parametro of [
      "p_tipos_centro",
      "p_categorias",
      "p_fornecedores",
      "p_formas",
      "p_sem_forma",
      "p_status",
      "p_excluir_previsto",
      "p_inicio",
      "p_fim",
    ]) {
      expect(grafico[parametro]).toEqual(cartoes[parametro]);
    }
  });

  it("trocar o tipo troca o que vai para o banco", async () => {
    // Linha de controle: sem isto, um `p_tipos_centro` fixo em `undefined`
    // passaria nos dois testes acima e o gráfico voltaria a mentir.
    await serieDosCentros(CENTROS, filtros(["manutencao"]));
    const manutencao = argumentosDe("fn_rel_custo_centro_serie").p_tipos_centro;

    rpc.mockClear();
    await serieDosCentros(CENTROS, filtros());
    const semFiltro = argumentosDe("fn_rel_custo_centro_serie").p_tipos_centro;

    expect(manutencao).toEqual(["manutencao"]);
    expect(semFiltro).toBeUndefined();
    expect(manutencao).not.toEqual(semFiltro);
  });

  it("os centros escolhidos continuam viajando junto", async () => {
    // O mesmo parâmetro que já foi jogado fora uma vez nesta função.
    await serieDosCentros(CENTROS, filtros(["obra"]));

    expect(argumentosDe("fn_rel_custo_centro_serie").p_centros).toEqual(CENTROS);
  });
});
