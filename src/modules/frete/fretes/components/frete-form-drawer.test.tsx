import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { FreteFormDrawer, limitarFila } from "@/modules/frete/fretes/components/frete-form-drawer";
import { legendaFotosChegada } from "@/modules/frete/fretes/components/frete-detalhe-drawer";
import { frete } from "@/modules/frete/fretes/fixture-frete";
import type { OpcoesFrete } from "@/modules/frete/fretes/tipos";

/**
 * O formulário como o FreteForm da origem: Valor total = KM × Peso × R$/TKM e Preço do
 * material = unitário × peso ao vivo; na edição o unitário vem de valor ÷ peso; na
 * transferência, o aviso fixo e sem os campos de material.
 */

vi.mock("@/modules/frete/fretes/actions", () => ({
  salvarFrete: vi.fn(),
  registrarChegadaPelaFoto: vi.fn(),
  registrarChegada: vi.fn(),
}));
vi.mock("@/modules/_shared/anexos/actions", () => ({
  anexosDoDocumento: vi.fn().mockResolvedValue([]),
  removerAnexo: vi.fn(),
  urlDoAnexo: vi.fn(),
  prepararEnvioAnexo: vi.fn(),
  confirmarEnvioAnexo: vi.fn(),
}));

afterEach(cleanup);

const OPCOES: OpcoesFrete = { localidades: [], transportadoras: [], insumos: [], obras: [] };

describe("FreteFormDrawer", () => {
  it("edição: unitário = valor do material ÷ peso, total e material ao vivo", () => {
    render(
      <FreteFormDrawer
        aberto
        onAbertoChange={() => {}}
        opcoes={OPCOES}
        frete={frete({ pesoToneladas: 32.5, kmRodados: 120, valorTkm: 0.37, valorMaterial: 2600 })}
      />,
    );
    expect(screen.getByText("Editar frete")).toBeTruthy();
    expect((screen.getByLabelText(/Valor unitário do material/) as HTMLInputElement).value).toBe("80,00");
    // 32,5 × 120 × 0,37 = 1.443,00
    expect(screen.getByTestId("frete-valor-total").textContent).toMatch(/1\.443,00/);
    expect(screen.getByTestId("frete-valor-material").textContent).toMatch(/2\.600,00/);
  });

  it("nova transferência: título, aviso sem travessão, obra opcional e sem NF", () => {
    render(<FreteFormDrawer aberto onAbertoChange={() => {}} opcoes={OPCOES} frete={null} tipo="transferencia" />);
    expect(screen.getByText("Nova transferência de material")).toBeTruthy();
    const aviso = screen.getByTestId("aviso-transferencia").textContent ?? "";
    expect(aviso).toContain("Não desconta saldo de pedreira");
    expect(aviso).not.toContain("—");
    expect(screen.getByText("Obra (opcional)")).toBeTruthy();
    expect(screen.queryByLabelText(/Nota fiscal/)).toBeNull();
    expect(screen.queryByLabelText(/Valor unitário do material/)).toBeNull();
  });

  it("novo frete de material", () => {
    render(<FreteFormDrawer aberto onAbertoChange={() => {}} opcoes={OPCOES} frete={null} />);
    expect(screen.getByText("Novo frete")).toBeTruthy();
    expect(screen.getByLabelText(/Nota fiscal \(opcional\)/)).toBeTruthy();
  });
});

describe("fila das fotos e legenda", () => {
  const foto = (nome: string) => new File(["x"], nome, { type: "image/jpeg" });

  it("teto de 8 e só foto na chegada", () => {
    const oito = Array.from({ length: 8 }, (_, i) => foto(`f${i}.jpg`));
    const { fila, recusados } = limitarFila(oito, [...oito, foto("nove.jpg")], true);
    expect(fila).toHaveLength(8);
    expect(recusados).toEqual(["nove.jpg: o limite é 8"]);
    const pdf = new File(["x"], "nota.pdf", { type: "application/pdf" });
    expect(limitarFila([], [pdf], true).recusados).toEqual(["nota.pdf não é foto"]);
    expect(limitarFila([], [pdf], false).fila).toEqual([pdf]);
  });

  it("remover da fila vale a lista nova", () => {
    const a = foto("a.jpg");
    const b = foto("b.jpg");
    expect(limitarFila([a, b], [b], true).fila).toEqual([b]);
  });

  it("legenda da chegada (sem travessão)", () => {
    expect(legendaFotosChegada(0, null)).toBe("Pendente: carga ainda não foi confirmada na chegada.");
    expect(legendaFotosChegada(2, "2026-09-21")).toBe("2 fotos · registrada em 21/09/2026");
  });
});
