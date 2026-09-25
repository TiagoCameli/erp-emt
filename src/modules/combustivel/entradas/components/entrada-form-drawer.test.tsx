import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { EntradaFormDrawer } from "@/modules/combustivel/entradas/components/entrada-form-drawer";
import type { EntradaLinha, TanqueOpcao } from "@/modules/combustivel/entradas/queries";

/**
 * O formulário da entrada como o EntradaForm da origem: valor UNITÁRIO digitado, total =
 * quantidade × unitário, e na edição o unitário vem de valor ÷ quantidade.
 */

vi.mock("@/modules/combustivel/entradas/actions", () => ({
  salvarEntrada: vi.fn(),
}));

afterEach(cleanup);

const TANQUE = "11111111-1111-4111-8111-111111111111";
const DIESEL = "22222222-2222-4222-8222-222222222222";
const GASOLINA = "55555555-5555-4555-8555-555555555555";

const tanque: TanqueOpcao = {
  id: TANQUE,
  rotulo: "Tanque 1",
  ehExterno: false,
  ativo: true,
  capacidadeLitros: 15000,
  nivelAtualLitros: 12000,
  combustivelAtualId: DIESEL,
  proprietarioId: null,
  proprietarioNome: null,
  proprietarioTaxaLitro: null,
};

const insumos = [
  { id: DIESEL, nome: "Diesel S10", unidade: "L", litrosPorUnidade: null, ativo: true },
  { id: GASOLINA, nome: "Gasolina", unidade: "L", litrosPorUnidade: null, ativo: true },
];

function entrada(troca: Partial<EntradaLinha> = {}): EntradaLinha {
  return {
    id: "77777777-7777-4777-8777-777777777777",
    dataHora: "2026-09-20T19:30:00Z",
    tanqueId: TANQUE,
    tanqueNome: "Tanque 1",
    insumoId: DIESEL,
    insumoNome: "Diesel S10",
    unidade: "L",
    quantidade: 1000,
    litros: 1000,
    valorTotal: 6394.7,
    precoLitro: 6.3947,
    fornecedorId: "33333333-3333-4333-8333-333333333333",
    fornecedorNome: "Distribuidora",
    notaFiscal: "123",
    observacoes: null,
    origem: "manual",
    excluidoEm: null,
    motivoExclusao: null,
    anexos: 0,
    ...troca,
  };
}

describe("EntradaFormDrawer", () => {
  it("na edição, o valor unitário vem de valor ÷ quantidade e o total é quantidade × unitário", () => {
    render(
      <EntradaFormDrawer aberto onAbertoChange={() => {}} entrada={entrada()} tanques={[tanque]} insumos={insumos} fornecedores={[]} />,
    );
    expect((screen.getByLabelText(/Valor unitário/) as HTMLInputElement).value).toBe("6,3947");
    expect(screen.getByTestId("entrada-valor-total").textContent).toMatch(/6\.394,70/);
    // Fornecedor é obrigatório (a origem exige).
    expect(screen.getByText((_, el) => el?.tagName === "LABEL" && el.textContent === "Fornecedor*")).toBeTruthy();
  });

  it("espaço livre devolve a própria entrada na edição do mesmo tanque", () => {
    render(
      <EntradaFormDrawer aberto onAbertoChange={() => {}} entrada={entrada()} tanques={[tanque]} insumos={insumos} fornecedores={[]} />,
    );
    // 15.000 - 12.000 + 1.000 da própria entrada.
    expect(screen.getByText(/Espaço livre: 4\.000,00 L/)).toBeTruthy();
  });

  it("outro combustível no tanque com nível trava o botão", () => {
    render(
      <EntradaFormDrawer
        aberto
        onAbertoChange={() => {}}
        entrada={entrada({ insumoId: GASOLINA, insumoNome: "Gasolina" })}
        tanques={[tanque]}
        insumos={insumos}
        fornecedores={[]}
      />,
    );
    expect(screen.getByText(/Este tanque já contém Diesel S10/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Salvar entrada" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
