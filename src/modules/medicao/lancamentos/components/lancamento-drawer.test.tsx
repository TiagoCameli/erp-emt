import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Drawer de Lançamento: o combobox de serviço filtra pela data, o excesso (MCEXC) mostra o
 * alerta forte e o campo do motivo (reenviando `motivoExcesso` sem perder o resto digitado), o
 * erro comum aparece em toast, e o sucesso fecha o drawer. `@/modules/_shared/anexos/*` é
 * mockado por inteiro: quem confere fotos e arquivos é o teste do próprio módulo, não este.
 */

const salvarLancamento = vi.fn();
const toastErro = vi.fn();
const toastSucesso = vi.fn();

vi.mock("@/modules/medicao/lancamentos/actions", () => ({
  salvarLancamento: (...args: unknown[]) => salvarLancamento(...args),
}));
vi.mock("@/components/canonicos/toast", () => ({
  toast: {
    error: (...a: unknown[]) => toastErro(...a),
    success: (...a: unknown[]) => toastSucesso(...a),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));
vi.mock("@/modules/_shared/anexos/fotos-e-arquivos", () => ({
  FILA_VAZIA: { fotos: [], arquivos: [] },
  filaTemAlgo: () => false,
  subirFilaFotosEArquivos: vi.fn(async () => []),
  useAnexosDoRegistro: () => ({ anexos: [], erro: null, recarregar: vi.fn() }),
  FilaFotosEArquivos: () => <div data-testid="fila-fotos" />,
  FotosEArquivos: () => <div data-testid="fotos-arquivos" />,
}));

import { instalarLayoutDeLista } from "@/components/canonicos/combobox-jsdom-teste";
import { LancamentoDrawer } from "@/modules/medicao/lancamentos/components/lancamento-drawer";
import type { LancamentoLista, ServicoParaLancar } from "@/modules/medicao/lancamentos/tipos";

const CONTRATO = "33333333-3333-4333-8333-333333333333";

function servico(over: Partial<ServicoParaLancar> = {}): ServicoParaLancar {
  return {
    medicaoId: "m11",
    medicaoNumero: 11,
    periodoInicio: "2026-09-01",
    periodoFim: "2026-09-30",
    itemId: "44444444-4444-4444-8444-444444444444",
    codigo: "02.02",
    descricao: "Escavação",
    unidade: "m3",
    quantidadePrevista: "1000",
    ordem: 1,
    ...over,
  };
}

function lancamento(over: Partial<LancamentoLista> = {}): LancamentoLista {
  return {
    id: "l1",
    contratoId: CONTRATO,
    medicaoId: "m11",
    medicaoNumero: 11,
    medicaoStatus: "aberta",
    itemId: "44444444-4444-4444-8444-444444444444",
    codigo: "02.02",
    descricao: "Escavação",
    unidade: "m3",
    data: "2026-09-10",
    quantidade: "10",
    kmInicial: null,
    kmFinal: null,
    estaca: null,
    localTexto: null,
    observacao: null,
    motivoExcesso: null,
    createdAt: "2026-09-10T12:00:00Z",
    createdBy: "u1",
    anexos: 0,
    ...over,
  };
}

/** Abre o combobox de serviço e escolhe a única opção disponível. */
function escolherServico() {
  fireEvent.click(screen.getByRole("combobox"));
  fireEvent.click(screen.getByRole("option", { name: /02\.02/ }));
}

beforeAll(() => {
  instalarLayoutDeLista();
});

beforeEach(() => {
  salvarLancamento.mockReset();
  toastErro.mockReset();
  toastSucesso.mockReset();
});
afterEach(cleanup);

describe("LancamentoDrawer", () => {
  it("novo lançamento: título, data default hoje e sem o campo de motivo do excesso", () => {
    render(
      <LancamentoDrawer
        aberto
        onAbertoChange={vi.fn()}
        lancamento={null}
        contratoId={CONTRATO}
        tipoLocalizacao="texto"
        servicos={[servico()]}
        onSalvo={vi.fn()}
      />,
    );
    expect(screen.getByText("Novo lançamento")).toBeTruthy();
    expect(screen.queryByLabelText(/Motivo do excesso/)).toBeNull();
  });

  it("código repetido entre serviços da mesma medição: as opções do combobox ficam distinguíveis pela linha da planilha", () => {
    const servicos = [
      servico({ itemId: "item-a", ordem: 5 }),
      servico({ itemId: "item-b", ordem: 9 }),
    ];
    render(
      <LancamentoDrawer
        aberto
        onAbertoChange={vi.fn()}
        lancamento={null}
        contratoId={CONTRATO}
        tipoLocalizacao="texto"
        servicos={servicos}
        onSalvo={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("combobox"));
    const opcoes = screen.getAllByRole("option", { name: /02\.02/ });
    expect(opcoes).toHaveLength(2);
    expect(opcoes[0].textContent).toContain("linha 5 da planilha");
    expect(opcoes[1].textContent).toContain("linha 9 da planilha");
    expect((screen.getByLabelText(/^Data/) as HTMLInputElement).value).not.toBe("");
  });

  it("grava com sucesso e fecha o drawer", async () => {
    salvarLancamento.mockResolvedValue({ ok: true, id: "novo-id" });
    const onAbertoChange = vi.fn();
    const onSalvo = vi.fn();
    render(
      <LancamentoDrawer
        aberto
        onAbertoChange={onAbertoChange}
        lancamento={null}
        contratoId={CONTRATO}
        tipoLocalizacao="texto"
        servicos={[servico()]}
        onSalvo={onSalvo}
      />,
    );

    escolherServico();
    fireEvent.change(screen.getByLabelText(/Quantidade/), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Lançar" }));

    await waitFor(() => expect(salvarLancamento).toHaveBeenCalledTimes(1));
    expect(salvarLancamento.mock.calls[0][0]).toMatchObject({ itemId: "44444444-4444-4444-8444-444444444444", quantidade: "10" });
    await waitFor(() => expect(toastSucesso).toHaveBeenCalledWith("Lançamento gravado"));
    expect(onAbertoChange).toHaveBeenCalledWith(false);
    expect(onSalvo).toHaveBeenCalled();
  });

  it("excesso (MCEXC): mostra o alerta forte e o campo do motivo, e reenvia com motivoExcesso mantendo o resto", async () => {
    salvarLancamento.mockResolvedValueOnce({
      ok: false,
      erro: "O acumulado do 02.02 passa a 1.100 m3, acima do previsto de 1.000 m3. Informe o motivo",
      excesso: true,
    });
    salvarLancamento.mockResolvedValueOnce({ ok: true, id: "novo-id" });

    render(
      <LancamentoDrawer
        aberto
        onAbertoChange={vi.fn()}
        lancamento={null}
        contratoId={CONTRATO}
        tipoLocalizacao="texto"
        servicos={[servico()]}
        onSalvo={vi.fn()}
      />,
    );

    escolherServico();
    fireEvent.change(screen.getByLabelText(/Quantidade/), { target: { value: "150" } });
    fireEvent.click(screen.getByRole("button", { name: "Lançar" }));

    await waitFor(() =>
      expect(
        screen.getByText("O acumulado do 02.02 passa a 1.100 m3, acima do previsto de 1.000 m3. Informe o motivo"),
      ).toBeTruthy(),
    );
    const campoMotivo = screen.getByLabelText(/Motivo do excesso/);
    expect(campoMotivo).toBeTruthy();

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

    render(
      <LancamentoDrawer
        aberto
        onAbertoChange={vi.fn()}
        lancamento={null}
        contratoId={CONTRATO}
        tipoLocalizacao="texto"
        servicos={[servico()]}
        onSalvo={vi.fn()}
      />,
    );

    escolherServico();
    fireEvent.change(screen.getByLabelText(/Quantidade/), { target: { value: "150" } });
    fireEvent.click(screen.getByRole("button", { name: "Lançar" }));

    await waitFor(() => expect(screen.getByLabelText(/Motivo do excesso/)).toBeTruthy());
    expect(salvarLancamento).toHaveBeenCalledTimes(1);

    // Reenviar sem preencher o motivo: recusa no cliente, sem nova chamada ao banco.
    fireEvent.click(screen.getByRole("button", { name: "Lançar" }));
    await waitFor(() =>
      expect(screen.getByText(/Informe o motivo do excesso/)).toBeTruthy(),
    );
    expect(salvarLancamento).toHaveBeenCalledTimes(1);

    // Motivo curto (menos de 3 letras) também recusa no cliente.
    const campoMotivo = screen.getByLabelText(/Motivo do excesso/);
    fireEvent.change(campoMotivo, { target: { value: "ab" } });
    fireEvent.click(screen.getByRole("button", { name: "Lançar" }));
    await waitFor(() => expect(screen.getByText(/Informe o motivo do excesso/)).toBeTruthy());
    expect(salvarLancamento).toHaveBeenCalledTimes(1);
  });

  it("editar um lançamento que já tinha motivo de excesso: o campo já vem preenchido e visível", () => {
    render(
      <LancamentoDrawer
        aberto
        onAbertoChange={vi.fn()}
        lancamento={lancamento({ motivoExcesso: "Chuva atrasou o cronograma" })}
        contratoId={CONTRATO}
        tipoLocalizacao="texto"
        servicos={[servico()]}
        onSalvo={vi.fn()}
      />,
    );
    expect((screen.getByLabelText(/Motivo do excesso/) as HTMLTextAreaElement).value).toBe(
      "Chuva atrasou o cronograma",
    );
  });

  it("reenvia o motivo do excesso ao editar mesmo sem novo excesso (DB behavior #1)", async () => {
    salvarLancamento.mockResolvedValue({ ok: true, id: "l1" });
    render(
      <LancamentoDrawer
        aberto
        onAbertoChange={vi.fn()}
        lancamento={lancamento({ motivoExcesso: "Chuva atrasou o cronograma" })}
        contratoId={CONTRATO}
        tipoLocalizacao="texto"
        servicos={[servico()]}
        onSalvo={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Salvar lançamento" }));

    await waitFor(() => expect(salvarLancamento).toHaveBeenCalledTimes(1));
    const [dados, id] = salvarLancamento.mock.calls[0];
    expect(dados.motivoExcesso).toBe("Chuva atrasou o cronograma");
    expect(id).toBe("l1");
  });

  it("erro comum (P0001) aparece em toast, sem fechar o drawer", async () => {
    salvarLancamento.mockResolvedValue({
      ok: false,
      erro: "Não há medição aberta para 10/09/2026",
      excesso: false,
    });
    const onAbertoChange = vi.fn();
    render(
      <LancamentoDrawer
        aberto
        onAbertoChange={onAbertoChange}
        lancamento={null}
        contratoId={CONTRATO}
        tipoLocalizacao="texto"
        servicos={[servico()]}
        onSalvo={vi.fn()}
      />,
    );

    escolherServico();
    fireEvent.change(screen.getByLabelText(/Quantidade/), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Lançar" }));

    await waitFor(() => expect(toastErro).toHaveBeenCalledWith("Não há medição aberta para 10/09/2026"));
    expect(onAbertoChange).not.toHaveBeenCalledWith(false);
    expect(screen.queryByLabelText(/Motivo do excesso/)).toBeNull();
  });

  it("contrato de rodovia: km inicial e final obrigatórios (recusa antes de chamar o banco)", async () => {
    render(
      <LancamentoDrawer
        aberto
        onAbertoChange={vi.fn()}
        lancamento={null}
        contratoId={CONTRATO}
        tipoLocalizacao="rodovia"
        servicos={[servico()]}
        onSalvo={vi.fn()}
      />,
    );

    escolherServico();
    fireEvent.change(screen.getByLabelText(/Quantidade/), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Lançar" }));

    await waitFor(() => expect(toastErro).toHaveBeenCalled());
    expect(salvarLancamento).not.toHaveBeenCalled();
  });
});
