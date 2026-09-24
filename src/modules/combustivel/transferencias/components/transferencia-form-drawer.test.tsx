import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { TransferenciaLinha } from "@/modules/combustivel/transferencias/queries";

/**
 * O preenchimento do valor, como o useEffect do TransferenciaForm da origem: na
 * criação, litros x preço médio da origem sobrescreve o campo sempre que os
 * litros (ou o preço) mudam; na edição o salvo fica, e só vai para o banco se a
 * pessoa mexer no campo. E as travas da tela: estoque, espaço e mistura.
 */

vi.mock("@/components/canonicos", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/components/canonicos")>();
  return {
    ...real,
    // Select nativo no lugar do Combobox: o teste é da regra, não da lista virtualizada.
    Combobox: (props: {
      id?: string;
      valor: string;
      onValorChange: (valor: string) => void;
      opcoes: { valor: string; rotulo: string }[];
      disabled?: boolean;
    }) => (
      <select
        id={props.id}
        value={props.valor}
        disabled={props.disabled}
        onChange={(evento) => props.onValorChange(evento.target.value)}
      >
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

vi.mock("@/components/canonicos/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/modules/combustivel/transferencias/actions", () => ({
  consultarEstoqueTransferencia: vi.fn(),
  consultarPrecoMedioTanque: vi.fn(),
  consultarCombustivelNaData: vi.fn(),
  salvarTransferencia: vi.fn(),
}));

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
const C = "55555555-5555-4555-8555-555555555555";
const ID = "33333333-3333-4333-8333-333333333333";

const TANQUES: TanqueOpcao[] = [
  { id: A, nome: "Tanque Base", nivel: 5000, capacidade: 10000, combustivelId: "diesel", combustivelNome: "Diesel S10" },
  { id: B, nome: "Comboio 01", nivel: 0, capacidade: 10000, combustivelId: null, combustivelNome: null },
  { id: C, nome: "Comboio 02", nivel: 300, capacidade: 10000, combustivelId: "s500", combustivelNome: "Diesel S500" },
];

function transferencia(troca: Partial<TransferenciaLinha> = {}): TransferenciaLinha {
  return {
    id: ID,
    dataHora: "2026-09-23T19:30:00Z",
    origemId: A,
    origemNome: "Tanque Base",
    destinoId: B,
    destinoNome: "Comboio 01",
    insumoId: null,
    insumoNome: "Diesel S10",
    litros: 100,
    valorTotal: 500,
    observacoes: null,
    origem: "manual",
    excluidoEm: null,
    motivoExclusao: null,
    ...troca,
  };
}

const campoLitros = () => screen.getByLabelText(/Quantidade \(litros\)/) as HTMLInputElement;
const campoValor = () => screen.getByLabelText(/Valor total/) as HTMLInputElement;

function escolher(rotulo: RegExp, valor: string) {
  fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
}

beforeEach(() => {
  vi.mocked(consultarEstoqueTransferencia).mockResolvedValue({ ok: true, litros: 5000 });
  vi.mocked(consultarPrecoMedioTanque).mockResolvedValue({ ok: true, preco: 6.3947 });
  vi.mocked(consultarCombustivelNaData).mockResolvedValue({ ok: true, nome: "Diesel S10" });
  vi.mocked(salvarTransferencia).mockResolvedValue({ ok: true, id: "99999999-9999-4999-8999-999999999999" });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("valor total na criação", () => {
  it("preenche litros x preço médio (4 casas) e sobrescreve o digitado quando os litros mudam", async () => {
    render(<TransferenciaFormDrawer aberto onAbertoChange={vi.fn()} tanques={TANQUES} />);

    escolher(/Tanque de origem/, A);
    fireEvent.change(campoLitros(), { target: { value: "100" } });
    await waitFor(() => expect(campoValor().value).toBe("639,47"));
    expect(consultarPrecoMedioTanque).toHaveBeenCalledWith(A);
    expect(screen.getByText(/Preço médio do tanque de origem: R\$ 6,3947\/L/)).toBeInTheDocument();

    // A pessoa digita outro valor: fica, até os litros mudarem (o useEffect da origem).
    fireEvent.change(campoValor(), { target: { value: "700" } });
    expect(campoValor().value).toBe("700,00");
    fireEvent.change(campoLitros(), { target: { value: "200" } });
    await waitFor(() => expect(campoValor().value).toBe("1.278,94"));

    escolher(/Tanque de destino/, B);
    const botao = await screen.findByRole("button", { name: "Lançar transferência" });
    await waitFor(() => expect(botao).toBeEnabled());
    fireEvent.click(botao);
    await waitFor(() => expect(salvarTransferencia).toHaveBeenCalledTimes(1));
    expect(vi.mocked(salvarTransferencia).mock.calls[0]).toEqual([
      null,
      expect.objectContaining({ origemId: A, destinoId: B, litros: 200, valorTotal: 1278.94 }),
    ]);
  });

  it("preço médio zero não preenche (fica o zero inicial da origem)", async () => {
    vi.mocked(consultarPrecoMedioTanque).mockResolvedValue({ ok: true, preco: 0 });
    render(<TransferenciaFormDrawer aberto onAbertoChange={vi.fn()} tanques={TANQUES} />);
    escolher(/Tanque de origem/, A);
    fireEvent.change(campoLitros(), { target: { value: "100" } });
    await waitFor(() => expect(consultarPrecoMedioTanque).toHaveBeenCalled());
    expect(campoValor().value).toBe("0,00");
  });
});

describe("valor total na edição", () => {
  it("mudar os litros não recalcula, e sem mexer no valor vai null (o banco mantém o salvo)", async () => {
    render(<TransferenciaFormDrawer aberto onAbertoChange={vi.fn()} tanques={TANQUES} transferencia={transferencia()} />);
    expect(campoValor().value).toBe("500,00");

    fireEvent.change(campoLitros(), { target: { value: "200" } });
    await waitFor(() => expect(consultarPrecoMedioTanque).toHaveBeenCalledWith(A));
    expect(campoValor().value).toBe("500,00");

    const botao = screen.getByRole("button", { name: "Salvar transferência" });
    await waitFor(() => expect(botao).toBeEnabled());
    fireEvent.click(botao);
    await waitFor(() => expect(salvarTransferencia).toHaveBeenCalledTimes(1));
    expect(vi.mocked(salvarTransferencia).mock.calls[0]).toEqual([
      ID,
      expect.objectContaining({ litros: 200, valorTotal: null }),
    ]);
  });

  it("valor digitado na edição vai para o banco", async () => {
    render(<TransferenciaFormDrawer aberto onAbertoChange={vi.fn()} tanques={TANQUES} transferencia={transferencia()} />);
    fireEvent.change(campoValor(), { target: { value: "750,1234" } });

    const botao = screen.getByRole("button", { name: "Salvar transferência" });
    await waitFor(() => expect(botao).toBeEnabled());
    fireEvent.click(botao);
    await waitFor(() => expect(salvarTransferencia).toHaveBeenCalledTimes(1));
    expect(vi.mocked(salvarTransferencia).mock.calls[0]?.[1]).toMatchObject({ valorTotal: 750.1234 });
  });
});

describe("travas da tela", () => {
  it("litros acima do estoque da origem na data bloqueia", async () => {
    vi.mocked(consultarEstoqueTransferencia).mockResolvedValue({ ok: true, litros: 50 });
    render(<TransferenciaFormDrawer aberto onAbertoChange={vi.fn()} tanques={TANQUES} />);
    escolher(/Tanque de origem/, A);
    escolher(/Tanque de destino/, B);
    fireEvent.change(campoLitros(), { target: { value: "100" } });

    expect(await screen.findByText(/Estoque insuficiente \(50,00 L disponíveis na data\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lançar transferência" })).toBeDisabled();
  });

  it("litros acima do espaço do destino na data bloqueia", async () => {
    vi.mocked(consultarEstoqueTransferencia).mockImplementation(async (tanque) =>
      tanque === B ? { ok: true, litros: 9950 } : { ok: true, litros: 5000 },
    );
    render(<TransferenciaFormDrawer aberto onAbertoChange={vi.fn()} tanques={TANQUES} />);
    escolher(/Tanque de origem/, A);
    escolher(/Tanque de destino/, B);
    fireEvent.change(campoLitros(), { target: { value: "100" } });

    expect(await screen.findByText(/Espaço insuficiente no destino \(50,00 L de espaço na data\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lançar transferência" })).toBeDisabled();
  });

  it("combustível diferente no destino com nível bloqueia; na edição só de metadados, não", async () => {
    render(<TransferenciaFormDrawer aberto onAbertoChange={vi.fn()} tanques={TANQUES} />);
    escolher(/Tanque de origem/, A);
    escolher(/Tanque de destino/, C);
    expect(
      await screen.findByText(/Combustíveis incompatíveis\. Origem tem Diesel S10 e destino tem Diesel S500/),
    ).toBeInTheDocument();
    cleanup();

    render(
      <TransferenciaFormDrawer
        aberto
        onAbertoChange={vi.fn()}
        tanques={TANQUES}
        transferencia={transferencia({ destinoId: C, destinoNome: "Comboio 02" })}
      />,
    );
    await waitFor(() => expect(consultarEstoqueTransferencia).toHaveBeenCalled());
    expect(screen.queryByText(/Combustíveis incompatíveis/)).not.toBeInTheDocument();
  });
});
