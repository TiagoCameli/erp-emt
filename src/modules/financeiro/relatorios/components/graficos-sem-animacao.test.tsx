import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AgingGrafico } from "./aging-grafico-impl";
import { VencimentosGrafico } from "@/modules/financeiro/dividas/components/vencimentos-grafico-impl";
import { CustoCcGrafico } from "./custo-cc-grafico-impl";
import { CustoCcSerie } from "./custo-cc-serie-impl";
import { CustoReceitaGrafico } from "./custo-receita-grafico-impl";
import { FluxoCaixaGrafico } from "./fluxo-caixa-grafico-impl";
import { COR_ENTIDADE, corProjetada } from "./cores-grafico";
import {
  GRUPOS_FLUXO,
  type GrupoFluxo,
} from "@/modules/financeiro/lancamentos/recorte";
import type { FluxoCaixaMes } from "../fluxo-caixa";

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

/** Um lado de um grupo num mês. */
function lado(realizado: number, projetado = 0) {
  return { realizado, projetado, total: realizado + projetado };
}

/** Um mês do fluxo com os cinco grupos zerados e o que cada caso preencher. */
function mesFluxo(
  mes: string,
  grupos: Partial<
    Record<GrupoFluxo, { entrada?: ReturnType<typeof lado>; saida?: ReturnType<typeof lado> }>
  >,
  saldoAcumulado: number | null = null,
): FluxoCaixaMes {
  const completos = {} as FluxoCaixaMes["grupos"];
  let entradas = 0;
  let saidas = 0;
  for (const grupo of GRUPOS_FLUXO) {
    const entrada = grupos[grupo]?.entrada ?? lado(0);
    const saida = grupos[grupo]?.saida ?? lado(0);
    completos[grupo] = { entrada, saida, liquido: entrada.total - saida.total };
    entradas += entrada.total;
    saidas += saida.total;
  }
  return {
    mes,
    rotulo: `${mes.slice(5)}/${mes.slice(0, 4)}`,
    grupos: completos,
    entradas,
    saidas,
    liquido: entradas - saidas,
    saldoAcumulado,
    saldoComAplicado: saldoAcumulado === null ? null : saldoAcumulado + 10_583_093.4,
  };
}

const MES_CORRENTE_FLUXO = "2026-06";

const MESES_FLUXO: FluxoCaixaMes[] = [
  mesFluxo(
    "2026-06",
    { operacao: { entrada: lado(1_120_000), saida: lado(980_450.33) } },
    -690_477.58,
  ),
  mesFluxo(
    "2026-07",
    {
      operacao: { entrada: lado(0, 410_000), saida: lado(0, 322_000) },
      divida: { saida: lado(0, 380_821.67) },
      investimento: { saida: lado(0, 286_447.61) },
    },
    -1_269_746.86,
  ),
];

describe("a série nasce com forma no primeiro quadro", () => {
  it("aging: uma barra com <path> para cada valor maior que zero", () => {
    const { container } = renderizarAging();

    // Quatro valores > 0 nas duas séries: é o mesmo número de grupos que a tela
    // de produção mostrava — lá com zero <path> dentro.
    expect(gruposDeBarra(container)).toBe(4);
    expect(barrasComForma(container)).toBe(4);
  });

  it("fluxo de caixa: um pedaço por grupo e lado com valor, e as duas linhas", () => {
    const { container } = render(
      <FluxoCaixaGrafico
        meses={MESES_FLUXO}
        mesCorrente={MES_CORRENTE_FLUXO}
        podeVerLancamentos
      />,
    );

    // 06/2026 tem dois pedaços (operação entrou e saiu), 07/2026 tem quatro
    // (operação nos dois lados, dívida e CAPEX saindo).
    expect(barrasComForma(container)).toBe(6);
    expect(gruposDeBarra(container)).toBe(barrasComForma(container));
    esperarLinhaInteira(container.querySelector(".recharts-line-curve"));
  });

  it("dívidas: contratos e consórcios empilhados, um pedaço por valor", () => {
    const { container } = render(
      <VencimentosGrafico
        meses={[
          { chave: "atraso", rotulo: "Em atraso", contratos: 74_512.9, consorcios: 0, total: 74_512.9, parcelas: 3 },
          { chave: "2026-10", rotulo: "out/26", contratos: 74_512.9, consorcios: 9_000, total: 83_512.9, parcelas: 4 },
          { chave: "2026-11", rotulo: "nov/26", contratos: 51_000, consorcios: 9_000, total: 60_000, parcelas: 3 },
        ]}
      />,
    );

    // 3 de contrato + 2 de consórcio (o zero do atraso não desenha).
    expect(barrasComForma(container)).toBe(5);
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

describe("fluxo de caixa: cor por grupo, tom claro no previsto", () => {
  it("a legenda mostra um item por grupo presente, não um por barra", () => {
    const { container } = render(
      <FluxoCaixaGrafico
        meses={MESES_FLUXO}
        mesCorrente={MES_CORRENTE_FLUXO}
        podeVerLancamentos
      />,
    );
    const texto = container.textContent ?? "";
    expect(texto).toContain("Operação");
    expect(texto).toContain("Investimento (CAPEX)");
    expect(texto).toContain("Dívida");
    // Mútuo e aplicações não mexeram na janela: não prometem cor nenhuma.
    expect(texto).not.toContain("Mútuo com ligadas");
    expect(texto).not.toContain("Aplicações");
    expect(texto).toContain("Disponível mais aplicado");
  });

  it("o mês depois do corrente sai no tom claro da MESMA cor do grupo", () => {
    const { container } = render(
      <FluxoCaixaGrafico
        meses={MESES_FLUXO}
        mesCorrente={MES_CORRENTE_FLUXO}
        podeVerLancamentos
      />,
    );
    const cores = [...container.querySelectorAll(".recharts-bar-rectangle path")].map(
      (path) => path.getAttribute("fill") ?? "",
    );
    // Junho é o corrente: cor cheia. Julho é previsto: a cor clareada, derivada
    // da do grupo, e não uma cor nova.
    expect(cores).toContain(COR_ENTIDADE.fluxo_operacao);
    expect(cores).toContain(corProjetada(COR_ENTIDADE.fluxo_operacao));
    expect(cores).toContain(corProjetada(COR_ENTIDADE.fluxo_divida));
    expect(cores).toContain(corProjetada(COR_ENTIDADE.fluxo_investimento));
    expect(COR_ENTIDADE.fluxo_divida).not.toBe(COR_ENTIDADE.fluxo_operacao);
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
    "../../dividas/components/vencimentos-grafico-impl.tsx",
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
