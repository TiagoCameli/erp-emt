// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O documento do pdf.js é liberado com `destroy()` da tarefa de carga (solta o worker e a memória,
 * que no serverless fica presa entre pedidos), e não com `cleanup()`, que só limpa caches. Vale
 * também quando a leitura de uma página falha. A leitura do PDF real (várias seguidas no mesmo
 * processo) está em ler-relatorio.test.ts e para-banco.test.ts.
 */

vi.mock("server-only", () => ({}));

const doc = vi.hoisted(() => {
  const destroy = vi.fn(async () => undefined);
  return { numPages: 1, getPage: vi.fn(), cleanup: vi.fn(async () => undefined), destroy, loadingTask: { destroy } };
});

vi.mock("unpdf", () => ({ getDocumentProxy: vi.fn(async () => doc) }));

import { extrairTextoPdf } from "./extrair";

beforeEach(() => {
  doc.getPage.mockReset();
  doc.cleanup.mockClear();
  doc.destroy.mockClear();
});

const pagina = {
  getViewport: () => ({ convertToViewportPoint: (x: number, y: number) => [x, y] }),
  getTextContent: async () => ({ items: [{ str: "SIAC", transform: [1, 0, 0, 1, 10, 20] }] }),
};

describe("extrairTextoPdf libera o documento", () => {
  it("lê e chama destroy() uma vez, sem cleanup()", async () => {
    doc.getPage.mockResolvedValue(pagina);
    await expect(extrairTextoPdf(new Uint8Array([1]))).resolves.toEqual([[{ texto: "SIAC", x: 10, y: 20 }]]);
    expect(doc.destroy).toHaveBeenCalledTimes(1);
    expect(doc.cleanup).not.toHaveBeenCalled();
  });

  it("falha na página: o erro vira pt-BR e o documento é destruído do mesmo jeito", async () => {
    doc.getPage.mockRejectedValue(new Error("boom"));
    await expect(extrairTextoPdf(new Uint8Array([1]))).rejects.toThrow("O arquivo não é um PDF válido ou está corrompido.");
    expect(doc.destroy).toHaveBeenCalledTimes(1);
  });
});
