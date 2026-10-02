import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Reajuste sem relatório SIAC: valor digitado (sem sinal) + sentido, situação, observação e o PDF
 * opcional: um pendente da medição ou um enviado ali mesmo pelo Anexos (documento da Prefeitura, que
 * não é SIAC e não passa pelo leitor). O que foi digitado vai como está; quem converte para o banco é
 * o schema do servidor (`manualSchema`), e a RPC confere de novo.
 */

const lancarReajusteManual = vi.fn();
const toastErro = vi.fn();
const toastSucesso = vi.fn();

const anexosDoDocumento = vi.fn<(...a: unknown[]) => Promise<unknown[]>>(async () => []);
const enviarAnexoDoNavegador = vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => ({ ok: true }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/medicao/medicoes/m1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/modules/_shared/anexos/actions", () => ({
  anexosDoDocumento: (...a: unknown[]) => anexosDoDocumento(...a),
  removerAnexo: vi.fn(async () => ({ ok: true })),
  urlDoAnexo: vi.fn(async () => ({ url: "https://exemplo/arquivo" })),
}));
vi.mock("@/modules/_shared/anexos/enviar-do-navegador", () => ({
  enviarAnexoDoNavegador: (...a: unknown[]) => enviarAnexoDoNavegador(...a),
}));
vi.mock("@/modules/medicao/reajuste/actions", () => ({
  lancarReajusteManual: (...a: unknown[]) => lancarReajusteManual(...a),
}));
vi.mock("@/components/canonicos/toast", () => ({
  toast: { error: (...a: unknown[]) => toastErro(...a), success: (...a: unknown[]) => toastSucesso(...a), warning: vi.fn(), info: vi.fn() },
}));

import { instalarLayoutDeLista } from "@/components/canonicos/combobox-jsdom-teste";
import { ReajusteManualDrawer } from "@/modules/medicao/reajuste/components/reajuste-manual-drawer";
import { anexo, ARQUIVO, ARQUIVO_USADO, MEDICAO } from "@/modules/medicao/reajuste/components/__fixtures__/tela";
import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";
import type { PdfPendente } from "@/modules/medicao/reajuste/tipos";

beforeAll(() => instalarLayoutDeLista());
beforeEach(() => {
  anexosDoDocumento.mockReset();
  anexosDoDocumento.mockResolvedValue([]);
  enviarAnexoDoNavegador.mockClear();
  lancarReajusteManual.mockReset();
  toastErro.mockReset();
  toastSucesso.mockReset();
});
afterEach(cleanup);

const PENDENTE: PdfPendente = { arquivoId: ARQUIVO, nome: "oficio-reajuste.pdf", criadoEm: "2026-10-02T12:00:00Z" };

function renderizar(extra: { pendentes?: PdfPendente[]; anexos?: AnexoDoDocumento[]; arquivosEmRelatorio?: string[] } = {}) {
  const onAbertoChange = vi.fn();
  const onLancado = vi.fn();
  render(
    <ReajusteManualDrawer
      aberto
      onAbertoChange={onAbertoChange}
      medicaoId={MEDICAO}
      numero={2}
      anexos={extra.anexos ?? [anexo(ARQUIVO, "oficio-reajuste.pdf")]}
      pendentes={extra.pendentes ?? [PENDENTE]}
      arquivosEmRelatorio={extra.arquivosEmRelatorio ?? []}
      onLancado={onLancado}
    />,
  );
  return { onAbertoChange, onLancado };
}

function escolher(rotulo: string, opcao: string) {
  fireEvent.click(screen.getByRole("combobox", { name: rotulo }));
  fireEvent.click(screen.getByRole("option", { name: opcao }));
}

describe("ReajusteManualDrawer", () => {
  it("manual negativo provisório com o PDF pendente vai como foi digitado", async () => {
    lancarReajusteManual.mockResolvedValue({ ok: true, relatorioId: "r5" });
    const { onAbertoChange, onLancado } = renderizar();
    fireEvent.change(screen.getByLabelText(/Valor/), { target: { value: "1234,56" } });
    escolher("Sentido", "Negativo (a devolver)");
    escolher("Situação dos índices", "Provisório");
    escolher("Anexo", "oficio-reajuste.pdf");
    fireEvent.change(screen.getByLabelText(/Observação/), { target: { value: "Ofício 12/2026 da Prefeitura" } });
    fireEvent.click(screen.getByRole("button", { name: "Lançar reajuste" }));

    await waitFor(() =>
      expect(lancarReajusteManual).toHaveBeenCalledWith(MEDICAO, {
        valor: "1234,56",
        sentido: "negativo",
        situacao: "provisorio",
        observacao: "Ofício 12/2026 da Prefeitura",
        arquivoId: ARQUIVO,
      }),
    );
    await waitFor(() => expect(toastSucesso).toHaveBeenCalledWith("Reajuste lançado na 2ª medição"));
    expect(onAbertoChange).toHaveBeenCalledWith(false);
    expect(onLancado).toHaveBeenCalled();
  });

  it("sem valor, sentido e situação não vai ao servidor e diz o que falta", async () => {
    renderizar();
    fireEvent.click(screen.getByRole("button", { name: "Lançar reajuste" }));
    expect(await screen.findByText("Informe o valor do reajuste, até 2 casas")).toBeTruthy();
    expect(screen.getByText("Escolha se o reajuste é positivo ou negativo")).toBeTruthy();
    expect(screen.getByText("Escolha a situação dos índices: provisório ou definitivo")).toBeTruthy();
    expect(lancarReajusteManual).not.toHaveBeenCalled();
  });

  it("recusa do banco aparece no toast como veio e o drawer fica aberto", async () => {
    lancarReajusteManual.mockResolvedValue({ erro: "A 2ª medição está aberta: o reajuste entra só em medição enviada ou aprovada" });
    const { onAbertoChange } = renderizar();
    fireEvent.change(screen.getByLabelText(/Valor/), { target: { value: "10" } });
    escolher("Sentido", "Positivo (a receber)");
    escolher("Situação dos índices", "Definitivo");
    fireEvent.click(screen.getByRole("button", { name: "Lançar reajuste" }));
    await waitFor(() =>
      expect(toastErro).toHaveBeenCalledWith("A 2ª medição está aberta: o reajuste entra só em medição enviada ou aprovada"),
    );
    expect(lancarReajusteManual).toHaveBeenCalledWith(MEDICAO, expect.objectContaining({ valor: "10", sentido: "positivo", situacao: "definitivo", arquivoId: null }));
    expect(onAbertoChange).not.toHaveBeenCalledWith(false);
  });

  it("PDF da Prefeitura enviado no próprio drawer (Anexos mc_reajuste, só PDF) já vem escolhido e vai no lançamento", async () => {
    const NOVO = "55555555-5555-4555-8555-555555555555";
    anexosDoDocumento.mockResolvedValue([anexo(NOVO, "incc-prefeitura.pdf")]);
    lancarReajusteManual.mockResolvedValue({ ok: true, relatorioId: "r6" });
    renderizar({ pendentes: [], anexos: [] });
    expect(screen.getByText("Arraste o PDF do documento do reajuste")).toBeTruthy();
    const input = document.body.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toBe("application/pdf");
    fireEvent.change(input, { target: { files: [new File(["%PDF-1.7"], "incc-prefeitura.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect(enviarAnexoDoNavegador).toHaveBeenCalled());
    expect(enviarAnexoDoNavegador.mock.calls[0]).toEqual(expect.arrayContaining(["mc_reajuste", MEDICAO]));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Anexo" }).textContent).toContain("incc-prefeitura.pdf"));

    fireEvent.change(screen.getByLabelText(/Valor/), { target: { value: "1234,56" } });
    escolher("Sentido", "Positivo (a receber)");
    escolher("Situação dos índices", "Provisório");
    fireEvent.click(screen.getByRole("button", { name: "Lançar reajuste" }));
    await waitFor(() => expect(lancarReajusteManual).toHaveBeenCalledWith(MEDICAO, expect.objectContaining({ arquivoId: NOVO })));
  });

  it("o Anexos do drawer não mostra o PDF que já está em relatório que vale", () => {
    renderizar({ anexos: [anexo(ARQUIVO, "oficio-reajuste.pdf"), anexo(ARQUIVO_USADO, "siac-def.pdf")], arquivosEmRelatorio: [ARQUIVO_USADO] });
    expect(screen.getAllByText("oficio-reajuste.pdf").length).toBeGreaterThan(0);
    expect(screen.queryByText("siac-def.pdf")).toBeNull();
  });
});
