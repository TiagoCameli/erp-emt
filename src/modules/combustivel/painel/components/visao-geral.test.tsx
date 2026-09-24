import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { corDoCombustivel, COR_PAINEL, ID_OUTROS_COMBUSTIVEIS } from "@/modules/combustivel/painel/cores";
import type { SaidaRecente } from "@/modules/combustivel/painel/queries";

import { CartaoKpi, chipDaVariacao } from "./cartao-kpi";
import { topPorMetrica } from "./graficos-impl";
import { dataHoraDeParede, iniciais, UltimosAbastecimentos } from "./ultimos-abastecimentos";

afterEach(cleanup);

describe("chip de variação (KpiCard da origem)", () => {
  it("±5 pontos é ruído: cinza e estável", () => {
    expect(chipDaVariacao({ tipo: "percentual", valor: 4.9 })).toMatchObject({ direcao: "estavel", texto: "+4,9%" });
    expect(chipDaVariacao({ tipo: "percentual", valor: 4.9 }).classe).toContain("bg-muted");
  });

  it("subir é bom por padrão, ruim com `inverter` (custo), sem cor com `neutro` (volume)", () => {
    expect(chipDaVariacao({ tipo: "percentual", valor: 12 }).classe).toContain("status-aprovado");
    expect(chipDaVariacao({ tipo: "percentual", valor: 12, inverter: true }).classe).toContain("status-rejeitado");
    expect(chipDaVariacao({ tipo: "percentual", valor: -12, inverter: true }).classe).toContain("status-aprovado");
    expect(chipDaVariacao({ tipo: "percentual", valor: 12, neutro: true }).classe).toContain("bg-muted");
  });

  it("acima de 200% corta; absoluto é sempre cinza e sem seta", () => {
    expect(chipDaVariacao({ tipo: "percentual", valor: 350 }).texto).toBe("+200%+");
    expect(chipDaVariacao({ tipo: "percentual", valor: -250 }).texto).toBe("−200%+");
    expect(chipDaVariacao({ tipo: "absoluto", texto: "+3" })).toMatchObject({ texto: "+3", direcao: null });
  });
});

describe("CartaoKpi", () => {
  it("mostra valor, detalhe, chip e sparkline com 4+ pontos", () => {
    const { container } = render(
      <CartaoKpi titulo="Volume total" valor="1,2 mil L" detalhe="1.200,00 L no período" variacao={{ tipo: "percentual", valor: 10 }} spark={[1, 2, 3, 4]} />,
    );
    expect(screen.getByText("1,2 mil L")).toBeTruthy();
    expect(screen.getByText("+10,0%")).toBeTruthy();
    expect(container.querySelector("[data-slot=sparkline]")).not.toBeNull();
  });

  it("vazio: aviso no lugar do número, sem chip nem sparkline", () => {
    const { container } = render(
      <CartaoKpi titulo="Custo total" valor="R$ 0" vazio variacao={{ tipo: "percentual", valor: 10 }} spark={[1, 2, 3, 4]} />,
    );
    expect(screen.getByText("Sem dado no período")).toBeTruthy();
    expect(screen.queryByText("+10,0%")).toBeNull();
    expect(container.querySelector("[data-slot=sparkline]")).toBeNull();
  });

  it("o cartão, item da grade, não declara h-full (desligaria o stretch da linha)", () => {
    const { container } = render(<CartaoKpi titulo="Equipamentos" valor="3" />);
    expect((container.firstElementChild as HTMLElement).className).not.toContain("h-full");
  });
});

describe("Últimos abastecimentos", () => {
  const saida = (id: string): SaidaRecente => ({
    id,
    data: "2026-09-10T14:05:00",
    consumidor: "Escavadeira",
    codigo: "ESC-01",
    operador: "João da Silva",
    transportadora: null,
    combustivel: "Diesel S10",
    corCombustivel: corDoCombustivel("Diesel S10"),
    obra: "Lote 9",
    litros: 100,
    valorTotal: 639.47,
  });

  it("relógio de parede sem fuso e iniciais do operador", () => {
    expect(dataHoraDeParede("2026-09-10T14:05:00")).toBe("10/09/2026 14:05");
    expect(iniciais("João da Silva")).toBe("JS");
    expect(iniciais("Zé")).toBe("ZÉ");
  });

  it("'Ver todos (N)' só quando há mais saídas que as visíveis, levando o recorte", () => {
    const { rerender } = render(
      <UltimosAbastecimentos modo="proprios" saidas={[saida("a")]} total={25} hrefVerTodos="/combustivel/abastecimentos?de=2026-09-01&ate=2026-09-30" />,
    );
    const link = screen.getByRole("link", { name: /Ver todos \(25\)/ });
    expect(link.getAttribute("href")).toBe("/combustivel/abastecimentos?de=2026-09-01&ate=2026-09-30");
    expect(screen.getByText("R$ 6,3947")).toBeTruthy();
    expect(screen.getByText("ESC-01")).toBeTruthy();

    rerender(<UltimosAbastecimentos modo="proprios" saidas={[saida("a")]} total={1} hrefVerTodos="/x" />);
    expect(screen.queryByRole("link", { name: /Ver todos/ })).toBeNull();
    expect(screen.getByText("Abastecimentos no período")).toBeTruthy();
  });

  it("modo carretas troca as colunas (Placa, Motorista, Transportadora)", () => {
    render(<UltimosAbastecimentos modo="carretas" saidas={[saida("a")]} total={1} hrefVerTodos="/x" />);
    expect(screen.getByText("Placa")).toBeTruthy();
    expect(screen.getByText("Motorista")).toBeTruthy();
    expect(screen.getByText("Transportadora")).toBeTruthy();
  });
});

describe("cores e ranking", () => {
  it("a cor segue o combustível pelo nome, não a posição", () => {
    expect(corDoCombustivel("Diesel S10 (BR)")).toBe(COR_PAINEL.principal);
    expect(corDoCombustivel("DIESEL S500")).toBe(COR_PAINEL.custo);
    expect(corDoCombustivel("Arla 32")).toBe(COR_PAINEL.atencao);
    expect(corDoCombustivel("Outros", ID_OUTROS_COMBUSTIVEIS)).toBe(COR_PAINEL.agregado);
  });

  it("Top reordena por litros ou R$ antes de cortar em 10", () => {
    const consumidores = Array.from({ length: 12 }, (_, i) => ({
      id: `e${i}`,
      nome: `E${i}`,
      detalhe: "",
      litros: i,
      custo: 100 - i,
      qtd: 1,
      sentinela: false,
    }));
    expect(topPorMetrica(consumidores, "litros").map((c) => c.id).slice(0, 2)).toEqual(["e11", "e10"]);
    expect(topPorMetrica(consumidores, "custo").map((c) => c.id).slice(0, 2)).toEqual(["e0", "e1"]);
    expect(topPorMetrica(consumidores, "custo")).toHaveLength(10);
  });
});

describe("gráficos sem animação de entrada", () => {
  it("toda série do Recharts desliga a animação (senão a barra pode nunca aparecer)", () => {
    const fonte = readFileSync(join(__dirname, "graficos-impl.tsx"), "utf8");
    const series = fonte.match(/<(Bar|Line|Pie|Treemap)\b[\s\S]*?>/g) ?? [];
    // Evolução (Bar + Line), Mix (Pie), Top (Bar), Obras (Treemap), Fornecedor (Bar).
    expect(series.length).toBeGreaterThanOrEqual(6);
    for (const serie of series) expect(serie).toContain("isAnimationActive={false}");
  });
});
