import { describe, expect, it } from "vitest";

import { montarEspelhoOrdem } from "@/modules/compras/ordens/espelho";

const LINHA = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  numero: "OC-2026-0001",
  descricao: "Pedra para a obra",
  valor_total: "100000.00",
  frete: "500.00",
  outras_despesas: "0.00",
  impostos: "0.00",
  desconto: "0.00",
  status: "aprovado",
  motivo_rejeicao: null,
  data_compra: "2026-07-31",
  mes_competencia: "2026-07-01",
  observacoes: null,
  fornecedores: { razao_social: "BRITAM", nome_fantasia: null },
  categorias_financeiras: { nome: "Materiais" },
  cotacoes: { numero: "COT-2026-0003" },
  condicoes_pagamento: { descricao: "À Vista" },
  oc_itens: [
    {
      id: "9f1b7c2e-6d3a-4f58-9b0e-1c2d3e4f5a6b",
      quantidade: 10,
      preco_unitario: 10000,
      centro_custo_id: "3b1f7c2e-6d3a-4f58-9b0e-1c2d3e4f5a01",
      insumos: { nome: "Pedra brita 1", unidades_medida: { sigla: "m3" } },
      centros_custo: { nome: "009 - Lote 09", codigo: "009" },
    },
  ],
  oc_parcelas: [
    { numero_parcela: 1, data_vencimento: "2026-08-31", valor: "100000.00" },
  ],
};

describe("montarEspelhoOrdem", () => {
  it("traz o cabeçalho da OC", () => {
    const espelho = montarEspelhoOrdem(LINHA);
    expect(espelho.numero).toBe("OC-2026-0001");
    expect(espelho.fornecedorNome).toBe("BRITAM");
    expect(espelho.categoriaNome).toBe("Materiais");
    expect(espelho.cotacaoNumero).toBe("COT-2026-0003");
    expect(espelho.condicaoDescricao).toBe("À Vista");
    expect(espelho.valorTotal).toBe(100000);
  });

  it("traz frete, impostos e desconto, que ficam FORA do valor total", () => {
    // Se o papel não mostrar isto, quem lê não tem como saber que a OC teve
    // R$ 500 de frete: valor_total é só a soma dos itens, por trigger.
    const espelho = montarEspelhoOrdem(LINHA);
    expect(espelho.frete).toBe(500);
    expect(espelho.outrasDespesas).toBe(0);
    expect(espelho.impostos).toBe(0);
    expect(espelho.desconto).toBe(0);
  });

  it("calcula o subtotal do item, porque não é coluna do banco", () => {
    const [item] = montarEspelhoOrdem(LINHA).itens;
    expect(item.insumoNome).toBe("Pedra brita 1");
    expect(item.unidade).toBe("m3");
    expect(item.quantidade).toBe(10);
    expect(item.precoUnitario).toBe(10000);
    expect(item.subtotal).toBe(100000);
    expect(item.centroCustoNome).toBe("009 - Lote 09");
  });

  it("os itens somam o valor total, que é o que a trigger mantém", () => {
    const espelho = montarEspelhoOrdem(LINHA);
    const soma = espelho.itens.reduce((total, i) => total + i.subtotal, 0);
    expect(soma).toBe(espelho.valorTotal);
  });

  it("agrupa o rateio por centro de custo a partir dos itens", () => {
    // A OC não tem tabela de rateio: o centro mora no item. Dois itens do
    // mesmo centro viram UMA linha no papel.
    const espelho = montarEspelhoOrdem({
      ...LINHA,
      valor_total: "150000.00",
      oc_itens: [
        LINHA.oc_itens[0],
        {
          ...LINHA.oc_itens[0],
          id: "outro",
          quantidade: 5,
          preco_unitario: 10000,
        },
      ],
    });
    expect(espelho.rateios).toHaveLength(1);
    expect(espelho.rateios[0].centroNome).toBe("009 - Lote 09");
    expect(espelho.rateios[0].valor).toBe(150000);
  });

  it("dois itens em centros DIFERENTES com o mesmo nome não podem virar uma linha só", () => {
    // centros_custo não tem unicidade em nome: é árvore Obra > Etapa > Item,
    // e dois nós de nível 3 em obras diferentes podem se chamar igual (ex:
    // dois "Diesel"). Agrupar por NOME juntaria custo de duas obras numa
    // linha só no papel, sem nada revelar que aconteceu — por isso o
    // agrupamento tem que usar centro_custo_id, nunca o nome.
    const espelho = montarEspelhoOrdem({
      ...LINHA,
      valor_total: "150000.00",
      oc_itens: [
        {
          ...LINHA.oc_itens[0],
          centro_custo_id: "aaaaaaaa-0000-4000-8000-000000000001",
          centros_custo: { nome: "Diesel", codigo: "001" },
        },
        {
          ...LINHA.oc_itens[0],
          id: "outro",
          quantidade: 5,
          preco_unitario: 10000,
          centro_custo_id: "bbbbbbbb-0000-4000-8000-000000000002",
          centros_custo: { nome: "Diesel", codigo: "002" },
        },
      ],
    });
    expect(espelho.rateios).toHaveLength(2);
    expect(espelho.rateios.reduce((soma, r) => soma + r.valor, 0)).toBe(
      150000,
    );
  });

  it("traz as parcelas previstas da OC", () => {
    const [parcela] = montarEspelhoOrdem(LINHA).parcelas;
    expect(parcela.numeroParcela).toBe(1);
    expect(parcela.dataVencimento).toBe("2026-08-31");
    expect(parcela.valor).toBe(100000);
  });

  it("item sem insumo, sem unidade ou sem centro não quebra o papel", () => {
    const espelho = montarEspelhoOrdem({
      ...LINHA,
      oc_itens: [
        {
          ...LINHA.oc_itens[0],
          centro_custo_id: null,
          insumos: null,
          centros_custo: null,
        },
      ],
    });
    expect(espelho.itens[0].insumoNome).toBeNull();
    expect(espelho.itens[0].unidade).toBeNull();
    // Mesmo texto de detalharLancamentosParaPlanilha e do espelho de
    // lançamento: os dois não podem divergir sobre a mesma ausência.
    expect(espelho.itens[0].centroCustoNome).toBe("Sem centro de custo");
  });

  it("dois itens sem centro colapsam na mesma linha 'Sem centro de custo'", () => {
    // centro_custo_id null usa uma chave-sentinela no agrupamento: sem ela,
    // cada item sem centro viraria a sua própria linha de rateio.
    const espelho = montarEspelhoOrdem({
      ...LINHA,
      valor_total: "150000.00",
      oc_itens: [
        {
          ...LINHA.oc_itens[0],
          centro_custo_id: null,
          centros_custo: null,
        },
        {
          ...LINHA.oc_itens[0],
          id: "outro",
          quantidade: 5,
          preco_unitario: 10000,
          centro_custo_id: null,
          centros_custo: null,
        },
      ],
    });
    expect(espelho.rateios).toHaveLength(1);
    expect(espelho.rateios[0].centroNome).toBe("Sem centro de custo");
    expect(espelho.rateios[0].valor).toBe(150000);
  });

  it("OC sem item e sem parcela sai com listas vazias, não com erro", () => {
    const espelho = montarEspelhoOrdem({
      ...LINHA,
      oc_itens: [],
      oc_parcelas: [],
    });
    expect(espelho.itens).toEqual([]);
    expect(espelho.parcelas).toEqual([]);
    expect(espelho.rateios).toEqual([]);
  });

  it("quantidade é numeric(14,3) e não perde a terceira casa", () => {
    const espelho = montarEspelhoOrdem({
      ...LINHA,
      oc_itens: [{ ...LINHA.oc_itens[0], quantidade: "10.125" }],
    });
    expect(espelho.itens[0].quantidade).toBe(10.125);
  });

  it("prefere o nome fantasia do fornecedor quando ele existe", () => {
    const espelho = montarEspelhoOrdem({
      ...LINHA,
      fornecedores: {
        razao_social: "BRITAS DA AMAZONIA LTDA",
        nome_fantasia: "BRITAM",
      },
    });
    expect(espelho.fornecedorNome).toBe("BRITAM");
  });
});
