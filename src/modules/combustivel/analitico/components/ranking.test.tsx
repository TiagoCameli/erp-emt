import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { limparEstadosTabelaParaTeste } from "@/components/canonicos/data-table";
import { ChipTendencia } from "@/modules/combustivel/analitico/components/kpi-analitico";
import {
  BarraPercentual,
  CelulaTendencia,
  idTabelaRanking,
  TabelaRanking,
} from "@/modules/combustivel/analitico/components/ranking";

// O ranking é DataTable com idTabela: a preferência salva é do servidor.
vi.mock("@/modules/_shared/preferencias-tabela/actions", () => ({
  buscarPreferenciaTabela: vi.fn(async () => null),
  salvarPreferenciaTabela: vi.fn(async () => undefined),
  limparPreferenciaTabela: vi.fn(async () => undefined),
}));

afterEach(() => {
  cleanup();
  limparEstadosTabelaParaTeste();
});

interface Linha {
  id: string;
  litros: number;
  sentinela: boolean;
}

describe("TabelaRanking", () => {
  it("posição, nome com link quando há, meta e a linha sem link sem âncora", () => {
    render(
      <TabelaRanking<Linha>
        titulo="Ranking de equipamentos"
        subtitulo="2 equipamentos no período"
        linhas={[
          { id: "eq-1", litros: 10, sentinela: false },
          { id: "_naoid", litros: 5, sentinela: true },
        ]}
        chave={(l) => l.id}
        cabecalhoNome="Equipamento"
        nome={(l) => (l.sentinela ? "Não identificado" : "Escavadeira")}
        meta={(l) => (l.sentinela ? "1 saída sem equipamento" : "EC-01")}
        href={(l) => (l.sentinela ? null : `/combustivel/abastecimentos?equipamento=${l.id}`)}
        destacar={(l) => l.sentinela}
        colunas={[{ cabecalho: "Litros", celula: (l) => `${l.litros} L` }]}
      />,
    );
    expect(screen.getByRole("link", { name: "Escavadeira" })).toHaveAttribute(
      "href",
      "/combustivel/abastecimentos?equipamento=eq-1",
    );
    expect(screen.queryByRole("link", { name: "Não identificado" })).not.toBeInTheDocument();
    expect(screen.getByText("EC-01")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("5 L")).toBeInTheDocument();
  });

  it("cada ranking guarda a preferência no seu id, pelo cabeçalho do nome", () => {
    expect(idTabelaRanking("Equipamento")).toBe("combustivel.ranking.equipamento");
    expect(idTabelaRanking("Placa")).toBe("combustivel.ranking.placa");
    expect(idTabelaRanking("Fornecedor")).toBe("combustivel.ranking.fornecedor");
    expect(idTabelaRanking("Obra")).toBe("combustivel.ranking.obra");
  });

  it("barra com piso de 2% e o percentual com 1 casa", () => {
    const { container } = render(<BarraPercentual pct={0.4} />);
    expect(screen.getByText("0,4%")).toBeInTheDocument();
    expect(container.querySelector("[style]")).toHaveStyle({ width: "2%" });
  });

  it("tendência: série ou 'poucos pts'", () => {
    render(<CelulaTendencia serie={[1, 2, 3, 4]} suficiente />);
    expect(screen.getByTestId("sparkline")).toBeInTheDocument();
    cleanup();
    render(<CelulaTendencia serie={[1, 0, 0]} suficiente={false} />);
    expect(screen.getByText("poucos pts")).toBeInTheDocument();
  });
});

describe("ChipTendencia", () => {
  it("custo subindo leva a cor de estado; volume subindo fica neutro", () => {
    render(<ChipTendencia delta={12} altaRuim />);
    expect(screen.getByLabelText("+12,0% vs período anterior").className).toContain("text-status-rejeitado");
    cleanup();
    render(<ChipTendencia delta={12} altaRuim={false} />);
    expect(screen.getByLabelText("+12,0% vs período anterior").className).toContain("text-muted-foreground");
  });

  it("a diferença absoluta substitui o %", () => {
    render(<ChipTendencia delta={100} diferenca="+1" altaRuim={false} />);
    expect(screen.getByText("+1")).toBeInTheDocument();
    expect(screen.queryByText(/100/)).not.toBeInTheDocument();
  });
});
