import { describe, expect, it } from "vitest";

import {
  agruparDrePorNatureza,
  cartoesDoDre,
  type LinhaDreAgregada,
} from "@/modules/financeiro/relatorios/calculo";
import {
  DESPESAS_COM_DEGRAU,
  frasesDaPonte,
  ponteDoResultado,
} from "@/modules/financeiro/relatorios/ponte-do-resultado";

function linha(
  tipo: "a_receber" | "a_pagar",
  natureza: string,
  categoria: string,
  total: string,
  retencao?: string,
): LinhaDreAgregada {
  return { tipo, natureza, categoria, categoria_id: `id-${categoria}`, total, retencao };
}

/** Recorte do DRE de 06/2023 a 12/2026 como o `fn_rel_dre` devolveu em 15/10/2026. */
const LINHAS: LinhaDreAgregada[] = [
  linha("a_receber", "operacional", "Medições de obra", "58814162.56", "4359633.03"),
  linha("a_receber", "operacional", "Outras receitas", "2131342.63"),
  linha("a_receber", "operacional", "Contrato", "627981.03"),
  linha("a_pagar", "operacional", "Materiais", "12658562.66"),
  linha("a_pagar", "operacional", "Combustível", "8721898.76"),
  linha("a_pagar", "operacional", "Frete", "4401279.59"),
  linha("a_pagar", "operacional", "Impostos", "2638045.76"),
  linha("a_pagar", "operacional", "Outras despesas", "2512612.16"),
  linha("a_pagar", "operacional", "Mão de Obra Terceirizada", "2132534.99"),
  linha("a_pagar", "operacional", "Água e Esgoto", "510.00"),
  linha("a_receber", "financeira", "Juros de aplicações financeiras", "319542.87"),
  linha("a_pagar", "financeira", "Juros de empréstimos", "1393661.45"),
  linha("a_pagar", "financeira", "Tarifa Bancária", "30106.05"),
  linha("a_pagar", "investimento", "Aquisição de Equipamento", "10208154.30"),
  linha("a_pagar", "distribuicao", "Distribuição a sócio", "4246251.83"),
  linha("a_pagar", "mutuo", "Mútuo concedido a empresa ligada", "3040569.09"),
  linha("a_receber", "mutuo", "Devolução de mútuo", "1364362.97"),
  linha("a_receber", "movimentacao", "Resgate de aplicação", "12307932.27"),
];

describe("ponteDoResultado", () => {
  const dre = agruparDrePorNatureza(LINHAS);
  const ponte = ponteDoResultado(dre);
  const porId = (id: string) =>
    [...ponte.resultado, ...ponte.destino].find((d) => d.id === id);

  it("fecha no MESMO resultado dos cartões, ao centavo", () => {
    const ultimo = ponte.resultado.at(-1);
    expect(ultimo?.id).toBe("resultado-periodo");
    expect(ultimo?.valor).toBe(cartoesDoDre(dre).resultadoDoPeriodo);
  });

  it("cada passo começa onde o anterior terminou", () => {
    const todos = [...ponte.resultado, ...ponte.destino];
    for (let i = 1; i < todos.length; i++) {
      const atual = todos[i];
      if (atual?.tipo === "total") continue;
      expect(atual?.de).toBe(todos[i - 1]?.ate);
    }
  });

  it("parte da receita bruta e desce as retenções até a líquida", () => {
    expect(ponte.resultado[0]).toMatchObject({ id: "receita-bruta", valor: 65933119.25 });
    expect(porId("retencoes")?.valor).toBe(-4359633.03);
    expect(porId("receita-liquida")?.valor).toBe(61573486.22);
  });

  it("dá degrau só às maiores despesas e junta o resto, sem perder centavo", () => {
    const despesas = ponte.resultado.filter((d) => d.id.startsWith("despesa-"));
    expect(despesas).toHaveLength(DESPESAS_COM_DEGRAU);
    expect(despesas[0]?.rotulo).toBe("Materiais");
    expect(porId("demais-despesas")).toMatchObject({
      rotulo: "Demais despesas (2 categorias)",
      valor: -2133044.99,
    });
  });

  it("mútuo entra pelo LÍQUIDO, e distribuição e investimento ficam no destino", () => {
    expect(ponte.resultado.some((d) => d.id === "mutuo")).toBe(false);
    expect(porId("mutuo")?.valor).toBe(-1676206.12);
    expect(porId("distribuicoes")?.valor).toBe(-4246251.83);
    expect(porId("investimentos")?.valor).toBe(-10208154.3);
    // Movimentação (resgate de aplicação) não é destino do resultado.
    expect(ponte.destino.map((d) => d.id)).toEqual([
      "investimentos",
      "distribuicoes",
      "mutuo",
      "sobra",
    ]);
  });

  it("a escala cobre do zero ao maior patamar", () => {
    expect(ponte.escala.min).toBe(0);
    expect(ponte.escala.max).toBe(65933119.25);
  });

  it("sem receita, a fração e a margem são null, não infinito", () => {
    const vazio = ponteDoResultado(
      agruparDrePorNatureza([linha("a_pagar", "operacional", "Frete", "100.00")]),
    );
    expect(vazio.margem).toBeNull();
    expect(vazio.resultado.every((d) => d.daReceita === null)).toBe(true);
    expect(vazio.escala.min).toBe(-100);
    expect(vazio.destino).toEqual([]);
  });
});

describe("frasesDaPonte", () => {
  const brl = (v: number) => `R$ ${v.toFixed(2)}`;
  const pct = (v: number) => `${v.toFixed(1)}%`;

  it("conta a história com os números da ponte", () => {
    const ponte = ponteDoResultado(agruparDrePorNatureza(LINHAS));
    const frases = frasesDaPonte(ponte, brl, pct);
    expect(frases.resultado).toMatch(/^Da receita líquida de R\$ 61573486\.22, a obra consumiu/);
    expect(frases.resultado).toContain("juros e tarifas levaram");
    expect(frases.resultado).toContain("ficou de resultado");
    expect(frases.destino).toContain("R$ 10208154.30 foi para máquinas e terreno");
    expect(frases.destino).toContain("R$ 1676206.12 para as empresas ligadas");
  });

  it("sem receita não inventa percentual", () => {
    const ponte = ponteDoResultado(
      agruparDrePorNatureza([linha("a_pagar", "operacional", "Frete", "100.00")]),
    );
    expect(frasesDaPonte(ponte, brl, pct)).toEqual({ resultado: null, destino: null });
  });
});
