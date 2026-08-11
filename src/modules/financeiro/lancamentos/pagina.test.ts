import { describe, expect, it } from "vitest";

import { lerLinha, lerPagina } from "@/modules/financeiro/lancamentos/pagina";

/** Uma linha como a RPC fn_listar_lancamentos devolve de verdade. */
function linhaBruta(extra: Record<string, unknown> = {}) {
  return {
    id: "ab1fedb1-7f31-4fbb-9e23-ca26a4f4c12b",
    numero: "LAN-2026-7186",
    tipo: "a_pagar",
    origem: "manual",
    descricao: "REFERENTE ALIMENTACAO MOTORISTA",
    valor: 210.0,
    data_vencimento: "2026-08-10",
    status: "pago",
    qtd_parcelas: 1,
    data_compra: "2026-08-10",
    mes_competencia: "2026-08-01",
    created_at: "2026-08-10T23:28:17.222627+00:00",
    categoria_id: "0bc82e27-4062-ba47-539b-cb3fc0d898ae",
    fornecedor_id: "65e3c226-294f-f8e8-6c77-9deda4162135",
    categoria_nome: "Vale Alimentação Mão de Obra",
    fornecedor_nome: "MICHARLE ROCHA DA SILVA",
    revisao: "revisado",
    ...extra,
  };
}

describe("lerLinha", () => {
  it("converte snake_case do banco no formato da tela", () => {
    expect(lerLinha(linhaBruta())).toEqual({
      id: "ab1fedb1-7f31-4fbb-9e23-ca26a4f4c12b",
      numero: "LAN-2026-7186",
      tipo: "a_pagar",
      origem: "manual",
      descricao: "REFERENTE ALIMENTACAO MOTORISTA",
      categoriaNome: "Vale Alimentação Mão de Obra",
      fornecedorNome: "MICHARLE ROCHA DA SILVA",
      valor: 210,
      dataVencimento: "2026-08-10",
      status: "pago",
      qtdParcelas: 1,
      dataCompra: "2026-08-10",
      mesCompetencia: "2026-08-01",
      criadoEm: "2026-08-10T23:28:17.222627+00:00",
      revisao: "revisado",
    });
  });

  it("aceita numeric como string, que é como o Postgres às vezes manda", () => {
    expect(lerLinha(linhaBruta({ valor: "1234.56" })).valor).toBe(1234.56);
  });

  it("aceita nulo no que é opcional", () => {
    const linha = lerLinha(
      linhaBruta({
        numero: null,
        data_vencimento: null,
        categoria_nome: null,
        fornecedor_nome: null,
      }),
    );
    expect(linha.numero).toBeNull();
    expect(linha.dataVencimento).toBeNull();
    expect(linha.categoriaNome).toBeNull();
    expect(linha.fornecedorNome).toBeNull();
  });

  it("reclama do campo que sumiu, em vez de mostrar undefined em dinheiro", () => {
    // É este o caso que o teste existe para pegar: alguém renomeia a coluna no
    // SQL e a tela passaria a exibir "R$ NaN" sem ninguém perceber.
    expect(() => lerLinha(linhaBruta({ valor: undefined }))).toThrow(/valor/);
    expect(() => lerLinha(linhaBruta({ descricao: undefined }))).toThrow(
      /descricao/,
    );
  });

  it("reclama de estado de revisão que a tela não sabe desenhar", () => {
    expect(() => lerLinha(linhaBruta({ revisao: "meio-revisado" }))).toThrow(
      /revisão desconhecido/,
    );
  });
});

describe("lerPagina", () => {
  it("lê total, valor total e itens", () => {
    const pagina = lerPagina({
      total: 7253,
      valor_total: 64541696.82,
      itens: [linhaBruta(), linhaBruta({ id: "outro", valor: 10 })],
    });
    expect(pagina.total).toBe(7253);
    expect(pagina.valorTotal).toBe(64541696.82);
    expect(pagina.itens).toHaveLength(2);
    expect(pagina.itens[1].valor).toBe(10);
  });

  it("lê a página vazia", () => {
    const pagina = lerPagina({ total: 0, valor_total: 0, itens: [] });
    expect(pagina).toEqual({ total: 0, valorTotal: 0, itens: [] });
  });

  it("aceita valor_total como string", () => {
    expect(
      lerPagina({ total: 1, valor_total: "64541696.82", itens: [] }).valorTotal,
    ).toBe(64541696.82);
  });

  it("recusa retorno fora do formato", () => {
    expect(() => lerPagina(null)).toThrow(/formato esperado/);
    expect(() => lerPagina([])).toThrow(/formato esperado/);
    expect(() => lerPagina({ total: 1, valor_total: 1 })).toThrow(
      /sem a lista de itens/,
    );
  });
});
