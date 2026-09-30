import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * "Colar do Excel": cola 3 linhas, `lerColagem` resolve as três contra os serviços da medição
 * aberta, `conferirColagem` confere de novo no banco (Review Focus 2/3 da contexto-comum: números
 * e datas do jeito do Excel, código repetido não escolhe sozinho) e a prévia mostra o erro do
 * banco por linha. Excesso pede o motivo NA linha (ou "aplicar a todas"), e só grava sem erro
 * nenhum pendente.
 */

const conferirColagem = vi.fn();
const gravarColagem = vi.fn();
const toastErro = vi.fn();
const toastSucesso = vi.fn();

vi.mock("@/modules/medicao/lancamentos/actions", () => ({
  conferirColagem: (...args: unknown[]) => conferirColagem(...args),
  gravarColagem: (...args: unknown[]) => gravarColagem(...args),
}));
vi.mock("@/components/canonicos/toast", () => ({
  toast: {
    error: (...a: unknown[]) => toastErro(...a),
    success: (...a: unknown[]) => toastSucesso(...a),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

import { ColarLancamentos } from "@/modules/medicao/lancamentos/components/colar-lancamentos";
import type { ServicoParaLancar } from "@/modules/medicao/lancamentos/tipos";

const CONTRATO = "33333333-3333-4333-8333-333333333333";
const ITEM = "44444444-4444-4444-8444-444444444444";

const SERVICO: ServicoParaLancar = {
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
};

/** 3 linhas válidas (a mesma medição, o mesmo item), sem km (tipoLocalizacao "texto"). */
const BLOCO_3_LINHAS = "10/09/2026\t02.02\t5\n11/09/2026\t02.02\t6\n12/09/2026\t02.02\t7";

function colar(texto = BLOCO_3_LINHAS) {
  fireEvent.change(screen.getByLabelText("Texto colado do Excel"), { target: { value: texto } });
  fireEvent.click(screen.getByRole("button", { name: "Conferir" }));
}

beforeEach(() => {
  conferirColagem.mockReset();
  gravarColagem.mockReset();
  toastErro.mockReset();
  toastSucesso.mockReset();
});
afterEach(cleanup);

describe("ColarLancamentos", () => {
  it("cola 3 linhas, confere no banco e mostra o erro de uma delas (Gravar desabilitado)", async () => {
    conferirColagem.mockResolvedValue({
      ok: true,
      resultado: { gravadas: 0, validas: 2, erros: [{ linha: 2, erro: "Já existe lançamento para 11/09/2026", excesso: false }] },
    });

    render(
      <ColarLancamentos aberto onAbertoChange={vi.fn()} contratoId={CONTRATO} tipoLocalizacao="texto" servicos={[SERVICO]} onGravado={vi.fn()} />,
    );

    colar();

    await waitFor(() => expect(conferirColagem).toHaveBeenCalledTimes(1));
    expect(conferirColagem).toHaveBeenCalledWith(CONTRATO, [
      { linha: 1, data: "2026-09-10", itemId: ITEM, quantidade: "5", kmInicial: null, kmFinal: null, estaca: null, observacao: null, motivoExcesso: null },
      { linha: 2, data: "2026-09-11", itemId: ITEM, quantidade: "6", kmInicial: null, kmFinal: null, estaca: null, observacao: null, motivoExcesso: null },
      { linha: 3, data: "2026-09-12", itemId: ITEM, quantidade: "7", kmInicial: null, kmFinal: null, estaca: null, observacao: null, motivoExcesso: null },
    ]);

    expect(await screen.findByText("Já existe lançamento para 11/09/2026")).toBeTruthy();
    expect(screen.getAllByRole("row")).toHaveLength(4); // cabeçalho + 3 linhas
    expect(screen.getByRole("button", { name: /Gravar 3 linhas/ })).toBeDisabled();
  });

  it("excesso: pede o motivo na linha, e só libera Gravar depois de preenchido", async () => {
    conferirColagem.mockResolvedValue({
      ok: true,
      resultado: {
        gravadas: 0,
        validas: 3,
        erros: [{ linha: 2, erro: "O acumulado passa do previsto", excesso: true }],
      },
    });
    gravarColagem.mockResolvedValue({ ok: true, resultado: { gravadas: 3, validas: 3, erros: [] } });

    const onAbertoChange = vi.fn();
    const onGravado = vi.fn();
    render(
      <ColarLancamentos aberto onAbertoChange={onAbertoChange} contratoId={CONTRATO} tipoLocalizacao="texto" servicos={[SERVICO]} onGravado={onGravado} />,
    );

    colar();
    await waitFor(() => expect(conferirColagem).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("O acumulado passa do previsto")).toBeTruthy();

    const gravarBotao = screen.getByRole("button", { name: /Gravar 3 linhas/ });
    expect(gravarBotao).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Motivo do excesso da linha 2"), { target: { value: "Chuva atrasou o cronograma" } });
    expect(gravarBotao).not.toBeDisabled();

    fireEvent.click(gravarBotao);

    await waitFor(() => expect(gravarColagem).toHaveBeenCalledTimes(1));
    const linhasEnviadas = gravarColagem.mock.calls[0][1];
    expect(linhasEnviadas[1]).toMatchObject({ linha: 2, motivoExcesso: "Chuva atrasou o cronograma" });
    expect(linhasEnviadas[0].motivoExcesso).toBeNull();

    await waitFor(() => expect(toastSucesso).toHaveBeenCalled());
    expect(onAbertoChange).toHaveBeenCalledWith(false);
    expect(onGravado).toHaveBeenCalled();
  });

  it('"Aplicar a todas" preenche o motivo de todas as linhas assinaladas com excesso', async () => {
    conferirColagem.mockResolvedValue({
      ok: true,
      resultado: {
        gravadas: 0,
        validas: 3,
        erros: [
          { linha: 1, erro: "O acumulado passa do previsto", excesso: true },
          { linha: 3, erro: "O acumulado passa do previsto", excesso: true },
        ],
      },
    });

    render(
      <ColarLancamentos aberto onAbertoChange={vi.fn()} contratoId={CONTRATO} tipoLocalizacao="texto" servicos={[SERVICO]} onGravado={vi.fn()} />,
    );

    colar();
    await screen.findByLabelText("Motivo do excesso da linha 1");

    fireEvent.change(screen.getByLabelText("Motivo do excesso para todas as linhas assinaladas"), {
      target: { value: "Motivo comum a todas" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar a todas" }));

    expect((screen.getByLabelText("Motivo do excesso da linha 1") as HTMLInputElement).value).toBe("Motivo comum a todas");
    expect((screen.getByLabelText("Motivo do excesso da linha 3") as HTMLInputElement).value).toBe("Motivo comum a todas");
  });

  it("gravar com erro novo do banco (corrida): a prévia atualiza, sem fechar o diálogo", async () => {
    conferirColagem.mockResolvedValue({ ok: true, resultado: { gravadas: 0, validas: 3, erros: [] } });
    gravarColagem.mockResolvedValue({
      ok: true,
      resultado: { gravadas: 0, validas: 2, erros: [{ linha: 3, erro: "Não há medição aberta para 12/09/2026", excesso: false }] },
    });
    const onAbertoChange = vi.fn();

    render(
      <ColarLancamentos aberto onAbertoChange={onAbertoChange} contratoId={CONTRATO} tipoLocalizacao="texto" servicos={[SERVICO]} onGravado={vi.fn()} />,
    );

    colar();
    await waitFor(() => expect(conferirColagem).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /Gravar 3 linhas/ }));

    await waitFor(() => expect(gravarColagem).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Não há medição aberta para 12/09/2026")).toBeTruthy();
    expect(onAbertoChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole("button", { name: /Gravar 3 linhas/ })).toBeDisabled();
  });

  it("bloco só com erro local (código inexistente): não chama o banco", async () => {
    render(
      <ColarLancamentos aberto onAbertoChange={vi.fn()} contratoId={CONTRATO} tipoLocalizacao="texto" servicos={[SERVICO]} onGravado={vi.fn()} />,
    );

    colar("10/09/2026\t99.99\t5");

    expect(await screen.findByText(/99\.99/)).toBeTruthy();
    expect(conferirColagem).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Gravar 0 linhas/ })).toBeDisabled();
  });

  it("falha ao conferir (infra): volta para o texto colado em vez de sugerir 'sem erro'", async () => {
    conferirColagem.mockResolvedValue({ erro: "Não foi possível conferir a colagem. Tente novamente" });

    render(
      <ColarLancamentos aberto onAbertoChange={vi.fn()} contratoId={CONTRATO} tipoLocalizacao="texto" servicos={[SERVICO]} onGravado={vi.fn()} />,
    );

    colar();

    await waitFor(() => expect(toastErro).toHaveBeenCalledWith("Não foi possível conferir a colagem. Tente novamente"));
    // Voltou para a área de colar (a prévia com "sem erro" seria enganosa: o banco nunca confirmou).
    expect(screen.getByLabelText("Texto colado do Excel")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Gravar/ })).toBeNull();
  });
});
