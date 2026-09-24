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
    expect(linhas.map((l) => l.id)).toEqual(
      Array.from({ length: 3349 }, (_, i) => i),
    );
    // A primeira sozinha, depois uma onda de 5 em paralelo (2 páginas vazias
    // de sobra): 2 esperas em vez de 4.
    expect(buscar).toHaveBeenCalledTimes(6);
  });

  it("no total exato, a página vazia da onda encerra", async () => {
    const buscar = fonte(2000);
    const { linhas } = await todasAsLinhas(buscar);

    expect(linhas).toHaveLength(2000);
    // 1.000 sozinha + onda de 5 (1.000 e quatro vazias).
    expect(buscar).toHaveBeenCalledTimes(6);
  });

  it("exatamente mil: a onda seguinte volta vazia e não duplica nada", async () => {
    const buscar = fonte(1000);
    const { linhas } = await todasAsLinhas(buscar);

    expect(linhas).toHaveLength(1000);
    expect(new Set(linhas.map((l) => l.id)).size).toBe(1000);
  });

  it("a ordem é a das páginas, não a de chegada das respostas", async () => {
    // A página 1 é a mais lenta da onda; se a ordem seguisse a chegada, as
    // linhas 1000..1999 iriam para o fim.
    const todas = Array.from({ length: 3500 }, (_, i) => ({ id: i }));
    const buscar = vi.fn(async (de: number, ate: number) => {
      const atraso = de === 1000 ? 30 : 0;
      await new Promise((r) => setTimeout(r, atraso));
      return { data: todas.slice(de, ate + 1), error: null };
    });

    const { linhas } = await todasAsLinhas(buscar);

    expect(linhas.map((l) => l.id)).toEqual(todas.map((l) => l.id));
  });

  it("depois da primeira página cheia, as seguintes saem em paralelo", async () => {
    let emVoo = 0;
    let maxEmVoo = 0;
    const todas = Array.from({ length: 4200 }, (_, i) => ({ id: i }));
    const buscar = vi.fn(async (de: number, ate: number) => {
      emVoo += 1;
      maxEmVoo = Math.max(maxEmVoo, emVoo);
      await new Promise((r) => setTimeout(r, 5));
      emVoo -= 1;
      return { data: todas.slice(de, ate + 1), error: null };
    });

    const { linhas } = await todasAsLinhas(buscar);

    expect(linhas).toHaveLength(4200);
    // Em fila, nunca passaria de 1 requisição aberta ao mesmo tempo.
    expect(maxEmVoo).toBe(5);
  });

  it("erro numa página do meio da onda descarta as de depois", async () => {
    const todas = Array.from({ length: 5000 }, (_, i) => ({ id: i }));
    const buscar = vi.fn(async (de: number, ate: number) =>
      de === 2000
        ? { data: null, error: { message: "caiu" } }
        : { data: todas.slice(de, ate + 1), error: null },
    );

    const { linhas, erro } = await todasAsLinhas(buscar);

    expect(erro).toBe("caiu");
    // Páginas 0 e 1 inteiras; a 3 e a 4 chegaram, mas vêm depois do buraco.
    expect(linhas.map((l) => l.id)).toEqual(
      Array.from({ length: 2000 }, (_, i) => i),
    );
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
