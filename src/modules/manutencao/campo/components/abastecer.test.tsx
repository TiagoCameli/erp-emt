import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Fotos do abastecimento pelo celular (a MSaidaCombustivelPage da origem: bomba, hodômetro,
 * até 8): esperam no aparelho e sobem depois que a rota lançou a saída, no id que ela
 * devolveu. Foto que não sobe não desfaz o abastecimento.
 */

vi.mock("@/components/canonicos", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/components/canonicos")>();
  return {
    ...real,
    SeletorCentroCusto: (props: { idBase: string; valor: string; onValorChange: (v: string) => void }) => (
      <select aria-label="Obra" id={props.idBase} value={props.valor} onChange={(e) => props.onValorChange(e.target.value)}>
        <option value="">Selecione</option>
        <option value={CENTRO}>Obra BR-364</option>
      </select>
    ),
  };
});
vi.mock("@/components/canonicos/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock("@/modules/combustivel/abastecimentos/actions", () => ({
  calcularPrecoFifo: vi.fn(async () => ({ ok: true, precoMedio: 6.5, detalhamento: [], litrosSemSuprimento: 0 })),
}));
vi.mock("@/modules/manutencao/campo/fila", () => ({ enviarPelaRede: vi.fn() }));
vi.mock("@/modules/_shared/anexos/actions", () => ({
  anexosDoDocumento: vi.fn(async () => []),
  removerAnexo: vi.fn(),
  urlDoAnexo: vi.fn(),
}));
vi.mock("@/modules/_shared/anexos/enviar-do-navegador", () => ({ enviarAnexoDoNavegador: vi.fn() }));

import { toast } from "@/components/canonicos/toast";
import { enviarAnexoDoNavegador } from "@/modules/_shared/anexos/enviar-do-navegador";
import { Abastecer } from "@/modules/manutencao/campo/components/abastecer";
import { enviarPelaRede } from "@/modules/manutencao/campo/fila";

const CENTRO = "44444444-4444-4444-8444-444444444444";
const SAIDA = "88888888-8888-4888-8888-888888888888";
const TANQUE = { id: "11111111-1111-4111-8111-111111111111", rotulo: "Tanque Base", nivel: 5000, externo: false, combustivel: "Diesel S10", combustivelId: "d" };

function galeria(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>('input[type="file"][multiple]')!;
}

async function lancar() {
  fireEvent.change(screen.getByLabelText(/Litros/), { target: { value: "50" } });
  fireEvent.change(screen.getByLabelText("Obra"), { target: { value: CENTRO } });
  fireEvent.click(screen.getByRole("button", { name: /Lançar abastecimento/ }));
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:local");
  URL.revokeObjectURL = vi.fn();
  vi.mocked(enviarPelaRede).mockResolvedValue({ ok: true, id: SAIDA });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Abastecer pelo celular: fotos", () => {
  it("só fotos, com a câmera; sem seção de arquivos", () => {
    render(<Abastecer equipamentoId="e" tanques={[TANQUE]} centros={[]} onFeito={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Tirar foto" })).toBeInTheDocument();
    expect(screen.getByText("Fotos (0/8)")).toBeInTheDocument();
    expect(screen.queryByText(/Arquivos \(/)).toBeNull();
  });

  it("sobe as fotos no id da saída que a rota devolveu", async () => {
    vi.mocked(enviarAnexoDoNavegador).mockResolvedValue({ ok: true });
    const onFeito = vi.fn();
    render(<Abastecer equipamentoId="e" tanques={[TANQUE]} centros={[]} onFeito={onFeito} />);
    const bomba = new File(["x"], "bomba.jpg", { type: "image/jpeg" });
    fireEvent.change(galeria(), { target: { files: [bomba] } });
    await screen.findByText("bomba.jpg");

    await lancar();
    await waitFor(() => expect(onFeito).toHaveBeenCalled());
    expect(enviarAnexoDoNavegador).toHaveBeenCalledWith("combustivel_saida", SAIDA, bomba);
    expect(toast.success).toHaveBeenCalledWith("Abastecimento de 50,00 L lançado");
  });

  it("foto que falha vira aviso; o abastecimento continua lançado", async () => {
    vi.mocked(enviarAnexoDoNavegador).mockResolvedValue({ erro: "O envio do arquivo falhou. Tente de novo" });
    const onFeito = vi.fn();
    render(<Abastecer equipamentoId="e" tanques={[TANQUE]} centros={[]} onFeito={onFeito} />);
    fireEvent.change(galeria(), { target: { files: [new File(["x"], "hodometro.jpg", { type: "image/jpeg" })] } });
    await screen.findByText("hodometro.jpg");

    await lancar();
    await waitFor(() => expect(onFeito).toHaveBeenCalled());
    expect(toast.warning).toHaveBeenCalledWith(expect.stringMatching(/^Abastecimento de 50,00 L lançado, mas 1 anexo não subiu: hodometro\.jpg/), expect.anything());
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("recusa na rota não sobe foto nenhuma", async () => {
    vi.mocked(enviarPelaRede).mockResolvedValue({ ok: false, erro: "Saldo insuficiente", definitivo: true });
    render(<Abastecer equipamentoId="e" tanques={[TANQUE]} centros={[]} onFeito={vi.fn()} />);
    fireEvent.change(galeria(), { target: { files: [new File(["x"], "a.jpg", { type: "image/jpeg" })] } });
    await screen.findByText("a.jpg");
    await lancar();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Saldo insuficiente"));
    expect(enviarAnexoDoNavegador).not.toHaveBeenCalled();
  });
});
