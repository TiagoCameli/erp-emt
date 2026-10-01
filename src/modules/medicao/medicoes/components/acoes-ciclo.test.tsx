import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Botões do ciclo no detalhe da medição: só os passos que o servidor calculou (status e permissão)
 * aparecem; Fechar e Enviar passam pela confirmação canônica; Reabrir, Nova revisão e Revisar
 * aprovada pedem motivo; a recusa do banco aparece no toast; o botão de confirmar fica desabilitado
 * enquanto o pedido está no ar (duplo clique não manda dois).
 */

const acoes = vi.hoisted(() => ({
  fecharMedicao: vi.fn(),
  reabrirMedicao: vi.fn(),
  enviarMedicao: vi.fn(),
  novaRevisao: vi.fn(),
  revisarAprovada: vi.fn(),
  lancarAjuste: vi.fn(),
}));
const toastErro = vi.fn();
const toastSucesso = vi.fn();
const refresh = vi.fn();

vi.mock("@/modules/medicao/medicoes/ciclo-actions", () => acoes);
vi.mock("@/components/canonicos/toast", () => ({
  toast: {
    error: (...a: unknown[]) => toastErro(...a),
    success: (...a: unknown[]) => toastSucesso(...a),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh }),
}));

import { AcoesCiclo } from "@/modules/medicao/medicoes/components/acoes-ciclo";
import type { PassoCiclo } from "@/modules/medicao/medicoes/ciclo";

const ID = "33333333-3333-4333-8333-333333333333";

function renderizar(passos: PassoCiclo[], revisaoNumero: number | null = 0) {
  return render(<AcoesCiclo medicaoId={ID} numero={3} passos={passos} revisaoNumero={revisaoNumero} servicos={[]} />);
}

beforeEach(() => {
  for (const f of Object.values(acoes)) f.mockReset();
  toastErro.mockReset();
  toastSucesso.mockReset();
  refresh.mockReset();
});
afterEach(cleanup);

describe("AcoesCiclo: botões por passo", () => {
  it("aberta (fechar): só Fechar medição", () => {
    renderizar(["fechar"]);
    expect(screen.getByRole("button", { name: "Fechar medição" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Reabrir|Enviar|ajuste|revisão/i })).toBeNull();
  });

  it("em conferência: Reabrir, Lançar ajuste e Enviar REVnn", () => {
    renderizar(["reabrir", "ajuste", "enviar"], 1);
    expect(screen.getByRole("button", { name: "Reabrir" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lançar ajuste" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enviar REV01" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Fechar medição" })).toBeNull();
  });

  it("enviada: Nova revisão; Aprovar não vira botão sem a tela de aprovação (Task 4)", () => {
    renderizar(["nova_revisao", "aprovar"]);
    expect(screen.getByRole("button", { name: "Nova revisão" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Aprovar/ })).toBeNull();
  });

  it("aprovar aparece quando a tela passa o botão de aprovação", () => {
    render(
      <AcoesCiclo
        medicaoId={ID}
        numero={3}
        passos={["aprovar"]}
        revisaoNumero={0}
        servicos={[]}
        botaoAprovar={<button type="button">Aprovar REV00</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Aprovar REV00" })).toBeTruthy();
  });

  it("aprovada sem pendente: Revisar aprovada", () => {
    renderizar(["revisar_aprovada"], null);
    expect(screen.getByRole("button", { name: "Revisar aprovada" })).toBeTruthy();
  });

  it("sem passo nenhum (sem permissão): nada", () => {
    const { container } = renderizar([]);
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });
});

describe("AcoesCiclo: fechar", () => {
  it("confirma, chama a action e mostra o erro do banco", async () => {
    acoes.fecharMedicao.mockResolvedValue({ erro: "A 3ª medição está Enviada e só fecha quando aberta" });
    renderizar(["fechar"]);

    fireEvent.click(screen.getByRole("button", { name: "Fechar medição" }));
    expect(acoes.fecharMedicao).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Fechar para conferência" }));

    await waitFor(() => expect(toastErro).toHaveBeenCalledWith("A 3ª medição está Enviada e só fecha quando aberta"));
    expect(acoes.fecharMedicao).toHaveBeenCalledWith(ID);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("sucesso: avisa e atualiza a tela", async () => {
    acoes.fecharMedicao.mockResolvedValue({ ok: true });
    renderizar(["fechar"]);
    fireEvent.click(screen.getByRole("button", { name: "Fechar medição" }));
    fireEvent.click(await screen.findByRole("button", { name: "Fechar para conferência" }));
    await waitFor(() => expect(toastSucesso).toHaveBeenCalledWith("3ª medição fechada para conferência"));
    expect(refresh).toHaveBeenCalled();
  });
});

describe("AcoesCiclo: enviar", () => {
  it("botão de confirmar fica desabilitado enquanto envia; duplo clique manda um pedido só", async () => {
    let terminar: (v: unknown) => void = () => {};
    acoes.enviarMedicao.mockReturnValue(new Promise((r) => (terminar = r)));
    renderizar(["reabrir", "ajuste", "enviar"]);

    fireEvent.click(screen.getByRole("button", { name: "Enviar REV00" }));
    const confirmar = await screen.findByRole("button", { name: "Enviar REV00 ao contratante" });
    fireEvent.click(confirmar);
    await waitFor(() => expect(confirmar).toBeDisabled());
    fireEvent.click(confirmar);
    expect(acoes.enviarMedicao).toHaveBeenCalledTimes(1);

    terminar({ ok: true });
    await waitFor(() => expect(toastSucesso).toHaveBeenCalledWith("REV00 enviada ao contratante"));
  });
});

describe("AcoesCiclo: passos com motivo", () => {
  it("reabrir manda o motivo digitado", async () => {
    acoes.reabrirMedicao.mockResolvedValue({ ok: true });
    renderizar(["reabrir"]);
    fireEvent.click(screen.getByRole("button", { name: "Reabrir" }));
    fireEvent.change(await screen.findByLabelText("Motivo"), { target: { value: "Faltou lançamento" } });
    fireEvent.click(screen.getByRole("button", { name: "Reabrir medição" }));
    await waitFor(() => expect(acoes.reabrirMedicao).toHaveBeenCalledWith(ID, "Faltou lançamento"));
  });

  it("nova revisão manda o motivo", async () => {
    acoes.novaRevisao.mockResolvedValue({ ok: true });
    renderizar(["nova_revisao"]);
    fireEvent.click(screen.getByRole("button", { name: "Nova revisão" }));
    fireEvent.change(await screen.findByLabelText("Motivo"), { target: { value: "DNIT devolveu" } });
    fireEvent.click(screen.getByRole("button", { name: "Abrir REV01" }));
    await waitFor(() => expect(acoes.novaRevisao).toHaveBeenCalledWith(ID, "DNIT devolveu"));
  });

  it("recusa do banco: o diálogo continua aberto com o motivo digitado", async () => {
    acoes.reabrirMedicao.mockResolvedValue({ erro: "A 3ª medição está aberta e só reabre em conferência" });
    renderizar(["reabrir"]);
    fireEvent.click(screen.getByRole("button", { name: "Reabrir" }));
    fireEvent.change(await screen.findByLabelText("Motivo"), { target: { value: "Faltou lançamento" } });
    fireEvent.click(screen.getByRole("button", { name: "Reabrir medição" }));
    await waitFor(() => expect(toastErro).toHaveBeenCalledWith("A 3ª medição está aberta e só reabre em conferência"));
    expect(screen.getByRole("dialog", { name: "Reabrir a 3ª medição" })).toBeTruthy();
    expect((screen.getByLabelText("Motivo") as HTMLTextAreaElement).value).toBe("Faltou lançamento");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("motivo com menos de 3 letras não libera o confirmar (o banco exige 3)", async () => {
    renderizar(["nova_revisao"]);
    fireEvent.click(screen.getByRole("button", { name: "Nova revisão" }));
    const motivo = await screen.findByLabelText("Motivo");
    fireEvent.change(motivo, { target: { value: " ab " } });
    expect(screen.getByRole("button", { name: "Abrir REV01" })).toBeDisabled();
    fireEvent.change(motivo, { target: { value: "abc" } });
    expect(screen.getByRole("button", { name: "Abrir REV01" })).not.toBeDisabled();
  });

  it("revisar aprovada manda o motivo e mostra a recusa do banco", async () => {
    acoes.revisarAprovada.mockResolvedValue({ erro: "A 3ª medição já tem revisão pós-aprovação pendente" });
    renderizar(["revisar_aprovada"], null);
    fireEvent.click(screen.getByRole("button", { name: "Revisar aprovada" }));
    fireEvent.change(await screen.findByLabelText("Motivo"), { target: { value: "DNIT pediu correção" } });
    fireEvent.click(screen.getByRole("button", { name: "Abrir revisão pós-aprovação" }));
    await waitFor(() => expect(toastErro).toHaveBeenCalledWith("A 3ª medição já tem revisão pós-aprovação pendente"));
    expect(acoes.revisarAprovada).toHaveBeenCalledWith(ID, "DNIT pediu correção");
  });
});
