import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

/**
 * Revisões da medição: a lista REV00..REVnn (fase, status, motivo) e a comparação item a item de
 * duas revisões escolhidas, com a quantidade congelada de cada uma e a diferença. Item que não está
 * numa das revisões conta 0 nela; revisão em aberto ainda não tem quantidade congelada.
 */

vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

import { instalarLayoutDeLista } from "@/components/canonicos/combobox-jsdom-teste";
import { limparEstadosTabelaParaTeste } from "@/components/canonicos/data-table";
import { RevisoesMedicao } from "@/modules/medicao/medicoes/components/revisoes-medicao";

const REV0 = { id: "r0", numero: 0, fase: "antes_aprovacao", status: "substituida", motivo: null, criadoEm: "2026-02-01T10:00:00Z" };
const REV1 = { id: "r1", numero: 1, fase: "antes_aprovacao", status: "substituida", motivo: "DNIT devolveu", criadoEm: "2026-03-05T10:00:00Z" };
const REV2 = { id: "r2", numero: 2, fase: "pos_aprovacao", status: "enviada", motivo: "Conferência do fiscal", criadoEm: "2026-04-01T10:00:00Z" };
const REV3 = { id: "r3", numero: 3, fase: "pos_aprovacao", status: "em_aberto", motivo: "Mais um ajuste", criadoEm: "2026-04-10T10:00:00Z" };

const ROTULOS = [
  { itemId: "i1", codigo: "01.01", descricao: "CBUQ", unidade: "t" },
  { itemId: "i2", codigo: "01.02", descricao: "Pintura de ligação", unidade: "m²" },
];
const CONGELADOS = [
  { revisaoId: "r0", itemId: "i1", quantidade: "28.0000" },
  { revisaoId: "r1", itemId: "i1", quantidade: "29.0000" },
  { revisaoId: "r1", itemId: "i2", quantidade: "2.0000" },
  { revisaoId: "r2", itemId: "i1", quantidade: "30.0000" },
];

beforeAll(() => instalarLayoutDeLista());
afterEach(cleanup);
afterEach(limparEstadosTabelaParaTeste);

const linhaDe = (descricao: string) => screen.getByText(descricao).closest("tr") as HTMLElement;

describe("RevisoesMedicao", () => {
  it("lista as revisões com fase, status e motivo", () => {
    render(<RevisoesMedicao revisoes={[REV0, REV1]} congelados={CONGELADOS} rotulos={ROTULOS} />);
    const lista = screen.getByTestId("revisoes-lista");
    expect(within(lista).getByText("REV00")).toBeTruthy();
    expect(within(lista).getByText("REV01")).toBeTruthy();
    expect(within(lista).getByText("DNIT devolveu")).toBeTruthy();
    expect(within(lista).getAllByText("Substituída").length).toBeGreaterThan(0);
    expect(within(lista).getAllByText("Antes da aprovação").length).toBeGreaterThan(0);
  });

  it("compara as duas últimas revisões congeladas, item a item, com a diferença", () => {
    render(<RevisoesMedicao revisoes={[REV0, REV1, REV2, REV3]} congelados={CONGELADOS} rotulos={ROTULOS} />);
    const comparacao = screen.getByTestId("revisoes-comparacao");
    expect(within(comparacao).getByRole("columnheader", { name: "REV01" })).toBeTruthy();
    expect(within(comparacao).getByRole("columnheader", { name: "REV02" })).toBeTruthy();
    const cbuq = within(comparacao).getByText("CBUQ").closest("tr") as HTMLElement;
    expect(within(cbuq).getByText("29")).toBeTruthy();
    expect(within(cbuq).getByText("30")).toBeTruthy();
    expect(within(cbuq).getByText("+1")).toBeTruthy();
    // 01.02 só existe na REV01: conta 0 na REV02, diferença -2.
    const pintura = within(comparacao).getByText("Pintura de ligação").closest("tr") as HTMLElement;
    expect(within(pintura).getByText("0")).toBeTruthy();
    expect(within(pintura).getByText("-2")).toBeTruthy();
  });

  it("trocar a revisão de origem refaz a comparação", () => {
    render(<RevisoesMedicao revisoes={[REV0, REV1, REV2]} congelados={CONGELADOS} rotulos={ROTULOS} />);
    fireEvent.click(screen.getByRole("combobox", { name: "Comparar" }));
    fireEvent.click(screen.getByRole("option", { name: /REV00/ }));
    const comparacao = screen.getByTestId("revisoes-comparacao");
    expect(within(comparacao).getByRole("columnheader", { name: "REV00" })).toBeTruthy();
    const cbuq = linhaDe("CBUQ");
    expect(within(cbuq).getByText("28")).toBeTruthy();
    expect(within(cbuq).getByText("+2")).toBeTruthy();
  });

  it("a revisão escolhida num lado não aparece como opção do outro", () => {
    render(<RevisoesMedicao revisoes={[REV0, REV1, REV2]} congelados={CONGELADOS} rotulos={ROTULOS} />);
    fireEvent.click(screen.getByRole("combobox", { name: "Comparar" }));
    expect(screen.queryByRole("option", { name: /REV02/ })).toBeNull();
    expect(screen.getByRole("option", { name: /REV00/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /REV01/ })).toBeTruthy();
  });

  it("depois do refresh com uma revisão nova enviada, passa a comparar as duas últimas", () => {
    const { rerender } = render(<RevisoesMedicao revisoes={[REV0, REV1, { ...REV2, status: "em_aberto" }]} congelados={CONGELADOS.slice(0, 3)} rotulos={ROTULOS} />);
    expect(within(screen.getByTestId("revisoes-comparacao")).getByRole("columnheader", { name: "REV00" })).toBeTruthy();
    rerender(<RevisoesMedicao revisoes={[REV0, REV1, REV2]} congelados={CONGELADOS} rotulos={ROTULOS} />);
    const comparacao = screen.getByTestId("revisoes-comparacao");
    expect(within(comparacao).getByRole("columnheader", { name: "REV01" })).toBeTruthy();
    expect(within(comparacao).getByRole("columnheader", { name: "REV02" })).toBeTruthy();
  });

  it("medição de carga (aprovada sem quantidade congelada): explica que não há o que comparar", () => {
    render(
      <RevisoesMedicao
        revisoes={[{ ...REV0, status: "aprovada" }, { ...REV1, status: "substituida" }]}
        congelados={[]}
        rotulos={ROTULOS}
      />,
    );
    expect(screen.getByText("Medição carregada da planilha: sem quantidades congeladas para comparar")).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Comparar" })).toBeNull();
  });

  it("com menos de duas revisões enviadas, explica que não há o que comparar", () => {
    render(<RevisoesMedicao revisoes={[{ ...REV0, status: "enviada" }, REV3]} congelados={CONGELADOS} rotulos={ROTULOS} />);
    expect(screen.getByText("A comparação precisa de duas revisões enviadas")).toBeTruthy();
  });
});
