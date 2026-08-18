import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `trilhaDeParcelas` é o único ponto do espelho de pagamento que toca o banco
 * para saber QUEM fez cada evento (aprovou, desaprovou, reprogramou...). Este
 * é o espelho cujo trabalho é provar que um pagamento aconteceu, então "quem"
 * não é um detalhe cosmético: é a primeira pergunta de uma revisão contábil ou
 * jurídica. Este teste trava que o autor é resolvido pela mesma RPC
 * (`nomes_usuarios_auditoria`) e com o mesmo fallback ("Sistema") que
 * trilhaLancamento e trilhaOrdem já usam — nunca "undefined", nunca célula
 * vazia com cara de bug de tela.
 */

const { rpc, from } = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc, from }),
}));

const { trilhaDeParcelas } = await import(
  "@/modules/financeiro/pagamentos/espelho"
);

const PARCELA = "9f1b7c2e-6d3a-4f58-9b0e-1c2d3e4f5a6b";
const USUARIO_A = "11111111-1111-4111-8111-111111111111";
const USUARIO_B = "22222222-2222-4222-8222-222222222222";

/** Uma linha crua de parcela_eventos, como o PostgREST devolve. */
function evento(overrides: {
  id: string;
  tipo: string;
  created_by: string | null;
  motivo?: string | null;
}) {
  return {
    id: overrides.id,
    parcela_id: PARCELA,
    tipo: overrides.tipo,
    motivo: overrides.motivo ?? null,
    data_de: null,
    data_para: null,
    created_at: "2026-06-20T14:00:00Z",
    created_by: overrides.created_by,
  };
}

function mockarEventos(linhas: ReturnType<typeof evento>[]) {
  from.mockImplementation((tabela: string) => {
    if (tabela !== "parcela_eventos") {
      throw new Error(`consultou ${tabela} em vez de parcela_eventos`);
    }
    return {
      select: () => ({
        in: () => ({
          order: () => ({ data: linhas, error: null }),
        }),
      }),
    };
  });
}

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
});

describe("trilhaDeParcelas", () => {
  it("evento com autor resolvível mostra o nome, não o uuid nem 'undefined'", async () => {
    mockarEventos([
      evento({ id: "e1", tipo: "aprovou", created_by: USUARIO_A }),
    ]);
    rpc.mockResolvedValue({
      data: [{ id: USUARIO_A, nome: "Fulano de Tal" }],
      error: null,
    });

    const trilhas = await trilhaDeParcelas([PARCELA]);

    expect(rpc).toHaveBeenCalledWith("nomes_usuarios_auditoria", {
      p_ids: [USUARIO_A],
    });
    expect(trilhas[PARCELA]).toHaveLength(1);
    expect(trilhas[PARCELA][0].usuario).toBe("Fulano de Tal");
  });

  it("created_by nulo degrada para 'Sistema', igual aos espelhos irmãos", async () => {
    // Acontece com evento gravado por função definer sem auth.uid() (rotina
    // automática, não uma pessoa apertando um botão).
    mockarEventos([
      evento({ id: "e1", tipo: "reprogramou", created_by: null }),
    ]);

    const trilhas = await trilhaDeParcelas([PARCELA]);

    // Sem id nenhum para resolver, a RPC nem precisa ser chamada.
    expect(rpc).not.toHaveBeenCalled();
    expect(trilhas[PARCELA][0].usuario).toBe("Sistema");
  });

  it("id que a RPC não resolveu também degrada para 'Sistema', não para undefined", async () => {
    mockarEventos([
      evento({ id: "e1", tipo: "desaprovou", created_by: USUARIO_B }),
    ]);
    // A RPC roda mas não devolve nada para este id (usuário removido, etc.).
    rpc.mockResolvedValue({ data: [], error: null });

    const trilhas = await trilhaDeParcelas([PARCELA]);

    expect(trilhas[PARCELA][0].usuario).toBe("Sistema");
  });
});
