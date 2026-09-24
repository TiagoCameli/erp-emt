// @vitest-environment node
import { describe, expect, it } from "vitest";

import { nomesUsuariosFrete } from "@/modules/frete/_shared/usuarios";

function falso(respostas?: (lote: string[]) => { data: { id: string; nome: string }[] | null; error: { message: string } | null }) {
  const chamadas: { fn: string; ids: string[] }[] = [];
  const cliente = {
    rpc: async (fn: string, args: { p_ids: string[] }) => {
      chamadas.push({ fn, ids: args.p_ids });
      return respostas ? respostas(args.p_ids) : { data: args.p_ids.map((id) => ({ id, nome: `Nome ${id}` })), error: null };
    },
  };
  return { cliente: cliente as unknown as Parameters<typeof nomesUsuariosFrete>[0], chamadas };
}

describe("nomesUsuariosFrete", () => {
  it("usa a RPC do Frete, sem repetir id nem mandar nulo", async () => {
    const { cliente, chamadas } = falso();
    const nomes = await nomesUsuariosFrete(cliente, ["a", null, "b", "a", undefined, ""]);
    expect(chamadas).toEqual([{ fn: "nomes_usuarios_frete", ids: ["a", "b"] }]);
    expect(Object.fromEntries(nomes)).toEqual({ a: "Nome a", b: "Nome b" });
  });

  it("sem id, não chama o banco", async () => {
    const { cliente, chamadas } = falso();
    expect((await nomesUsuariosFrete(cliente, [null])).size).toBe(0);
    expect(chamadas).toEqual([]);
  });

  it("parte em lotes de 100", async () => {
    const { cliente, chamadas } = falso();
    const ids = Array.from({ length: 250 }, (_, i) => `u${i}`);
    const nomes = await nomesUsuariosFrete(cliente, ids);
    expect(chamadas.map((c) => c.ids.length)).toEqual([100, 100, 50]);
    expect(nomes.size).toBe(250);
  });

  it("erro no meio devolve o que já veio, sem lançar", async () => {
    let n = 0;
    const { cliente } = falso((lote) => {
      n += 1;
      return n === 1 ? { data: lote.map((id) => ({ id, nome: id })), error: null } : { data: null, error: { message: "x" } };
    });
    const nomes = await nomesUsuariosFrete(cliente, Array.from({ length: 150 }, (_, i) => `u${i}`));
    expect(nomes.size).toBe(100);
  });
});
