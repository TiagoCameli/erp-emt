import { describe, expect, it } from "vitest";

import {
  escreverRecorte,
  lerRecorte,
  medidaDoRecorte,
  rotuloRecorte,
} from "@/modules/financeiro/lancamentos/recorte";

/**
 * O recorte é a fatia que um relatório cortou, e a partir dela os cartões da
 * listagem passam a somar a fatia em vez do valor cheio do documento. Recorte
 * inválido que passasse faria a tela somar um conjunto que ninguém pediu, sem
 * erro nenhum: é o mesmo risco do contrato de filtros, e por isso a validação é
 * contra lista fechada.
 */
describe("lerRecorte", () => {
  it("lê a fatia de aging com faixa e tipo", () => {
    expect(lerRecorte("aging:v_8_15:a_pagar")).toEqual({
      tipo: "aging",
      faixa: "v_8_15",
      tipoLancamento: "a_pagar",
    });
  });

  it("lê a fatia de fluxo realizado e previsto", () => {
    expect(lerRecorte("fluxo:2026-07:realizado")).toEqual({
      tipo: "fluxo",
      mes: "2026-07",
      realizado: true,
    });
    expect(lerRecorte("fluxo:2026-07:previsto")).toEqual({
      tipo: "fluxo",
      mes: "2026-07",
      realizado: false,
    });
  });

  it("lê a fatia de conta paga", () => {
    expect(lerRecorte("conta_paga")).toEqual({ tipo: "conta_paga" });
  });

  it.each([
    undefined,
    "",
    "banana",
    "aging",
    "aging:banana:a_pagar",
    "aging:v_8_15:a_prazo",
    "aging:v_8_15",
    "aging:v_8_15:a_pagar:extra",
    "fluxo:2026-13:realizado",
    "fluxo:2026-7:realizado",
    "fluxo:2026-00:realizado",
    "fluxo:2026-07:talvez",
    "fluxo:2026-07",
    "conta_paga:extra",
  ])("recusa %s", (entrada) => {
    expect(lerRecorte(entrada as string | undefined)).toBeUndefined();
  });

  it("recusa parâmetro repetido na URL (chega como array)", () => {
    expect(lerRecorte(["conta_paga", "aging:v_1_7:a_pagar"])).toBeUndefined();
  });
});

describe("escreverRecorte", () => {
  it("fecha o ciclo com lerRecorte", () => {
    for (const texto of [
      "aging:v_60_mais:a_receber",
      "aging:a_vencer:a_pagar",
      "fluxo:2026-01:previsto",
      "fluxo:2026-12:realizado",
      "conta_paga",
    ]) {
      const recorte = lerRecorte(texto);
      expect(recorte).toBeDefined();
      expect(escreverRecorte(recorte!)).toBe(texto);
    }
  });
});

describe("rotuloRecorte", () => {
  it("descreve a fatia em pt-BR para o chip da barra", () => {
    expect(
      rotuloRecorte({
        tipo: "aging",
        faixa: "v_8_15",
        tipoLancamento: "a_pagar",
      }),
    ).toBe("Parcelas a pagar vencidas 8 a 15 dias");
    expect(
      rotuloRecorte({
        tipo: "aging",
        faixa: "a_vencer",
        tipoLancamento: "a_receber",
      }),
    ).toBe("Parcelas a receber a vencer");
    expect(rotuloRecorte({ tipo: "fluxo", mes: "2026-07", realizado: true })).toBe(
      "Parcelas pagas em 07/2026",
    );
    expect(
      rotuloRecorte({ tipo: "fluxo", mes: "2026-07", realizado: false }),
    ).toBe("Parcelas previstas para 07/2026");
    expect(rotuloRecorte({ tipo: "conta_paga" })).toBe("Parcelas pagas");
  });
});

describe("medidaDoRecorte", () => {
  /**
   * Cada fatia soma o que o relatório de origem soma. Aging é dívida viva (o
   * desconto só nasce no ato do pagamento); fluxo e posição bancária passaram
   * pelo caixa, e o que passou foi o líquido. Trocar a medida aqui faz o total do
   * drill parar de fechar com a célula clicada.
   */
  it("aging soma valor, fluxo e conta paga somam líquido", () => {
    expect(
      medidaDoRecorte({
        tipo: "aging",
        faixa: "a_vencer",
        tipoLancamento: "a_pagar",
      }),
    ).toBe("valor");
    expect(
      medidaDoRecorte({ tipo: "fluxo", mes: "2026-07", realizado: true }),
    ).toBe("liquido");
    expect(
      medidaDoRecorte({ tipo: "fluxo", mes: "2026-07", realizado: false }),
    ).toBe("liquido");
    expect(medidaDoRecorte({ tipo: "conta_paga" })).toBe("liquido");
  });
});
