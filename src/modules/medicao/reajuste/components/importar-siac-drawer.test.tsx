import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Importar o relatório SIAC: o PDF anexado à medição é lido no servidor (`lerPdfSiac`) e a prévia
 * vem da RPC. Toda troca de item ou de destino chama `previaReajuste` com as escolhas novas e a tela
 * redesenha com a resposta (nenhuma conta aqui). Gravar fica desabilitado com pendência e pede
 * confirmação com o total do DNIT. A recusa do banco aparece como veio.
 */

const lerPdfSiac = vi.fn();
const previaReajuste = vi.fn();
const gravarReajuste = vi.fn();
const toastErro = vi.fn();
const toastSucesso = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/medicao/medicoes/m1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));
const anexosDoDocumento = vi.fn<(...a: unknown[]) => Promise<unknown[]>>(async () => []);

vi.mock("@/modules/_shared/anexos/actions", () => ({
  anexosDoDocumento: (...a: unknown[]) => anexosDoDocumento(...a),
  removerAnexo: vi.fn(async () => ({ ok: true })),
  urlDoAnexo: vi.fn(async () => ({ url: "https://exemplo/arquivo" })),
}));
vi.mock("@/modules/_shared/anexos/enviar-do-navegador", () => ({
  enviarAnexoDoNavegador: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/modules/medicao/reajuste/actions", () => ({
  lerPdfSiac: (...a: unknown[]) => lerPdfSiac(...a),
  previaReajuste: (...a: unknown[]) => previaReajuste(...a),
  gravarReajuste: (...a: unknown[]) => gravarReajuste(...a),
}));
vi.mock("@/components/canonicos/toast", () => ({
  toast: { error: (...a: unknown[]) => toastErro(...a), success: (...a: unknown[]) => toastSucesso(...a), warning: vi.fn(), info: vi.fn() },
}));

import { instalarLayoutDeLista } from "@/components/canonicos/combobox-jsdom-teste";
import { limparEstadosTabelaParaTeste } from "@/components/canonicos/data-table";
import { ImportarSiacDrawer } from "@/modules/medicao/reajuste/components/importar-siac-drawer";
import {
  anexo,
  ARQUIVO,
  CHAVE_CAP,
  CHAVE_IMPRIMACAO,
  CHAVE_PENDENTE,
  I_A,
  I_B,
  I_CAP,
  I_IMPRIMACAO,
  LEITURA,
  MEDICAO,
  PREVIA_COM_PENDENCIA,
  PREVIA_OK,
} from "@/modules/medicao/reajuste/components/__fixtures__/tela";

beforeAll(() => instalarLayoutDeLista());
beforeEach(() => {
  anexosDoDocumento.mockReset();
  anexosDoDocumento.mockResolvedValue([]);
  lerPdfSiac.mockReset();
  previaReajuste.mockReset();
  gravarReajuste.mockReset();
  toastErro.mockReset();
  toastSucesso.mockReset();
});
afterEach(cleanup);
afterEach(limparEstadosTabelaParaTeste);
afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia;
});

/** O `useTelaCelular` lê `matchMedia`, que o jsdom não tem: aqui a tela é de celular. */
function comoCelular() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (consulta: string) => ({ matches: true, media: consulta, addEventListener: () => {}, removeEventListener: () => {} }),
  });
}

const texto = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

function renderizar(onGravado = vi.fn(), onAbertoChange = vi.fn()) {
  render(
    <ImportarSiacDrawer
      aberto
      onAbertoChange={onAbertoChange}
      medicaoId={MEDICAO}
      numero={4}
      anexos={[anexo(ARQUIVO, "siac-4a.pdf")]}
      pendentes={[{ arquivoId: ARQUIVO, nome: "siac-4a.pdf", criadoEm: "2026-10-02T12:00:00Z" }]}
      arquivosEmRelatorio={[]}
      onGravado={onGravado}
    />,
  );
  return { onGravado, onAbertoChange };
}

function linhaDa(codigo: string): HTMLElement {
  const linha = Array.from(document.body.querySelectorAll("tbody tr")).find(
    (tr) => texto(tr.querySelector('[data-coluna="codigo"]')) === codigo,
  );
  if (!linha) throw new Error(`linha ${codigo} não achada`);
  return linha as HTMLElement;
}

async function lerComPrevia(previa = PREVIA_COM_PENDENCIA) {
  lerPdfSiac.mockResolvedValue({ ...LEITURA, previa });
  const r = renderizar();
  fireEvent.click(screen.getByRole("button", { name: "Ler siac-4a.pdf" }));
  await waitFor(() => expect(lerPdfSiac).toHaveBeenCalledWith(MEDICAO, ARQUIVO));
  await screen.findAllByText("60112");
  return r;
}

describe("ImportarSiacDrawer", () => {
  it("passo 1: o PDF pendente tem o botão Ler e o convite do anexo é o do SIAC", () => {
    renderizar();
    expect(screen.getByText("Arraste o PDF do Resumo da Medição do SIAC")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ler siac-4a.pdf" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Gravar reajuste/ })).toBeNull();
  });

  it("ao subir um PDF novo, ele é lido na hora", async () => {
    const NOVO = "55555555-5555-4555-8555-555555555555";
    anexosDoDocumento.mockResolvedValue([anexo(ARQUIVO, "siac-4a.pdf"), anexo(NOVO, "siac-4a-definitivo.pdf")]);
    lerPdfSiac.mockResolvedValue({ ...LEITURA, previa: PREVIA_OK });
    renderizar();
    const input = document.body.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toBe("application/pdf");
    const arquivo = new File(["%PDF-1.7"], "siac-4a-definitivo.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [arquivo] } });
    await waitFor(() => expect(lerPdfSiac).toHaveBeenCalledWith(MEDICAO, NOVO));
    expect(await screen.findByText("Cimento asfáltico CAP 50/70")).toBeTruthy();
  });

  it("prévia: cabeçalho lido, aviso, Conferir na 2,2/51269 e o rateio 1,26 no 02.07.05", async () => {
    await lerComPrevia();
    const corpo = texto(document.body);
    expect(corpo).toContain("24 00615/2025 - CONSÓRCIO EMT-COLORADO I");
    expect(corpo).toContain("4ª PROVISÓRIA");
    expect(corpo).toContain("01/02/2026 a 28/02/2026");
    expect(corpo).toContain("01/2025");
    expect(corpo).toContain("19/03/2026");
    expect(corpo).toContain("O relatório é do período 01/02/2026 a 28/02/2026 e a medição de 01/03/2026 a 31/03/2026");

    const imprimacao = linhaDa("51269");
    expect(texto(imprimacao.querySelector('[data-coluna="origem"]'))).toBe("Conferir");
    expect(texto(imprimacao.querySelector('[data-coluna="rateio"]'))).toBe("02.07.05 · R$ 1,26");
    expect(texto(imprimacao.querySelector('[data-coluna="itens"]'))).toContain("02.07.05");

    const cap = linhaDa("60112");
    expect(texto(cap.querySelector('[data-coluna="origem"]'))).toBe("Salvo");
    expect(texto(cap.querySelector('[data-coluna="valor_pi"]'))).toContain("539.026,36");
    expect(texto(cap.querySelector('[data-coluna="valor_nosso"]'))).toContain("539.028,27");
    expect(texto(linhaDa("222").querySelector('[data-coluna="origem"]'))).toBe("Sugerido");
  });

  it("tirar um item da linha chama previaReajuste com a escolha nova e redesenha com a resposta", async () => {
    await lerComPrevia();
    previaReajuste.mockResolvedValue({ ok: true, previa: PREVIA_OK });
    fireEvent.click(within(linhaDa("60112")).getByRole("button", { name: "Tirar 04.03.02 da linha 4,0 60112" }));
    await waitFor(() =>
      expect(previaReajuste).toHaveBeenCalledWith(MEDICAO, ARQUIVO, {
        [CHAVE_IMPRIMACAO]: { itens: [I_IMPRIMACAO], destino: null },
        [CHAVE_CAP]: { itens: [], destino: null },
        [CHAVE_PENDENTE]: { itens: [I_A, I_B], destino: null },
      }),
    );
    await waitFor(() => expect(texto(linhaDa("222").querySelector('[data-coluna="rateio"]'))).toBe("01.04 · R$ -5,00"));
  });

  it("casar um item pelo Combobox dos candidatos manda o item novo", async () => {
    await lerComPrevia();
    previaReajuste.mockResolvedValue({ ok: true, previa: PREVIA_COM_PENDENCIA });
    fireEvent.click(within(linhaDa("51269")).getByRole("combobox", { name: "Casar item com a linha 2,2 51269" }));
    fireEvent.click(screen.getByRole("option", { name: /04\.03\.02 · CAP 50\/70 · t · R\$ 5\.641,71/ }));
    await waitFor(() =>
      expect(previaReajuste).toHaveBeenCalledWith(MEDICAO, ARQUIVO, expect.objectContaining({ [CHAVE_IMPRIMACAO]: { itens: [I_IMPRIMACAO, I_CAP], destino: null } })),
    );
  });

  it("pendência: escolher o destino chama previaReajuste com ele", async () => {
    await lerComPrevia();
    previaReajuste.mockResolvedValue({ ok: true, previa: PREVIA_OK });
    const pendente = linhaDa("222");
    expect(texto(pendente)).toContain("escolha o item que recebe a linha");
    fireEvent.click(within(pendente).getByRole("combobox", { name: "Item que recebe a linha 1,0 222" }));
    fireEvent.click(screen.getByRole("option", { name: /01\.04/ }));
    await waitFor(() =>
      expect(previaReajuste).toHaveBeenCalledWith(MEDICAO, ARQUIVO, expect.objectContaining({ [CHAVE_PENDENTE]: { itens: [I_A, I_B], destino: I_B } })),
    );
  });

  it("com pendência o Gravar fica desabilitado", async () => {
    await lerComPrevia();
    expect(screen.getByRole("button", { name: "Gravar reajuste" })).toBeDisabled();
    expect(texto(document.body)).toContain("1 linha pendente");
  });

  it("sem pendência: Gravar pede confirmação com o total do DNIT e grava", async () => {
    const { onGravado, onAbertoChange } = await lerComPrevia(PREVIA_OK);
    expect(texto(document.body)).toContain("R$ 2,99 a receber");
    gravarReajuste.mockResolvedValue({ ok: true, relatorioId: "r9", previa: PREVIA_OK });
    fireEvent.click(screen.getByRole("button", { name: "Gravar reajuste" }));
    expect(await screen.findByText("Gravar o reajuste de R$ -40.021,28 (índices definitivos) na 4ª medição?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Gravar" }));
    await waitFor(() => expect(gravarReajuste).toHaveBeenCalledWith(MEDICAO, ARQUIVO, LEITURA.escolhas));
    await waitFor(() => expect(toastSucesso).toHaveBeenCalledWith("Reajuste gravado na 4ª medição"));
    expect(onGravado).toHaveBeenCalled();
    expect(onAbertoChange).toHaveBeenCalledWith(false);
  });

  it("prévia recusada: a linha volta ao selo da última prévia boa (não fica Escolhido)", async () => {
    await lerComPrevia();
    previaReajuste.mockResolvedValue({ erro: "4,0 60112: item casado que não é serviço deste contrato" });
    fireEvent.click(within(linhaDa("60112")).getByRole("button", { name: "Tirar 04.03.02 da linha 4,0 60112" }));
    expect(await screen.findByText("4,0 60112: item casado que não é serviço deste contrato")).toBeTruthy();
    expect(texto(linhaDa("60112").querySelector('[data-coluna="origem"]'))).toBe("Salvo");
  });

  it("enquanto a prévia está no ar, Ler e o envio de PDF ficam desabilitados", async () => {
    await lerComPrevia();
    let responder: (v: unknown) => void = () => {};
    previaReajuste.mockReturnValue(new Promise((r) => (responder = r)));
    fireEvent.click(within(linhaDa("60112")).getByRole("button", { name: "Tirar 04.03.02 da linha 4,0 60112" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Ler siac-4a.pdf" })).toBeDisabled());
    expect(screen.getByRole("button", { name: /Arraste o PDF do Resumo da Medição do SIAC/ })).toBeDisabled();
    responder({ ok: true, previa: PREVIA_OK });
    await waitFor(() => expect(screen.getByRole("button", { name: "Ler siac-4a.pdf" })).not.toBeDisabled());
  });

  it("o botão de tirar item tem área de toque de 24px", async () => {
    await lerComPrevia();
    const botao = within(linhaDa("60112")).getByRole("button", { name: "Tirar 04.03.02 da linha 4,0 60112" });
    expect(botao.className).toContain("size-6");
  });

  it("no celular, casamento, itens, destino e rateio ficam no card, sem abrir Mais campos", async () => {
    comoCelular();
    await lerComPrevia();
    const card = Array.from(document.body.querySelectorAll("[data-cartao]")).find(
      (el) => texto(el).includes("51269"),
    );
    expect(card).toBeTruthy();
    const grade = texto(card!.querySelector("dl"));
    expect(grade).toContain("Conferir");
    expect(grade).toContain("02.07.05 · R$ 1,26");
    expect(grade).toContain("Itens casados");
    expect(grade).toContain("Destino");
    expect(grade).not.toContain("Unid.");
  });

  it("erro do banco na leitura aparece como veio", async () => {
    lerPdfSiac.mockResolvedValue({ erro: "O relatório é da 3ª medição e esta é a 4ª" });
    renderizar();
    fireEvent.click(screen.getByRole("button", { name: "Ler siac-4a.pdf" }));
    expect(await screen.findByText("O relatório é da 3ª medição e esta é a 4ª")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Gravar reajuste" })).toBeNull();
  });

  it("erro do banco na gravação aparece como veio e o drawer fica aberto", async () => {
    await lerComPrevia(PREVIA_OK);
    gravarReajuste.mockResolvedValue({ erro: "A 4ª medição está aberta: o reajuste entra só em medição enviada ou aprovada" });
    fireEvent.click(screen.getByRole("button", { name: "Gravar reajuste" }));
    fireEvent.click(await screen.findByRole("button", { name: "Gravar" }));
    expect(await screen.findByText("A 4ª medição está aberta: o reajuste entra só em medição enviada ou aprovada")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Gravar reajuste" })).toBeTruthy();
  });
});
