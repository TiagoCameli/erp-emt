import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Fotos e arquivos do registro que já existe (edição e detalhe): o mesmo documento dividido
 * pelo tipo do arquivo, os migrados da origem incluídos; quem não edita só vê e baixa; o
 * limite de 8 por grupo vale antes de subir.
 */

vi.mock("@/components/canonicos/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock("@/modules/_shared/anexos/actions", () => ({
  anexosDoDocumento: vi.fn(async () => []),
  removerAnexo: vi.fn(),
  urlDoAnexo: vi.fn(),
}));
vi.mock("@/modules/_shared/anexos/enviar-do-navegador", () => ({
  enviarAnexoDoNavegador: vi.fn(async () => ({ ok: true })),
}));

import { toast } from "@/components/canonicos/toast";
import { enviarAnexoDoNavegador } from "@/modules/_shared/anexos/enviar-do-navegador";
import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";
import {
  AnexosCombustivel,
  FILA_VAZIA,
  FilaAnexosCombustivel,
  subirFilaCombustivel,
} from "@/modules/combustivel/_shared/components/anexos-combustivel";

const ID = "77777777-7777-4777-8777-777777777777";

function anexo(nome: string, tipoMime: string, i: number): AnexoDoDocumento {
  return {
    vinculoId: `00000000-0000-4000-8000-00000000000${i}`,
    arquivoId: `a${i}`,
    nome,
    tipoMime,
    tamanhoBytes: 2048,
    criadoEm: "2026-05-10T12:00:00Z",
    criadoPorNome: null,
    propagado: false,
    origemNumero: null,
    origemRotulo: null,
  };
}

const MIGRADOS = [anexo("bomba.jpg", "image/jpeg", 1), anexo("comprovante.pdf", "application/pdf", 2)];

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:local");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AnexosCombustivel", () => {
  it("divide o documento em Fotos e Arquivos pelo tipo do arquivo", () => {
    render(<AnexosCombustivel entidade="combustivel_saida" entidadeId={ID} anexos={MIGRADOS} podeEditar={false} />);
    expect(screen.getByText("Fotos (1/8)")).toBeInTheDocument();
    expect(screen.getByText("Arquivos (1/8)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Visualizar bomba.jpg" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Baixar comprovante.pdf" })).toBeInTheDocument();
  });

  it("sem editar: só ver e baixar, sem enviar, sem câmera e sem remover", () => {
    render(<AnexosCombustivel entidade="combustivel_saida" entidadeId={ID} anexos={MIGRADOS} podeEditar={false} />);
    expect(screen.queryByRole("button", { name: /Remover/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Tirar foto" })).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it("com editar: remover em cada anexo e a câmera nas fotos", () => {
    render(<AnexosCombustivel entidade="combustivel_entrada" entidadeId={ID} anexos={MIGRADOS} podeEditar />);
    expect(screen.getByRole("button", { name: "Remover bomba.jpg deste documento" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remover comprovante.pdf deste documento" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Tirar foto" })).toHaveLength(1);
  });

  it("com 8 fotos, a nona é recusada antes de subir", async () => {
    const oito = Array.from({ length: 8 }, (_, i) => anexo(`f${i}.jpg`, "image/jpeg", i));
    render(<AnexosCombustivel entidade="combustivel_saida" entidadeId={ID} anexos={oito} podeEditar />);
    const galeria = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"][multiple]')).find((i) =>
      (i.getAttribute("accept") ?? "").includes("image/jpeg"),
    )!;
    fireEvent.change(galeria, { target: { files: [new File(["x"], "nona.jpg", { type: "image/jpeg" })] } });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("nona.jpg: o limite é 8 fotos"));
    expect(enviarAnexoDoNavegador).not.toHaveBeenCalled();
  });

  it("carregando e erro têm estado próprio", () => {
    const { rerender } = render(
      <AnexosCombustivel entidade="combustivel_saida" entidadeId={ID} anexos={null} podeEditar />,
    );
    expect(screen.getByText("Carregando os anexos")).toBeInTheDocument();
    rerender(
      <AnexosCombustivel
        entidade="combustivel_saida"
        entidadeId={ID}
        anexos={null}
        erro="Não foi possível carregar os anexos"
        podeEditar
      />,
    );
    expect(screen.getByRole("alert").textContent).toBe("Não foi possível carregar os anexos");
  });
});

describe("FilaAnexosCombustivel", () => {
  it("só fotos (o celular) esconde a seção de arquivos", () => {
    render(<FilaAnexosCombustivel fila={FILA_VAZIA} onMudar={vi.fn()} soFotos />);
    expect(screen.getByText("Fotos (0/8)")).toBeInTheDocument();
    expect(screen.queryByText(/Arquivos/)).toBeNull();
  });
});

describe("subirFilaCombustivel", () => {
  it("sem id nada sobe e todos voltam como falha (o aviso não esconde nenhum)", async () => {
    const a = new File(["x"], "a.jpg", { type: "image/jpeg" });
    await expect(subirFilaCombustivel("combustivel_entrada", null, { fotos: [a], arquivos: [] })).resolves.toEqual([
      { nome: "a.jpg", erro: "o registro não voltou com id" },
    ]);
    expect(enviarAnexoDoNavegador).not.toHaveBeenCalled();
  });

  it("fotos e arquivos sobem no mesmo documento", async () => {
    const a = new File(["x"], "a.jpg", { type: "image/jpeg" });
    const b = new File(["y"], "nf.pdf", { type: "application/pdf" });
    await expect(subirFilaCombustivel("combustivel_saida", ID, { fotos: [a], arquivos: [b] })).resolves.toEqual([]);
    expect(vi.mocked(enviarAnexoDoNavegador).mock.calls).toEqual([
      ["combustivel_saida", ID, a],
      ["combustivel_saida", ID, b],
    ]);
  });
});
