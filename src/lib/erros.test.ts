// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { semLancar } from "@/lib/erros";

/**
 * `semLancar` existe porque **Server Action não pode lançar para o cliente**.
 *
 * Quando lança, o `await` do componente rejeita, o `if ("erro" in resultado)`
 * nunca roda, e a tela não tem como dizer o que aconteceu. Na aprovação da
 * folha de 08/2026 isso apareceu duas vezes: primeiro como silêncio total
 * (nenhum aviso), depois — com a rede do cliente no ar — como um aviso genérico
 * de "recarregue a página", que é verdade e não é diagnóstico.
 *
 * A Vercel do erp-emt é plano hobby e `get_runtime_logs` devolve 403: se a
 * mensagem não sobe na tela, ela não existe em lugar nenhum.
 */
describe("semLancar", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("devolve o resultado quando o corpo passa", async () => {
    const r = await semLancar("teste.ok", async () => ({ ok: true }) as const);
    expect(r).toEqual({ ok: true });
  });

  it("converte throw em { erro } com o texto real e o contexto", async () => {
    const r = await semLancar("rh.folha.aprovar", async () => {
      throw new Error("relation \"folha_guias\" does not exist");
    });

    expect(r).toHaveProperty("erro");
    const { erro } = r as { erro: string };
    // O contexto diz ONDE, o texto diz O QUÊ. Sem os dois não dá para agir.
    expect(erro).toContain("rh.folha.aprovar");
    expect(erro).toContain("does not exist");
  });

  it("carrega o código do erro quando existe", async () => {
    const r = await semLancar("teste.codigo", async () => {
      const e = new Error("permission denied for table lancamentos");
      (e as Error & { code?: string }).code = "42501";
      throw e;
    });

    expect((r as { erro: string }).erro).toContain("[42501]");
  });

  it("não estoura com throw que não é Error", async () => {
    const r = await semLancar("teste.string", async () => {
      throw "quebrou sem Error";
    });
    expect((r as { erro: string }).erro).toContain("quebrou sem Error");
  });

  it("corta mensagem gigante, para caber no toast", async () => {
    const r = await semLancar("teste.longo", async () => {
      throw new Error("x".repeat(5000));
    });
    // 300 do texto + o prefixo do contexto.
    expect((r as { erro: string }).erro.length).toBeLessThan(400);
  });

  it("registra o erro real no log do servidor", async () => {
    const espia = vi.spyOn(console, "error").mockImplementation(() => {});
    await semLancar("teste.log", async () => {
      throw new Error("motivo verdadeiro");
    });
    expect(espia).toHaveBeenCalled();
  });
});
