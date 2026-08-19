import { describe, expect, it } from "vitest";

import {
  linksDosCards,
  primeiroDiaDoMes,
  somarDias,
  ultimoDiaDoMes,
} from "@/modules/gestao/links-cards";

const CONTEXTO = { hoje: "2026-08-19", mesDoCusto: "2026-08" };

describe("somarDias", () => {
  it("soma dentro do mês", () => {
    expect(somarDias("2026-08-19", 7)).toBe("2026-08-26");
  });

  it("vira o mês e o ano", () => {
    expect(somarDias("2026-08-28", 7)).toBe("2026-09-04");
    expect(somarDias("2026-12-28", 7)).toBe("2027-01-04");
  });

  it("atravessa 29 de fevereiro em ano bissexto", () => {
    expect(somarDias("2028-02-26", 7)).toBe("2028-03-04");
  });
});

describe("bordas do mês", () => {
  it("primeiro e último dia", () => {
    expect(primeiroDiaDoMes("2026-08-19")).toBe("2026-08-01");
    expect(ultimoDiaDoMes("2026-08-19")).toBe("2026-08-31");
  });

  it("meses de 30, 28 e 29 dias", () => {
    expect(ultimoDiaDoMes("2026-04-10")).toBe("2026-04-30");
    expect(ultimoDiaDoMes("2026-02-10")).toBe("2026-02-28");
    expect(ultimoDiaDoMes("2028-02-10")).toBe("2028-02-29");
  });

  it("dezembro não escorrega para o ano seguinte", () => {
    expect(ultimoDiaDoMes("2026-12-05")).toBe("2026-12-31");
  });
});

describe("linksDosCards", () => {
  it("Custo do mês abre o relatório no mês do cartão", () => {
    const links = linksDosCards(CONTEXTO);
    expect(links.custoDoMes).toBe(
      "/financeiro/relatorios?rel=custo-cc&modo=mes&mes=2026-08",
    );
  });

  it("Custo do mês carrega o filtro do painel, porque o cartão obedece a ele", () => {
    const links = linksDosCards({
      ...CONTEXTO,
      centroCustoId: "11111111-1111-4111-8111-111111111111",
      categoriaId: "22222222-2222-4222-8222-222222222222",
    });
    // Sem carregar o filtro, o relatório somaria a empresa inteira e mostraria
    // um número maior que o do cartão que acabou de ser clicado.
    expect(links.custoDoMes).toContain(
      "centro=11111111-1111-4111-8111-111111111111",
    );
    expect(links.custoDoMes).toContain(
      "categoria=22222222-2222-4222-8222-222222222222",
    );
  });

  it("A pagar em aberto abre a fila inteira, sem filtro", () => {
    // A fila JÁ é o conjunto em aberto: qualquer filtro aqui mostraria menos do
    // que o cartão soma.
    expect(linksDosCards(CONTEXTO).aPagarEmAberto).toBe("/financeiro/pagamentos");
  });

  it("Vence em até 7 dias filtra só aprovadas até a data limite", () => {
    expect(linksDosCards(CONTEXTO).venceEmSeteDias).toBe(
      "/financeiro/pagamentos?situacao=aprovado&venc_ate=2026-08-26",
    );
  });

  it("Vence em até 7 dias NÃO põe ponta inicial no vencimento", () => {
    // O cartão conta o que vence até a data limite incluindo o que já venceu
    // (as vencidas ele mostra à parte). Um `venc_de` esconderia o atraso, que é
    // a parte que interessa.
    expect(linksDosCards(CONTEXTO).venceEmSeteDias).not.toContain("venc_de");
  });

  it("Pagamentos a aprovar vai para a fila de aprovação", () => {
    expect(linksDosCards(CONTEXTO).pagamentosAAprovar).toBe(
      "/financeiro/aprovacao-pagamentos",
    );
  });

  it("Pago no mês abre a aba de pagas recortada no mês corrente", () => {
    expect(linksDosCards(CONTEXTO).pagoNoMes).toBe(
      "/financeiro/pagamentos?aba=pagas&h_pago_de=2026-08-01&h_pago_ate=2026-08-31",
    );
  });

  it("Pago no mês usa o mês de HOJE, não a janela do painel", () => {
    // O cartão sai de `fn_rel_gestao_financeiro_resumo`, que corta por
    // date_trunc('month', hoje) e ignora o período escolhido na tela.
    const links = linksDosCards({ hoje: "2026-08-19", mesDoCusto: "2026-03" });
    expect(links.pagoNoMes).toContain("h_pago_de=2026-08-01");
    expect(links.custoDoMes).toContain("mes=2026-03");
  });

  it("não gera parâmetro vazio quando não há filtro", () => {
    const links = linksDosCards({ ...CONTEXTO, centroCustoId: "", categoriaId: "" });
    expect(links.custoDoMes).not.toContain("centro=");
    expect(links.custoDoMes).not.toContain("categoria=");
  });
});
