import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * A fila de anexos da criação, como o Frete: os arquivos esperam no navegador e sobem logo
 * depois do salvar, no id que o banco devolveu. Anexo que não sobe NÃO derruba o salvar:
 * o registro fica, o drawer fecha e o aviso lista o arquivo.
 */

vi.mock("@/components/canonicos", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/components/canonicos")>();
  return {
    ...real,
    Combobox: (props: { id?: string; valor: string; onValorChange: (valor: string) => void; opcoes: { valor: string; rotulo: string }[] }) => (
      <select id={props.id} value={props.valor} onChange={(evento) => props.onValorChange(evento.target.value)}>
        <option value="">Selecione</option>
        {props.opcoes.map((opcao) => (
          <option key={opcao.valor} value={opcao.valor}>
            {opcao.rotulo}
          </option>
        ))}
      </select>
    ),
  };
});

vi.mock("@/components/canonicos/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock("@/modules/combustivel/transferencias/actions", () => ({
  consultarEstoqueTransferencia: vi.fn(),
  consultarPrecoMedioTanque: vi.fn(),
  consultarCombustivelNaData: vi.fn(),
  salvarTransferencia: vi.fn(),
}));

vi.mock("@/modules/_shared/anexos/actions", () => ({
  anexosDoDocumento: vi.fn(async () => []),
  removerAnexo: vi.fn(),
  urlDoAnexo: vi.fn(),
}));

vi.mock("@/modules/_shared/anexos/enviar-do-navegador", () => ({
  enviarAnexoDoNavegador: vi.fn(),
}));

import { toast } from "@/components/canonicos/toast";
import { enviarAnexoDoNavegador } from "@/modules/_shared/anexos/enviar-do-navegador";
import {
  consultarCombustivelNaData,
  consultarEstoqueTransferencia,
  consultarPrecoMedioTanque,
  salvarTransferencia,
} from "@/modules/combustivel/transferencias/actions";
import {
  TransferenciaFormDrawer,
  type TanqueOpcao,
} from "@/modules/combustivel/transferencias/components/transferencia-form-drawer";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const NOVO = "99999999-9999-4999-8999-999999999999";

const TANQUES: TanqueOpcao[] = [
  { id: A, nome: "Tanque Base", nivel: 5000, capacidade: 10000, combustivelId: "diesel", combustivelNome: "Diesel S10" },
  { id: B, nome: "Comboio 01", nivel: 0, capacidade: 10000, combustivelId: null, combustivelNome: null },
];

function foto(nome: string): File {
  return new File(["bytes"], nome, { type: "image/jpeg" });
}

/** O seletor da galeria de fotos (o da câmera tem `capture` e não é `multiple`). */
function inputGaleriaDeFotos(): HTMLInputElement {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"][multiple]'));
  const galeria = inputs.find((i) => (i.getAttribute("accept") ?? "").includes("image/jpeg"));
  if (!galeria) throw new Error("sem seletor de fotos");
  return galeria;
}

async function preencherELancar() {
  fireEvent.change(screen.getByLabelText(/Tanque de origem/), { target: { value: A } });
  fireEvent.change(screen.getByLabelText(/Quantidade \(litros\)/), { target: { value: "100" } });
  fireEvent.change(screen.getByLabelText(/Tanque de destino/), { target: { value: B } });
  const botao = await screen.findByRole("button", { name: "Lançar transferência" });
  await waitFor(() => expect(botao).toBeEnabled());
  fireEvent.click(botao);
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:local");
  URL.revokeObjectURL = vi.fn();
  vi.mocked(consultarEstoqueTransferencia).mockResolvedValue({ ok: true, litros: 5000 });
  vi.mocked(consultarPrecoMedioTanque).mockResolvedValue({ ok: true, preco: 6.3947 });
  vi.mocked(consultarCombustivelNaData).mockResolvedValue({ ok: true, nome: "Diesel S10" });
  vi.mocked(salvarTransferencia).mockResolvedValue({ ok: true, id: NOVO });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("anexos na criação da transferência", () => {
  it("a câmera abre a traseira do celular e a galeria só oferece os tipos de foto", () => {
    render(<TransferenciaFormDrawer aberto onAbertoChange={vi.fn()} tanques={TANQUES} />);
    const camera = screen.getByTestId("input-camera");
    expect(camera.getAttribute("capture")).toBe("environment");
    expect(camera.getAttribute("accept")).toBe("image/*");
    expect(inputGaleriaDeFotos().getAttribute("accept")).toBe("image/jpeg,image/png,image/webp,image/heic,image/heif");
    expect(screen.getByRole("button", { name: "Tirar foto" })).toBeInTheDocument();
  });

  it("sobe a fila no id que o salvar devolveu, depois do salvar", async () => {
    vi.mocked(enviarAnexoDoNavegador).mockResolvedValue({ ok: true });
    const onAbertoChange = vi.fn();
    render(<TransferenciaFormDrawer aberto onAbertoChange={onAbertoChange} tanques={TANQUES} />);

    const bomba = foto("nivel-antes.jpg");
    fireEvent.change(inputGaleriaDeFotos(), { target: { files: [bomba] } });
    expect(await screen.findByText("nivel-antes.jpg")).toBeInTheDocument();
    expect(enviarAnexoDoNavegador).not.toHaveBeenCalled();

    await preencherELancar();
    await waitFor(() => expect(enviarAnexoDoNavegador).toHaveBeenCalledTimes(1));
    expect(enviarAnexoDoNavegador).toHaveBeenCalledWith("combustivel_transferencia", NOVO, bomba);
    expect(vi.mocked(salvarTransferencia).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(enviarAnexoDoNavegador).mock.invocationCallOrder[0]!,
    );
    await waitFor(() => expect(onAbertoChange).toHaveBeenCalledWith(false));
    expect(toast.success).toHaveBeenCalledWith("Transferência lançada");
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("anexo que falha vira aviso com o nome; a transferência fica e o drawer fecha", async () => {
    vi.mocked(enviarAnexoDoNavegador)
      .mockResolvedValueOnce({ erro: "O envio do arquivo falhou. Tente de novo" })
      .mockResolvedValueOnce({ ok: true });
    const onAbertoChange = vi.fn();
    render(<TransferenciaFormDrawer aberto onAbertoChange={onAbertoChange} tanques={TANQUES} />);

    fireEvent.change(inputGaleriaDeFotos(), { target: { files: [foto("a.jpg"), foto("b.jpg")] } });
    await preencherELancar();

    await waitFor(() => expect(onAbertoChange).toHaveBeenCalledWith(false));
    expect(enviarAnexoDoNavegador).toHaveBeenCalledTimes(2);
    expect(toast.warning).toHaveBeenCalledWith(
      "Transferência lançada, mas 1 anexo não subiu: a.jpg (O envio do arquivo falhou. Tente de novo). Abra o registro e anexe de novo",
      expect.anything(),
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("sem fila não chama o envio", async () => {
    const onAbertoChange = vi.fn();
    render(<TransferenciaFormDrawer aberto onAbertoChange={onAbertoChange} tanques={TANQUES} />);
    await preencherELancar();
    await waitFor(() => expect(onAbertoChange).toHaveBeenCalledWith(false));
    expect(enviarAnexoDoNavegador).not.toHaveBeenCalled();
  });

  it("PDF na seção de fotos é recusado com o motivo e não entra na fila", async () => {
    render(<TransferenciaFormDrawer aberto onAbertoChange={vi.fn()} tanques={TANQUES} />);
    fireEvent.change(inputGaleriaDeFotos(), {
      target: { files: [new File(["x"], "nf.pdf", { type: "application/pdf" })] },
    });
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("nf.pdf: tipo não aceito como foto (use JPEG, PNG ou WebP)"),
    );
    expect(screen.queryByText("nf.pdf")).toBeNull();
  });
});
