import { describe, expect, it, vi } from "vitest";

import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";

/** Fonte falsa com `n` linhas, respeitando o teto de 1.000 por requisição. */
function fonte(n: number) {
  const todas = Array.from({ length: n }, (_, i) => ({ id: i }));
  return vi.fn(async (de: number, ate: number) => ({
    data: todas.slice(de, Math.min(ate + 1, de + 1000)),
    error: null,
  }));
}

describe("todasAsLinhas", () => {
  it("uma requisição quando cabe na primeira página", async () => {
    const buscar = fonte(658);
    const { linhas, erro } = await todasAsLinhas(buscar);

    expect(erro).toBeNull();
    expect(linhas).toHaveLength(658);
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(buscar).toHaveBeenCalledWith(0, 999);
  });

  it("pagina até o fim quando passa de mil", async () => {
    // O caso real: 3.349 insumos ativos. Antes, chegavam 1.000 e os outros
    // 2.349 ficavam inalcançáveis na tela, nem digitando.
    const buscar = fonte(3349);
    const { linhas, erro } = await todasAsLinhas(buscar);

    expect(erro).toBeNull();
    expect(linhas).toHaveLength(3349);
    expect(buscar).toHaveBeenCalledTimes(4);
  });

  it("para no total exato sem pedir uma página vazia a mais", async () => {
    const buscar = fonte(2000);
    const { linhas } = await todasAsLinhas(buscar);

    expect(linhas).toHaveLength(2000);
    // 1.000 + 1.000 + a página que volta vazia e encerra.
    expect(buscar).toHaveBeenCalledTimes(3);
  });

  it("lista vazia não vira erro", async () => {
    const { linhas, erro } = await todasAsLinhas(fonte(0));
    expect(linhas).toEqual([]);
    expect(erro).toBeNull();
  });

  it("erro no meio devolve o que veio e o motivo, sem engolir", async () => {
    const buscar = vi
      .fn()
      .mockResolvedValueOnce({
        data: Array.from({ length: 1000 }, (_, i) => ({ id: i })),
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: { message: "caiu" } });

    const { linhas, erro } = await todasAsLinhas(buscar);

    expect(linhas).toHaveLength(1000);
    expect(erro).toBe("caiu");
  });

  it("não roda para sempre se a fonte sempre devolver página cheia", async () => {
    const buscar = vi.fn(async () => ({
      data: Array.from({ length: 1000 }, (_, i) => ({ id: i })),
      error: null,
    }));

    const { linhas } = await todasAsLinhas(buscar);

    // Trava de segurança: 100 páginas e para.
    expect(buscar).toHaveBeenCalledTimes(100);
    expect(linhas).toHaveLength(100_000);
  });
});
