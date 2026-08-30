import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AgingGrafico } from "./aging-grafico-impl";
import { CreditosGrafico } from "./creditos-grafico-impl";
import { CustoCcGrafico } from "./custo-cc-grafico-impl";
import { CustoCcSerie } from "./custo-cc-serie-impl";
import { CustoReceitaGrafico } from "./custo-receita-grafico-impl";
import { FluxoCaixaGrafico } from "./fluxo-caixa-grafico-impl";
import { COR_ENTIDADE } from "./cores-grafico";

/**
 * O gráfico que desenhava eixo, escala e legenda e NENHUMA BARRA.
 *
 * Visto em produção no Aging: `svg.recharts-surface` com 1711x320 (tamanho
 * certo), quatro `<g class="recharts-bar-rectangle">` (os quatro valores > 0) e
 * `document.querySelectorAll('.recharts-bar-rectangle path').length === 0` — os
 * grupos existiam VAZIOS. Disparar `resize` não recuperava.
 *
 * A causa: o Recharts 3 desenha a barra por uma animação de entrada que começa
 * em t=0, e em t=0 a altura interpolada é 0 — `Rectangle` devolve `null` para
 * altura 0. O primeiro quadro pintado é sempre o grupo vazio, e a forma só nasce
 * quando o `requestAnimationFrame` da animação avança. Quando ele não avança (ou
 * a animação é remontada antes disso, o que acontece a cada mudança de estado
 * interno do gráfico, porque a `key` dela é derivada da identidade do objeto de
 * props), o quadro vazio é o quadro final.
 *
 * A regra que estes testes travam: no primeiro quadro, síncrono, sem esperar
 * tempo nenhum, a série já tem forma. Nada de `waitFor`, nada de timer: esperar
 * é justamente o que o gráfico quebrado nunca terminava de fazer.
 */

const LARGURA = 900;
const ALTURA = 320;

const RETANGULO: DOMRect = {
  width: LARGURA,
  height: ALTURA,
  top: 0,
  left: 0,
  bottom: ALTURA,
  right: LARGURA,
  x: 0,
  y: 0,
  toJSON: () => ({}),
};

const medirOriginal = Element.prototype.getBoundingClientRect;

/**
 * O jsdom não faz layout nem implementa `ResizeObserver`, e sem os dois o
 * `ResponsiveContainer` mede -1 e não renderiza gráfico nenhum — o teste passaria
 * a medir a ausência do container em vez da ausência das barras. Estes dois stubs
 * dão ao container UM tamanho válido, e só a ele: medir todo elemento como
 * 900x320 embaralha a conta de eixo do Recharts e some com as barras por outro
 * motivo, que é exatamente o falso positivo a evitar.
 */
beforeAll(() => {
  class ObservadorDeTamanho implements ResizeObserver {
    constructor(private readonly aoMudar: ResizeObserverCallback) {}
    observe(alvo: Element) {
      this.aoMudar(
        [{ target: alvo, contentRect: RETANGULO } as ResizeObserverEntry],
        this,
      );
    }
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ObservadorDeTamanho;

  Element.prototype.getBoundingClientRect = function medir(this: Element) {
    if (!this.classList?.contains("recharts-responsive-container")) {
      return medirOriginal.call(this);
    }
    return RETANGULO;
  };
});

afterAll(() => {
  Element.prototype.getBoundingClientRect = medirOriginal;
});

/** Quantas barras chegaram a ter forma (`<path>`), e não só o grupo vazio. */
function barrasComForma(container: HTMLElement): number {
  return container.querySelectorAll(".recharts-bar-rectangle path").length;
}

/** Grupos de barra desenhados, com ou sem forma dentro. */
function gruposDeBarra(container: HTMLElement): number {
  return container.querySelectorAll(".recharts-bar-rectangle").length;
}

/**
 * A linha foi desenhada INTEIRA, e não mascarada pela animação.
 *
 * A `Line` do Recharts anima revelando a curva por um `stroke-dasharray` que
 * cresce de 0 até o comprimento total: em t=0 o atributo sai como
 * `"0px <total>px"`, ou seja, nada visível. Sem animação o atributo não é
 * escrito. É o mesmo defeito da barra, na forma que a linha tem.
 */
function esperarLinhaInteira(curva: Element | null) {
  expect(curva?.getAttribute("d")).toBeTruthy();
  expect(curva?.getAttribute("stroke-dasharray")).toBeNull();
}

/** Rótulo da legenda -> cor do quadradinho dela, que é o `fill` da série. */
function coresDaLegenda(container: HTMLElement): Map<string, string> {
  const cores = new Map<string, string>();
  for (const item of container.querySelectorAll(".recharts-legend-item")) {
    const rotulo = item
      .querySelector(".recharts-legend-item-text")
      ?.textContent?.trim();
    const icone = item.querySelector(".recharts-legend-icon");
    if (rotulo && icone) {
      cores.set(rotulo, icone.getAttribute("fill") ?? "");
    }
  }
  return cores;
}

const AGING_A_PAGAR = [
  { faixa: "a_vencer", rotulo: "A vencer", valor: 1_284_390.55 },
  { faixa: "v_1_7", rotulo: "Vencido 1 a 7 dias", valor: 87_120.4 },
  { faixa: "v_8_15", rotulo: "Vencido 8 a 15 dias", valor: 0 },
  { faixa: "v_16_30", rotulo: "Vencido 16 a 30 dias", valor: 0 },
  { faixa: "v_31_60", rotulo: "Vencido 31 a 60 dias", valor: 0 },
  { faixa: "v_60_mais", rotulo: "Vencido mais de 60 dias", valor: 0 },
] as const;

const AGING_A_RECEBER = [
  { faixa: "a_vencer", rotulo: "A vencer", valor: 2_190_004.12 },
  { faixa: "v_1_7", rotulo: "Vencido 1 a 7 dias", valor: 0 },
  { faixa: "v_8_15", rotulo: "Vencido 8 a 15 dias", valor: 45_800 },
  { faixa: "v_16_30", rotulo: "Vencido 16 a 30 dias", valor: 0 },
  { faixa: "v_31_60", rotulo: "Vencido 31 a 60 dias", valor: 0 },
  { faixa: "v_60_mais", rotulo: "Vencido mais de 60 dias", valor: 0 },
] as const;

function renderizarAging() {
  return render(
    <AgingGrafico
      aPagar={[...AGING_A_PAGAR]}
      aReceber={[...AGING_A_RECEBER]}
      podeVerLancamentos
    />,
  );
}

const MESES_FLUXO = [
  {
    mes: "2026-06",
    rotulo: "06/2026",
    entradasRealizado: 1_120_000,
    entradasProjetado: 0,
    saidasRealizado: 980_450.33,
    saidasProjetado: 0,
    saldo: 139_549.67,
  },
  {
    mes: "2026-07",
    rotulo: "07/2026",
    entradasRealizado: 640_000,
    entradasProjetado: 410_000,
    saidasRealizado: 505_300.1,
    saidasProjetado: 322_000,
    saldo: 222_699.9,
  },
];

describe("a série nasce com forma no primeiro quadro", () => {
  it("aging: uma barra com <path> para cada valor maior que zero", () => {
    const { container } = renderizarAging();

    // Quatro valores > 0 nas duas séries: é o mesmo número de grupos que a tela
    // de produção mostrava — lá com zero <path> dentro.
    expect(gruposDeBarra(container)).toBe(4);
    expect(barrasComForma(container)).toBe(4);
  });

  it("fluxo de caixa: as quatro séries de barra e a linha do saldo", () => {
    const { container } = render(
      <FluxoCaixaGrafico meses={MESES_FLUXO} podeVerLancamentos />,
    );

    // 06/2026 tem duas barras com valor, 07/2026 tem quatro.
    expect(barrasComForma(container)).toBe(6);
    expect(gruposDeBarra(container)).toBe(barrasComForma(container));

    esperarLinhaInteira(container.querySelector(".recharts-line-curve"));
  });

  it("créditos: uma barra por mês que vence", () => {
    const { container } = render(
      <CreditosGrafico
        meses={[
          { mes: "2026-09-01", rotulo: "09/2026", valor: 74_512.9, parcelas: 3 },
          { mes: "2026-10-01", rotulo: "10/2026", valor: 74_512.9, parcelas: 3 },
          { mes: "2026-11-01", rotulo: "11/2026", valor: 51_000, parcelas: 2 },
        ]}
      />,
    );

    expect(barrasComForma(container)).toBe(3);
  });

  it("custo por centro de custo: uma barra deitada por centro", () => {
    const { container } = render(
      <div style={{ width: LARGURA, height: ALTURA }}>
        <CustoCcGrafico
          centros={[
            {
              centroCustoId: "11111111-1111-1111-1111-111111111111",
              codigo: "009",
              nome: "Manutenção da Rodovia BR-364/AC - Lote 09 & 10",
              valor: 3_402_119.87,
            },
            {
              centroCustoId: "22222222-2222-2222-2222-222222222222",
              codigo: "001",
              nome: "Escritório Central",
              valor: 218_440.05,
            },
          ]}
        />
      </div>,
    );

    expect(barrasComForma(container)).toBe(2);
  });

  it("série do centro de custo: a linha de cada centro é desenhada inteira", () => {
    const { container } = render(
      <CustoCcSerie
        series={[
          {
            centroCustoId: "11111111-1111-1111-1111-111111111111",
            codigo: "009",
            nome: "Manutenção da Rodovia BR-364/AC",
            pontos: [
              { mes: "2026-05", valor: 410_220.15 },
              { mes: "2026-06", valor: 388_900 },
              { mes: "2026-07", valor: 512_004.4 },
            ],
          },
          {
            centroCustoId: "22222222-2222-2222-2222-222222222222",
            codigo: "001",
            nome: "Escritório Central",
            pontos: [
              { mes: "2026-06", valor: 61_300.2 },
              { mes: "2026-07", valor: 58_990 },
            ],
          },
        ]}
        filtros={{}}
        podeVerLancamentos
      />,
    );

    const curvas = container.querySelectorAll(".recharts-line-curve");
    expect(curvas).toHaveLength(2);
    for (const curva of curvas) {
      esperarLinhaInteira(curva);
    }
  });

  it("custo x receita: as duas barras do mês e a linha do resultado", () => {
    const { container } = render(
      <CustoReceitaGrafico
        meses={[
          {
            mes: "2026-06",
            custo: 980_450.33,
            receita: 1_120_000,
            resultado: 139_549.67,
          },
          {
            mes: "2026-07",
            custo: 827_300.1,
            receita: 1_050_000,
            resultado: 222_699.9,
          },
        ]}
      />,
    );

    expect(barrasComForma(container)).toBe(4);
    esperarLinhaInteira(container.querySelector(".recharts-line-curve"));
  });
});

describe("legenda", () => {
  it("separa entrada realizada de projetada por COR, não por opacidade", () => {
    const { container } = render(
      <FluxoCaixaGrafico meses={MESES_FLUXO} podeVerLancamentos />,
    );
    const cores = coresDaLegenda(container);

    const realizadas = cores.get("Entradas realizadas");
    const projetadas = cores.get("Entradas projetadas");
    expect(realizadas).toBeTruthy();
    expect(projetadas).toBeTruthy();
    // O ícone da Legend lê o `fill` e ignora o `fillOpacity`: com opacidade os
    // dois quadrados saíam idênticos, e a legenda deixava de dizer qual dinheiro
    // já entrou.
    expect(projetadas).not.toBe(realizadas);
    expect(cores.get("Saídas projetadas")).not.toBe(
      cores.get("Saídas realizadas"),
    );
    // E o projetado continua sendo a MESMA entidade: o tom claro é derivado da
    // cor dela, não uma cor nova.
    expect(projetadas).toContain(COR_ENTIDADE.a_receber);
  });
});

describe("cor segue a entidade, e não o slot do gráfico", () => {
  it("o custo tem a mesma cor de 'a pagar' nas duas telas", () => {
    const aging = renderizarAging();
    const custoReceita = render(
      <CustoReceitaGrafico
        meses={[
          {
            mes: "2026-06",
            custo: 980_450.33,
            receita: 1_120_000,
            resultado: 139_549.67,
          },
        ]}
      />,
    );

    const corAPagar = coresDaLegenda(aging.container).get("A pagar");
    const corCusto = coresDaLegenda(custoReceita.container).get("Custo");
    const corAReceber = coresDaLegenda(aging.container).get("A receber");
    const corReceita = coresDaLegenda(custoReceita.container).get(
      "Receita líquida",
    );

    // O defeito: `--chart-1` era "A pagar" no aging e "Receita líquida" em custo
    // x receita. A mesma cor dizendo dinheiro que sai numa tela e dinheiro que
    // entra na outra.
    expect(corCusto).toBe(corAPagar);
    expect(corReceita).toBe(corAReceber);
    expect(corAPagar).not.toBe(corAReceber);
  });

  it("o mapa de entidade não empresta a cor de saída para quem recebe", () => {
    expect(COR_ENTIDADE.custo).toBe(COR_ENTIDADE.a_pagar);
    expect(COR_ENTIDADE.receita).toBe(COR_ENTIDADE.a_receber);
    expect(COR_ENTIDADE.a_pagar).not.toBe(COR_ENTIDADE.a_receber);
    expect(COR_ENTIDADE.saldo).not.toBe(COR_ENTIDADE.a_pagar);
    expect(COR_ENTIDADE.saldo).not.toBe(COR_ENTIDADE.a_receber);
    // O `--chart-5` é o vermelho de "rejeitado"/"vencido": entidade nenhuma o usa.
    expect(Object.values(COR_ENTIDADE)).not.toContain("var(--color-chart-5)");
  });
});

describe("eixo do aging", () => {
  it("gira os rótulos, que chegam a 23 caracteres e colidiam deitados", () => {
    const { container } = renderizarAging();
    const rotulos = [
      ...container.querySelectorAll(".recharts-xAxis-tick-labels text"),
    ];

    // `interval={0}`: as seis faixas aparecem, sempre. Faixa escondida é faixa
    // que ninguém confere.
    expect(rotulos).toHaveLength(6);
    expect(rotulos.map((r) => r.textContent)).toContain(
      "Vencido mais de 60 dias",
    );
    for (const rotulo of rotulos) {
      expect(rotulo.getAttribute("transform")).toMatch(/rotate\(-30/);
    }
  });
});

describe("nenhum gráfico do módulo escapa da regra", () => {
  const PASTA = join(
    process.cwd(),
    "src/modules/financeiro/relatorios/components",
  );

  const GRAFICOS = [
    "aging-grafico-impl.tsx",
    "fluxo-caixa-grafico-impl.tsx",
    "creditos-grafico-impl.tsx",
    "custo-cc-grafico-impl.tsx",
    "custo-cc-serie-impl.tsx",
    "custo-receita-grafico-impl.tsx",
  ];

  it.each(GRAFICOS)(
    "%s declara isAnimationActive em toda série que desenha",
    (arquivo) => {
      const fonte = readFileSync(join(PASTA, arquivo), "utf8");
      // `<Bar` e `<Line` com delimitador, para não pegar `<BarChart`/`<LineChart`.
      const series = fonte.match(/<(Bar|Line)[\s>]/g) ?? [];
      const desligadas = fonte.match(/isAnimationActive=\{SEM_ANIMACAO\}/g) ?? [];

      expect(series.length).toBeGreaterThan(0);
      expect(desligadas).toHaveLength(series.length);
    },
  );
});
