import { describe, expect, it } from "vitest";

import {
  aplicarNaturezaOperacional,
  aplicarRecorteNoEmbed,
  recorteNoEmbed,
  somarDias,
  type ConsultaComEmbed,
} from "@/modules/financeiro/lancamentos/recorte-no-embed";

const HOJE = "2026-09-01";
const CONTA = "44444444-4444-4444-4444-444444444444";
const CATEGORIA = "11111111-1111-4111-8111-111111111111";
const OUTRA_CATEGORIA = "22222222-2222-4222-8222-222222222222";

/**
 * Dublê do builder do PostgREST: registra a chamada em vez de ir ao banco.
 *
 * Mesmo padrão do dublê de `filtros-pagas.test.ts`. O que interessa provar aqui é
 * a URL que sairia — e ela é feita destas chamadas.
 */
class ConsultaFalsa implements ConsultaComEmbed<ConsultaFalsa> {
  chamadas: string[] = [];

  private registrar(...partes: (string | null | undefined)[]) {
    this.chamadas.push(partes.filter((p) => p != null).join(" "));
    return this;
  }
  eq(coluna: string, valor: string) {
    return this.registrar("eq", coluna, valor);
  }
  neq(coluna: string, valor: string) {
    return this.registrar("neq", coluna, valor);
  }
  gte(coluna: string, valor: string) {
    return this.registrar("gte", coluna, valor);
  }
  lt(coluna: string, valor: string) {
    return this.registrar("lt", coluna, valor);
  }
  in(coluna: string, valores: readonly string[]) {
    return this.registrar("in", coluna, `(${valores.join(",")})`);
  }
  not(coluna: string, operador: string, valor: string | null) {
    return this.registrar("not", coluna, operador, valor ?? "null");
  }
  or(filtro: string, opcoes?: { referencedTable?: string }) {
    return this.registrar("or", opcoes?.referencedTable ?? "-", filtro);
  }
}

describe("somarDias", () => {
  it("atravessa a virada de mês e de ano", () => {
    expect(somarDias("2026-09-01", -7)).toBe("2026-08-25");
    expect(somarDias("2026-01-01", -1)).toBe("2025-12-31");
    // Bissexto: 2028 é ano bissexto, então 01/03 menos um dia é 29/02.
    expect(somarDias("2028-03-01", -1)).toBe("2028-02-29");
  });
});

describe("recorteNoEmbed: fluxo de caixa", () => {
  it("realizado é o mês do caixa mais status pago", () => {
    // A coluna guarda o dia 1; o recorte da URL é yyyy-MM.
    expect(
      recorteNoEmbed({ tipo: "fluxo", mes: "2026-06", realizado: true }, {
        hojeISO: HOJE,
      }),
    ).toEqual({
      condicoes: [
        { coluna: "mes_fluxo", operador: "eq", valor: "2026-06-01" },
        { coluna: "status", operador: "eq", valor: "pago" },
      ],
    });
  });

  it("previsto exclui a CANCELADA, não só a paga", () => {
    // `neq pago` sozinho traria a cancelada de volta, e a RPC a descarta. Seria
    // dinheiro na lista que a barra do gráfico não contou.
    const { condicoes } = recorteNoEmbed(
      { tipo: "fluxo", mes: "2026-06", realizado: false },
      { hojeISO: HOJE },
    );
    expect(condicoes).toContainEqual({
      coluna: "status",
      operador: "not.in",
      valor: ["pago", "cancelado"],
    });
  });
});

describe("recorteNoEmbed: aging", () => {
  it("a vencer inclui a parcela SEM vencimento", () => {
    // É a regra da RPC, e é o motivo de o recorte existir: um filtro de data
    // sozinho descartaria a parcela sem vencimento, que a célula somou.
    const traduzido = recorteNoEmbed(
      { tipo: "aging", faixa: "a_vencer", tipoLancamento: "a_pagar" },
      { hojeISO: HOJE },
    );
    expect(traduzido.ou).toBe(
      "data_vencimento.is.null,data_vencimento.gte.2026-09-01",
    );
  });

  it("as faixas se encaixam sem sobrepor nem deixar buraco", () => {
    // Cada faixa é [hoje+de, hoje+ate): o fim de uma é o começo da seguinte.
    const pontas = (faixa: "v_1_7" | "v_8_15" | "v_16_30" | "v_31_60") =>
      recorteNoEmbed(
        { tipo: "aging", faixa, tipoLancamento: "a_pagar" },
        { hojeISO: HOJE },
      ).condicoes
        .filter((c) => c.coluna === "data_vencimento")
        .map((c) => `${c.operador} ${c.valor as string}`);

    expect(pontas("v_1_7")).toEqual(["gte 2026-08-25", "lt 2026-09-01"]);
    expect(pontas("v_8_15")).toEqual(["gte 2026-08-17", "lt 2026-08-25"]);
    expect(pontas("v_16_30")).toEqual(["gte 2026-08-02", "lt 2026-08-17"]);
    expect(pontas("v_31_60")).toEqual(["gte 2026-07-03", "lt 2026-08-02"]);
  });

  it("mais de 60 dias fecha só por baixo", () => {
    const { condicoes } = recorteNoEmbed(
      { tipo: "aging", faixa: "v_60_mais", tipoLancamento: "a_pagar" },
      { hojeISO: HOJE },
    );
    expect(condicoes).toContainEqual({
      coluna: "data_vencimento",
      operador: "lt",
      valor: "2026-07-03",
    });
  });
});

describe("recorteNoEmbed: conta paga", () => {
  it("escopa na conta clicada", () => {
    // Sem isso, um lançamento com parcelas pagas em DUAS contas entraria na
    // fatia de uma só, e o total passaria da célula da posição bancária.
    const { condicoes } = recorteNoEmbed(
      { tipo: "conta_paga" },
      { hojeISO: HOJE, contaBancariaId: CONTA },
    );
    expect(condicoes).toContainEqual({
      coluna: "conta_bancaria_id",
      operador: "eq",
      valor: CONTA,
    });
  });

  it("repete o corte do saldo inicial, com a parcela sem data de pagamento dentro", () => {
    const traduzido = recorteNoEmbed(
      { tipo: "conta_paga" },
      { hojeISO: HOJE, contaBancariaId: CONTA, saldoInicialData: "2026-01-31" },
    );
    expect(traduzido.ou).toBe(
      "data_pagamento.is.null,data_pagamento.gt.2026-01-31",
    );
  });

  it("conta sem data de corte não ganha condição de data", () => {
    const traduzido = recorteNoEmbed(
      { tipo: "conta_paga" },
      { hojeISO: HOJE, contaBancariaId: CONTA, saldoInicialData: null },
    );
    expect(traduzido.ou).toBeUndefined();
  });
});

describe("aplicarRecorteNoEmbed", () => {
  it("prefixa o alias e fecha com o not.is.null", () => {
    // O `not.is.null` é o que faz o filtro do embed valer para o PAI. Sem ele o
    // embed vem vazio e o lançamento continua na lista.
    const consulta = aplicarRecorteNoEmbed(
      new ConsultaFalsa(),
      "recorte_parcelas",
      recorteNoEmbed({ tipo: "fluxo", mes: "2026-06", realizado: true }, {
        hojeISO: HOJE,
      }),
    );
    expect(consulta.chamadas).toEqual([
      "eq recorte_parcelas.mes_fluxo 2026-06-01",
      "eq recorte_parcelas.status pago",
      "not recorte_parcelas is null",
    ]);
  });

  it("o `or` do embed vai com referencedTable, senão filtraria o pai", () => {
    const consulta = aplicarRecorteNoEmbed(
      new ConsultaFalsa(),
      "recorte_parcelas",
      recorteNoEmbed(
        { tipo: "aging", faixa: "a_vencer", tipoLancamento: "a_pagar" },
        { hojeISO: HOJE },
      ),
    );
    expect(consulta.chamadas).toContain(
      "or recorte_parcelas data_vencimento.is.null,data_vencimento.gte.2026-09-01",
    );
  });

  it("not.in manda a lista entre parênteses, que é o que o PostgREST lê", () => {
    const consulta = aplicarRecorteNoEmbed(
      new ConsultaFalsa(),
      "r",
      recorteNoEmbed({ tipo: "fluxo", mes: "2026-06", realizado: false }, {
        hojeISO: HOJE,
      }),
    );
    expect(consulta.chamadas).toContain("not r.status in (pago,cancelado)");
  });

  it("nenhuma chamada carrega lista de lançamentos", () => {
    // O ponto do módulo: o que sai daqui é um punhado de caracteres, não os 732
    // uuids que davam 400 na URL.
    const consulta = aplicarRecorteNoEmbed(
      new ConsultaFalsa(),
      "recorte_parcelas",
      recorteNoEmbed({ tipo: "fluxo", mes: "2026-06", realizado: true }, {
        hojeISO: HOJE,
      }),
    );
    expect(consulta.chamadas.join("&").length).toBeLessThan(200);
  });
});

describe("aplicarNaturezaOperacional", () => {
  it("deixa passar o lançamento SEM categoria", () => {
    // `not.in` sozinho descartaria o lançamento de categoria nula (em SQL,
    // `null not in (...)` é nulo e não passa no where) — e existem três deles.
    const consulta = aplicarNaturezaOperacional(new ConsultaFalsa(), [
      CATEGORIA,
      OUTRA_CATEGORIA,
    ]);
    expect(consulta.chamadas).toEqual([
      `or - categoria_id.is.null,categoria_id.not.in.(${CATEGORIA},${OUTRA_CATEGORIA})`,
    ]);
  });

  it("sem categoria de movimentação, não mexe na consulta", () => {
    expect(aplicarNaturezaOperacional(new ConsultaFalsa(), []).chamadas).toEqual(
      [],
    );
  });
});
