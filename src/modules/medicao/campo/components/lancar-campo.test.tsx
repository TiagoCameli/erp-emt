import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Lançar pelo celular (Task 6): precisa de sinal, como o Abastecer da Manutenção (sem fila
 * offline, decisão do Tiago de 28/09/2026). Grava, sobe as fotos com o id que a action devolveu,
 * mostra "Lançado na Nª medição" e limpa o formulário para o próximo (mantendo a data). Sem
 * sinal, ou erro de rede, nada é gravado nem tentado de novo.
 */

const salvarLancamento = vi.fn();
const toastErro = vi.fn();
const toastSucesso = vi.fn();
const toastAviso = vi.fn();
const subirFilaFotosEArquivos = vi.fn();

vi.mock("@/modules/medicao/lancamentos/actions", () => ({
  salvarLancamento: (...args: unknown[]) => salvarLancamento(...args),
}));
vi.mock("@/components/canonicos/toast", () => ({
  toast: {
    error: (...a: unknown[]) => toastErro(...a),
    success: (...a: unknown[]) => toastSucesso(...a),
    warning: (...a: unknown[]) => toastAviso(...a),
    info: vi.fn(),
  },
}));
vi.mock("@/modules/_shared/anexos/fotos-e-arquivos", () => ({
  FILA_VAZIA: { fotos: [], arquivos: [] },
  filaTemAlgo: (fila: { fotos: unknown[]; arquivos: unknown[] }) => fila.fotos.length + fila.arquivos.length > 0,
  subirFilaFotosEArquivos: (...args: unknown[]) => subirFilaFotosEArquivos(...args),
  FilaFotosEArquivos: ({ fila, onMudar }: { fila: { fotos: File[] }; onMudar: (f: unknown) => void }) => (
    <button
      type="button"
      data-testid="fila-fotos"
      onClick={() => onMudar({ fotos: [...fila.fotos, new File(["x"], "bomba.jpg", { type: "image/jpeg" })], arquivos: [] })}
    >
      Adicionar foto ({fila.fotos.length})
    </button>
  ),
}));

import { instalarLayoutDeLista } from "@/components/canonicos/combobox-jsdom-teste";
import { LancarCampo } from "@/modules/medicao/campo/components/lancar-campo";
import type { ServicoParaLancar } from "@/modules/medicao/lancamentos/tipos";

const CONTRATO = "33333333-3333-4333-8333-333333333333";
const ITEM = "44444444-4444-4444-8444-444444444444";

function servico(over: Partial<ServicoParaLancar> = {}): ServicoParaLancar {
  return {
    medicaoId: "m11",
    medicaoNumero: 11,
    periodoInicio: "2026-09-01",
    periodoFim: "2026-09-30",
    itemId: ITEM,
    codigo: "02.02",
    descricao: "Escavação",
    unidade: "m3",
    quantidadePrevista: "1000",
    ordem: 1,
    ...over,
  };
}

function escolherServico() {
  fireEvent.click(screen.getByRole("combobox"));
  fireEvent.click(screen.getByRole("option", { name: /02\.02/ }));
}

function definirOnline(online: boolean) {
  Object.defineProperty(window.navigator, "onLine", { value: online, configurable: true });
}

beforeAll(() => {
  instalarLayoutDeLista();
});

beforeEach(() => {
  salvarLancamento.mockReset();
  toastErro.mockReset();
  toastSucesso.mockReset();
  toastAviso.mockReset();
  subirFilaFotosEArquivos.mockReset();
  subirFilaFotosEArquivos.mockResolvedValue([]);
  definirOnline(true);
});
afterEach(cleanup);

describe("LancarCampo", () => {
  it("formulário novo: data de hoje preenchida e sem o campo de motivo do excesso", () => {
    render(<LancarCampo contratoId={CONTRATO} tipoLocalizacao="texto" servicos={[servico()]} />);
    expect((screen.getByLabelText(/^Data/) as HTMLInputElement).value).not.toBe("");
    expect(screen.queryByLabelText(/Motivo do excesso/)).toBeNull();
  });

  it("contrato de rodovia: km inicial e final aparecem e são obrigatórios (recusa antes de chamar o banco)", async () => {
    render(<LancarCampo contratoId={CONTRATO} tipoLocalizacao="rodovia" servicos={[servico()]} />);
    escolherServico();
    fireEvent.change(screen.getByLabelText(/Quantidade/), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Lançar" }));

    await waitFor(() => expect(toastErro).toHaveBeenCalled());
    expect(salvarLancamento).not.toHaveBeenCalled();
  });

  it("contrato de texto: sem os campos de km", () => {
    render(<LancarCampo contratoId={CONTRATO} tipoLocalizacao="texto" servicos={[servico()]} />);
    expect(screen.queryByLabelText(/Km inicial/)).toBeNull();
    expect(screen.queryByLabelText(/Km final/)).toBeNull();
  });

  it("mudar a data para fora do período do serviço escolhido limpa a seleção (não só o rótulo: o item some de verdade)", () => {
    render(<LancarCampo contratoId={CONTRATO} tipoLocalizacao="texto" servicos={[servico()]} />);
    escolherServico();
    expect(screen.getByRole("combobox").textContent).toContain("02.02");

    // servico() cobre 2026-09-01 a 2026-09-30: 08-15 fica fora, sem nenhuma medição cobrindo. Se o
    // itemId só ficasse "órfão" (sem limpar de verdade), o combobox mostraria "Registro não
    // encontrado" em vez do placeholder — por isso o teste exige o placeholder exato, não só
    // "não contém mais o código".
    fireEvent.change(screen.getByLabelText(/^Data/), { target: { value: "2026-08-15" } });

    expect(screen.getByRole("combobox").textContent).toBe("Buscar por código ou descrição");
  });

  it("mudar a data para outro dia dentro do mesmo período mantém o serviço escolhido", () => {
    render(<LancarCampo contratoId={CONTRATO} tipoLocalizacao="texto" servicos={[servico()]} />);
    escolherServico();

    fireEvent.change(screen.getByLabelText(/^Data/), { target: { value: "2026-09-05" } });

    expect(screen.getByRole("combobox").textContent).toContain("02.02");
  });

  it("grava, sobe a foto no id devolvido, avisa a medição e limpa o formulário mantendo a data", async () => {
    salvarLancamento.mockResolvedValue({ ok: true, id: "novo-id" });
    render(<LancarCampo contratoId={CONTRATO} tipoLocalizacao="texto" servicos={[servico()]} />);

    const data = (screen.getByLabelText(/^Data/) as HTMLInputElement).value;
    escolherServico();
    fireEvent.change(screen.getByLabelText(/Quantidade/), { target: { value: "10" } });
    fireEvent.click(screen.getByTestId("fila-fotos"));
    await screen.findByText("Adicionar foto (1)");

    fireEvent.click(screen.getByRole("button", { name: "Lançar" }));

    await waitFor(() => expect(salvarLancamento).toHaveBeenCalledTimes(1));
    expect(salvarLancamento.mock.calls[0][0]).toMatchObject({ itemId: ITEM, quantidade: "10", contratoId: CONTRATO });
    await waitFor(() => expect(subirFilaFotosEArquivos).toHaveBeenCalledWith("mc_lancamento", "novo-id", expect.anything()));
    await waitFor(() => expect(toastSucesso).toHaveBeenCalledWith("Lançado na 11ª medição"));

    // Limpa para o próximo lançamento, mantendo a data e o contrato.
    expect((screen.getByLabelText(/^Data/) as HTMLInputElement).value).toBe(data);
    expect(screen.getByText("Adicionar foto (0)")).toBeTruthy();
  });

  it("foto que falha vira aviso; o lançamento não é regravado (salvarLancamento chamado uma vez só)", async () => {
    salvarLancamento.mockResolvedValue({ ok: true, id: "novo-id" });
    subirFilaFotosEArquivos.mockResolvedValue([{ nome: "bomba.jpg", erro: "O envio do arquivo falhou. Tente de novo" }]);
    render(<LancarCampo contratoId={CONTRATO} tipoLocalizacao="texto" servicos={[servico()]} />);

    escolherServico();
    fireEvent.change(screen.getByLabelText(/Quantidade/), { target: { value: "10" } });
    fireEvent.click(screen.getByTestId("fila-fotos"));
    await screen.findByText("Adicionar foto (1)");
    fireEvent.click(screen.getByRole("button", { name: "Lançar" }));

    await waitFor(() => expect(toastAviso).toHaveBeenCalled());
    expect(salvarLancamento).toHaveBeenCalledTimes(1);
    expect(toastErro).not.toHaveBeenCalled();
  });

  it("sem sinal: não chama a action e avisa para anotar e lançar depois", async () => {
    definirOnline(false);
    render(<LancarCampo contratoId={CONTRATO} tipoLocalizacao="texto" servicos={[servico()]} />);

    escolherServico();
    fireEvent.change(screen.getByLabelText(/Quantidade/), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Lançar" }));

    await waitFor(() => expect(toastErro).toHaveBeenCalledWith("Sem internet. Anote e lance quando tiver sinal."));
    expect(salvarLancamento).not.toHaveBeenCalled();
  });

  it("erro de rede ao enviar: mesmo aviso de sem sinal, sem regravar", async () => {
    salvarLancamento.mockRejectedValue(new Error("failed to fetch"));
    render(<LancarCampo contratoId={CONTRATO} tipoLocalizacao="texto" servicos={[servico()]} />);

    escolherServico();
    fireEvent.change(screen.getByLabelText(/Quantidade/), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Lançar" }));

    await waitFor(() => expect(toastErro).toHaveBeenCalledWith("Sem internet. Anote e lance quando tiver sinal."));
  });

  it("excesso (MCEXC): mostra o alerta e o campo do motivo, reenvia mantendo o resto digitado", async () => {
    salvarLancamento.mockResolvedValueOnce({
      ok: false,
      erro: "O acumulado do 02.02 passa a 1.100 m3, acima do previsto de 1.000 m3. Informe o motivo",
      excesso: true,
    });
    salvarLancamento.mockResolvedValueOnce({ ok: true, id: "novo-id" });

    render(<LancarCampo contratoId={CONTRATO} tipoLocalizacao="texto" servicos={[servico()]} />);
    escolherServico();
    fireEvent.change(screen.getByLabelText(/Quantidade/), { target: { value: "150" } });
    fireEvent.click(screen.getByRole("button", { name: "Lançar" }));

    await waitFor(() =>
      expect(
        screen.getByText("O acumulado do 02.02 passa a 1.100 m3, acima do previsto de 1.000 m3. Informe o motivo"),
      ).toBeTruthy(),
    );
    const campoMotivo = screen.getByLabelText(/Motivo do excesso/);
    fireEvent.change(campoMotivo, { target: { value: "Chuva forte atrasou o cronograma" } });
    fireEvent.click(screen.getByRole("button", { name: "Lançar" }));

    await waitFor(() => expect(salvarLancamento).toHaveBeenCalledTimes(2));
    const segundoEnvio = salvarLancamento.mock.calls[1][0];
    expect(segundoEnvio.quantidade).toBe("150");
    expect(segundoEnvio.motivoExcesso).toBe("Chuva forte atrasou o cronograma");
  });

  it("excesso (MCEXC): resubmeter sem preencher o motivo (ou com motivo curto) recusa no cliente, sem chamar o banco de novo", async () => {
    salvarLancamento.mockResolvedValueOnce({
      ok: false,
      erro: "O acumulado do 02.02 passa a 1.100 m3, acima do previsto de 1.000 m3. Informe o motivo",
      excesso: true,
    });

    render(<LancarCampo contratoId={CONTRATO} tipoLocalizacao="texto" servicos={[servico()]} />);
    escolherServico();
    fireEvent.change(screen.getByLabelText(/Quantidade/), { target: { value: "150" } });
    fireEvent.click(screen.getByRole("button", { name: "Lançar" }));

    await waitFor(() => expect(screen.getByLabelText(/Motivo do excesso/)).toBeTruthy());
    expect(salvarLancamento).toHaveBeenCalledTimes(1);

    // Reenviar sem preencher o motivo: recusa no cliente, sem nova chamada ao banco.
    fireEvent.click(screen.getByRole("button", { name: "Lançar" }));
    await waitFor(() => expect(toastErro).toHaveBeenCalledWith(expect.stringContaining("motivo do excesso")));
    expect(salvarLancamento).toHaveBeenCalledTimes(1);

    // Motivo curto (menos de 3 letras) também recusa no cliente.
    const campoMotivo = screen.getByLabelText(/Motivo do excesso/);
    fireEvent.change(campoMotivo, { target: { value: "ab" } });
    fireEvent.click(screen.getByRole("button", { name: "Lançar" }));
    await waitFor(() => expect(screen.getByText(/Informe o motivo do excesso/)).toBeTruthy());
    expect(salvarLancamento).toHaveBeenCalledTimes(1);
  });
});
