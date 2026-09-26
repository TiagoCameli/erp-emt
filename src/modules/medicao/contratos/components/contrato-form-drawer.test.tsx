import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Trava de regressão do defeito achado na revisão da Task 11: o campo de
 * dinheiro guardava `valorInicial` como NÚMERO no react-hook-form e
 * reconstruía o texto do campo a cada render com `numeroParaCampo`. Resultado:
 * digitar "12," virava "12" (a vírgula sumia) e uma tecla que `textoParaNumero`
 * não reconhecesse zerava o campo em silêncio. Este teste digita um valor com
 * milhar E centavo (o caso real do Lote 09) e confere que chega inteiro na
 * action, sem passar por arredondamento nenhum no meio do caminho.
 */

const salvarContrato = vi.fn();
const toastErro = vi.fn();
const toastSucesso = vi.fn();

vi.mock("@/modules/medicao/contratos/actions", () => ({
  salvarContrato: (...args: unknown[]) => salvarContrato(...args),
}));
vi.mock("@/components/canonicos/toast", () => ({
  toast: {
    error: (...a: unknown[]) => toastErro(...a),
    success: (...a: unknown[]) => toastSucesso(...a),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));
// O Combobox virtualizado não desenha no jsdom: aqui ele vira um <select> com as mesmas opções.
vi.mock("@/components/canonicos", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/components/canonicos")>();
  return {
    ...original,
    Combobox: ({
      id,
      valor,
      onValorChange,
      opcoes,
      ariaLabel,
    }: {
      id?: string;
      valor: string;
      onValorChange: (v: string) => void;
      opcoes: { valor: string; rotulo: string }[];
      ariaLabel?: string;
    }) => (
      <select id={id} aria-label={ariaLabel} value={valor} onChange={(e) => onValorChange(e.target.value)}>
        <option value="">-</option>
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
    ),
  };
});

import { ContratoFormDrawer } from "@/modules/medicao/contratos/components/contrato-form-drawer";

function renderizar() {
  const aoMudar = vi.fn();
  render(<ContratoFormDrawer aberto onAbertoChange={aoMudar} contrato={null} />);
  return aoMudar;
}

/**
 * Preenche os campos obrigatórios que NÃO têm valor padrão válido (código,
 * obra, objeto, número do contrato, contratante e data de assinatura). Os
 * demais (tipo do contratante, início do prazo, localização, alertas, status)
 * já nascem com um valor aceito pelo schema.
 */
function preencherObrigatorios() {
  fireEvent.change(screen.getByLabelText(/^Código/), { target: { value: "L09-BR364" } });
  fireEvent.change(screen.getByLabelText(/Nome da obra/), { target: { value: "BR-364 Lote 09" } });
  fireEvent.change(screen.getByLabelText(/^Objeto/), { target: { value: "Manutenção rodoviária" } });
  fireEvent.change(screen.getByLabelText(/Número do contrato/), { target: { value: "00615/2025" } });
  fireEvent.change(screen.getByLabelText(/^Nome\*?$/), { target: { value: "DNIT" } });
  fireEvent.change(screen.getByLabelText(/Data de assinatura/), { target: { value: "2025-10-01" } });
}

beforeEach(() => {
  salvarContrato.mockReset();
  toastErro.mockReset();
  toastSucesso.mockReset();
});
afterEach(cleanup);

describe("ContratoFormDrawer", () => {
  it("a vírgula não desaparece no meio da digitação (o defeito original)", () => {
    renderizar();
    const campoValor = screen.getByLabelText(/Valor do contrato/) as HTMLInputElement;
    // Focado: é o estado em que o InputMoeda mostra o texto CRU (sem
    // reformatar), o de quando a pessoa está digitando. Era aqui que o campo
    // reconstruía o texto a partir do NÚMERO já convertido, a cada tecla, e
    // "12," virava "12" (a vírgula sumia).
    fireEvent.focus(campoValor);
    fireEvent.change(campoValor, { target: { value: "1" } });
    expect(campoValor.value).toBe("1");
    fireEvent.change(campoValor, { target: { value: "12" } });
    expect(campoValor.value).toBe("12");
    fireEvent.change(campoValor, { target: { value: "12," } });
    expect(campoValor.value).toBe("12,");
    fireEvent.change(campoValor, { target: { value: "12,5" } });
    expect(campoValor.value).toBe("12,5");
  });

  it("digitar o valor com milhar e centavo manda o número exato para a action, sem arredondar", async () => {
    salvarContrato.mockResolvedValue({ ok: true, id: "novo-id" });
    renderizar();
    preencherObrigatorios();

    fireEvent.change(screen.getByLabelText(/Valor do contrato/), { target: { value: "243.927.498,02" } });
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar contrato" }));

    await waitFor(() => expect(salvarContrato).toHaveBeenCalledTimes(1));
    expect(salvarContrato.mock.calls[0][0]).toBeNull();
    expect(salvarContrato.mock.calls[0][1]).toMatchObject({ valorInicial: 243927498.02 });
    await waitFor(() => expect(toastSucesso).toHaveBeenCalled());
  });

  it("digitar '12,50' manda 12.5 exato (o centavo não desaparece)", async () => {
    salvarContrato.mockResolvedValue({ ok: true, id: "novo-id" });
    renderizar();
    preencherObrigatorios();

    fireEvent.change(screen.getByLabelText(/Valor do contrato/), { target: { value: "12,50" } });
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar contrato" }));

    await waitFor(() => expect(salvarContrato).toHaveBeenCalledTimes(1));
    expect(salvarContrato.mock.calls[0][1]).toMatchObject({ valorInicial: 12.5 });
  });

  it("valor vazio não zera em silêncio: recusa o envio e avisa 'Informe o valor'", async () => {
    renderizar();
    preencherObrigatorios();
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar contrato" }));

    await waitFor(() => expect(toastErro).toHaveBeenCalled());
    expect(salvarContrato).not.toHaveBeenCalled();
    expect(String(toastErro.mock.calls[0][0])).toContain("Informe o valor");
  });
});
