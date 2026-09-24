import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";

import { colunasFretes } from "@/modules/frete/fretes/components/fretes-tabela";
import { FreteLinhaExpandida } from "@/modules/frete/fretes/components/frete-linha-expandida";
import { frete } from "@/modules/frete/fretes/fixture-frete";
import { formatarValorOperacional } from "@/modules/manutencao/servicos/formato";

/**
 * A linha expandida da lista (FreteRowExpanded da origem): fotos da chegada, dados do
 * motorista e NFs, e o financeiro com R$/TKM (TKM = km × peso). Na transferência, o
 * aviso no lugar do valor do material.
 */

const anexosDoDocumento = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/frete/fretes",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/modules/frete/fretes/actions", () => ({
  registrarChegadaPelaFoto: vi.fn(),
  registrarChegada: vi.fn(),
  carregarDetalheFrete: vi.fn(),
  excluirFrete: vi.fn(),
  restaurarFrete: vi.fn(),
}));
vi.mock("@/modules/_shared/anexos/actions", () => ({
  anexosDoDocumento: (...args: unknown[]) => anexosDoDocumento(...args),
  removerAnexo: vi.fn(),
  urlDoAnexo: vi.fn(),
  prepararEnvioAnexo: vi.fn(),
  confirmarEnvioAnexo: vi.fn(),
}));

afterEach(() => {
  cleanup();
  anexosDoDocumento.mockReset();
});

function valorDo(rotulo: string): string {
  const dt = screen.getByText(rotulo, { selector: "dt" });
  return dt.nextElementSibling?.textContent ?? "";
}

describe("FreteLinhaExpandida", () => {
  it("frete de material: KM, R$/TKM com o TKM, valor do frete, material total e por tonelada", async () => {
    anexosDoDocumento.mockResolvedValue([]);
    render(
      <FreteLinhaExpandida
        frete={frete({ kmRodados: 120, pesoToneladas: 32.5, valorTkm: 0.37, valorTotal: 1443, valorMaterial: 2600, precoUnitario: 80 })}
        podeEditar={false}
      />,
    );
    expect(valorDo("KM rodados")).toBe("120 km");
    expect(valorDo("R$ / TKM")).toBe(`${formatarValorOperacional(0.37)} (TKM = 3.900)`);
    expect(valorDo("Valor frete")).toBe(formatarValorOperacional(1443));
    expect(valorDo("Valor material (total)")).toBe(formatarValorOperacional(2600));
    expect(valorDo("Valor material (R$/t)")).toBe(`${formatarValorOperacional(80)}/t`);
    expect(screen.queryByText(/material já era da EMT/)).toBeNull();

    // Fotos buscadas só quando a linha abre, da entidade da chegada.
    expect(anexosDoDocumento).toHaveBeenCalledWith("frete_chegada", "f1");
    expect(await screen.findByText("Pendente: carga ainda não foi confirmada na chegada.")).toBeInTheDocument();
  });

  it("transferência: aviso no lugar do valor do material", () => {
    anexosDoDocumento.mockResolvedValue([]);
    render(<FreteLinhaExpandida frete={frete({ tipo: "transferencia", valorMaterial: 0, precoUnitario: 0 })} podeEditar={false} />);
    expect(screen.getByText("Transferência: material já era da EMT")).toBeInTheDocument();
    expect(screen.queryByText("Valor material (total)")).toBeNull();
  });

  it("motorista, placa, NF; NF 2 só quando existe; chegada sem editar mostra 'sem chegada'", () => {
    anexosDoDocumento.mockResolvedValue([]);
    const { rerender } = render(<FreteLinhaExpandida frete={frete({ placaCarreta: "ABC1D23" })} podeEditar={false} />);
    expect(valorDo("Motorista")).toBe("João Silva");
    expect(valorDo("Placa")).toBe("ABC1D23");
    expect(valorDo("NF")).toBe("123");
    expect(screen.queryByText("NF 2", { selector: "dt" })).toBeNull();
    expect(valorDo("Data chegada")).toBe("sem chegada");

    rerender(<FreteLinhaExpandida frete={frete({ notaFiscal2: "456" })} podeEditar={false} />);
    expect(valorDo("NF 2")).toBe("456");
  });

  it("com editar, a chegada vira campo de data e as fotos aceitam envio", async () => {
    anexosDoDocumento.mockResolvedValue([]);
    render(<FreteLinhaExpandida frete={frete({ dataChegada: "2026-09-12" })} podeEditar />);
    expect(screen.getByLabelText("Data de chegada")).toHaveValue("2026-09-12");
    await waitFor(() => expect(screen.queryByText("Pendente: carga ainda não foi confirmada na chegada.")).toBeInTheDocument());
    const fotos = screen.getByRole("region", { name: "Fotos da chegada da carga" });
    expect(within(fotos).getAllByRole("button").length).toBeGreaterThan(0);
  });
});

describe("colunasFretes", () => {
  it("mesma ordem da FreteListV2 da origem (o expansor e o menu vêm da DataTable)", () => {
    const ids = colunasFretes(true).map((c) => ("accessorKey" in c && c.accessorKey) || c.id);
    expect(ids).toEqual([
      "data",
      "dataChegada",
      "rota",
      "transportadoraNome",
      "insumoNome",
      "pesoToneladas",
      "valorTotal",
      "valorMaterial",
      "precoUnitario",
    ]);
  });
});
