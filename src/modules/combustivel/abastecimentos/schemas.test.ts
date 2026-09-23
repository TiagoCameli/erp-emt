// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  tipoMedicaoDoControle,
  valoresDoAbastecimento,
  valoresNovoAbastecimento,
} from "@/modules/combustivel/abastecimentos/formulario";
import { obrasParaAlocacao } from "@/modules/combustivel/abastecimentos/opcoes";
import type { AbastecimentoCompleto } from "@/modules/combustivel/abastecimentos/queries";
import {
  montarDadosSaida,
  previaValorSaida,
  regrasSaida,
  saidaDoForm,
  saidaFormSchema,
  saidaSchema,
  type SaidaFormInput,
  type SaidaInput,
} from "@/modules/combustivel/abastecimentos/schemas";

const TANQUE = "11111111-1111-4111-8111-111111111111";
const EQUIP = "22222222-2222-4222-8222-222222222222";
const TRANSP = "33333333-3333-4333-8333-333333333333";
const DIESEL = "44444444-4444-4444-8444-444444444444";
const OBRA = "55555555-5555-4555-8555-555555555555";
const OUTRA_OBRA = "66666666-6666-4666-8666-666666666666";
const DATA = "2026-09-20T14:30:00-05:00";

function entrada(troca: Partial<SaidaInput> = {}): SaidaInput {
  return {
    origem: "tanque",
    tipoConsumidor: "equipamento_proprio",
    tanqueId: TANQUE,
    equipamentoId: EQUIP,
    transportadoraId: null,
    placa: null,
    motorista: null,
    insumoId: null,
    litros: 150.5,
    precoCombustivel: null,
    precoProprietario: null,
    taxaLitro: null,
    precoUnitario: null,
    pago: false,
    pagoEm: null,
    medicao: null,
    tipoMedicao: null,
    dataHora: DATA,
    obraId: null,
    manterAlocacoes: false,
    observacoes: null,
    ...troca,
  };
}

const EMT = { tanqueExterno: false, equipamentoTemEtapa: true };
const EXTERNO = { tanqueExterno: true, equipamentoTemEtapa: true };

function mensagens(d: SaidaInput, ctx = EMT) {
  return regrasSaida(d, ctx).map((p) => `${p.campo}: ${p.mensagem}`);
}

describe("montarDadosSaida: cada consumidor × origem", () => {
  it("equipamento próprio no tanque da EMT: sem preço nenhum (é o PEPS)", () => {
    const d = entrada({ precoCombustivel: 9, taxaLitro: 1, precoUnitario: 7, medicao: 1234.5, tipoMedicao: "horimetro" });
    const dados = montarDadosSaida(d, { tanqueExterno: false });
    expect(dados).toEqual({
      origem: "tanque",
      tipo_consumidor: "equipamento_proprio",
      tanque_id: TANQUE,
      equipamento_id: EQUIP,
      transportadora_id: null,
      placa: null,
      motorista: null,
      insumo_id: null,
      litros: 150.5,
      preco_combustivel: null,
      preco_proprietario: null,
      taxa_litro: 0,
      preco_unitario: null,
      pago: false,
      pago_em: null,
      medicao: 1234.5,
      tipo_medicao: "horimetro",
      data: DATA,
      canal: "computador",
      observacoes: null,
      alocacoes: [],
    });
    expect(previaValorSaida(dados)).toBeNull();
  });

  it("equipamento próprio no posto em dinheiro: preço por litro, sem tanque", () => {
    const dados = montarDadosSaida(
      entrada({ origem: "dinheiro", tanqueId: TANQUE, insumoId: DIESEL, precoUnitario: 6.3947, pago: true, pagoEm: "2026-09-20" }),
      { tanqueExterno: false },
    );
    expect(dados).toMatchObject({
      origem: "dinheiro",
      tanque_id: null,
      insumo_id: DIESEL,
      preco_unitario: 6.3947,
      preco_combustivel: null,
      taxa_litro: 0,
      // Pago é só da requisição.
      pago: false,
      pago_em: null,
    });
    expect(previaValorSaida(dados)).toBe(962.4024);
  });

  it("requisição: preço por litro, pago e data do pagamento", () => {
    const pago = montarDadosSaida(
      entrada({ origem: "requisicao", insumoId: DIESEL, precoUnitario: 6.5, pago: true, pagoEm: "2026-09-22" }),
      { tanqueExterno: false },
    );
    expect(pago).toMatchObject({ origem: "requisicao", tanque_id: null, preco_unitario: 6.5, pago: true, pago_em: "2026-09-22" });

    const aPagar = montarDadosSaida(
      entrada({ origem: "requisicao", insumoId: DIESEL, precoUnitario: 6.5, pago: false, pagoEm: "2026-09-22" }),
      { tanqueExterno: false },
    );
    expect(aPagar).toMatchObject({ pago: false, pago_em: null });
  });

  it("carreta em tanque externo: dois preços e a taxa; o do dono vazio repete o cobrado", () => {
    const base = entrada({
      tipoConsumidor: "carreta_transportadora",
      equipamentoId: EQUIP,
      transportadoraId: TRANSP,
      placa: "ABC1D23",
      motorista: "João",
      insumoId: DIESEL,
      precoCombustivel: 6.8,
      taxaLitro: 0.15,
      medicao: 999,
      tipoMedicao: "km",
    });
    const dados = montarDadosSaida(base, { tanqueExterno: true });
    expect(dados).toMatchObject({
      tipo_consumidor: "carreta_transportadora",
      tanque_id: TANQUE,
      equipamento_id: null,
      transportadora_id: TRANSP,
      placa: "ABC1D23",
      motorista: "João",
      insumo_id: DIESEL,
      preco_combustivel: 6.8,
      preco_proprietario: 6.8,
      taxa_litro: 0.15,
      preco_unitario: null,
      medicao: null,
      tipo_medicao: null,
    });
    expect(previaValorSaida(dados)).toBe(1045.975);

    const comDono = montarDadosSaida({ ...base, precoProprietario: 6.2 }, { tanqueExterno: true });
    expect(comDono.preco_proprietario).toBe(6.2);
  });

  it("carreta em tanque da EMT: preço opcional (vazio = PEPS) e sem preço do dono", () => {
    const semPreco = montarDadosSaida(
      entrada({ tipoConsumidor: "carreta_transportadora", transportadoraId: TRANSP, precoProprietario: 5, taxaLitro: 0.1 }),
      { tanqueExterno: false },
    );
    expect(semPreco).toMatchObject({ preco_combustivel: null, preco_proprietario: null, taxa_litro: 0.1 });
    expect(previaValorSaida(semPreco)).toBeNull();

    const comPreco = montarDadosSaida(
      entrada({ tipoConsumidor: "carreta_transportadora", transportadoraId: TRANSP, precoCombustivel: 6 }),
      { tanqueExterno: false },
    );
    expect(comPreco).toMatchObject({ preco_combustivel: 6, preco_proprietario: null, taxa_litro: 0 });
    expect(previaValorSaida(comPreco)).toBe(903);
  });

  it("carreta no posto: preço por litro, sem preços de tanque", () => {
    const dados = montarDadosSaida(
      entrada({ tipoConsumidor: "carreta_transportadora", transportadoraId: TRANSP, origem: "dinheiro", insumoId: DIESEL, precoUnitario: 7, precoCombustivel: 6, taxaLitro: 1 }),
      { tanqueExterno: false },
    );
    expect(dados).toMatchObject({ tanque_id: null, preco_unitario: 7, preco_combustivel: null, taxa_litro: 0 });
  });
});

describe("montarDadosSaida: alocação", () => {
  it("uma obra a 100%", () => {
    expect(montarDadosSaida(entrada({ obraId: OBRA }), { tanqueExterno: false }).alocacoes).toEqual([
      { centro_custo_id: OBRA, percentual: 100 },
    ]);
  });

  it("na edição, a etapa da origem sobrevive quando a obra não mudou, e cai quando mudou", () => {
    const originais = [{ centroCustoId: OBRA, percentual: 100, etapaLegado: "Terraplenagem" }];
    expect(
      montarDadosSaida(entrada({ obraId: OBRA }), { tanqueExterno: false, alocacoesOriginais: originais }).alocacoes,
    ).toEqual([{ centro_custo_id: OBRA, percentual: 100, etapa_legado: "Terraplenagem" }]);
    expect(
      montarDadosSaida(entrada({ obraId: OUTRA_OBRA }), { tanqueExterno: false, alocacoesOriginais: originais }).alocacoes,
    ).toEqual([{ centro_custo_id: OUTRA_OBRA, percentual: 100 }]);
  });

  it("várias alocações da migração ficam como estão", () => {
    const originais = [
      { centroCustoId: OBRA, percentual: 60, etapaLegado: "A" },
      { centroCustoId: OUTRA_OBRA, percentual: 40, etapaLegado: null },
    ];
    expect(
      montarDadosSaida(entrada({ manterAlocacoes: true }), { tanqueExterno: false, alocacoesOriginais: originais }).alocacoes,
    ).toEqual([
      { centro_custo_id: OBRA, percentual: 60, etapa_legado: "A" },
      { centro_custo_id: OUTRA_OBRA, percentual: 40 },
    ]);
  });
});

describe("regrasSaida (espelho do banco)", () => {
  it("equipamento próprio completo no tanque da EMT passa", () => {
    expect(mensagens(entrada())).toEqual([]);
  });

  it("equipamento próprio nunca usa tanque externo", () => {
    expect(mensagens(entrada({ insumoId: DIESEL }), EXTERNO)).toEqual([
      "tanqueId: Tanque externo é só para carreta de transportadora",
    ]);
  });

  it("carreta em tanque externo exige o preço cobrado e o combustível", () => {
    expect(mensagens(entrada({ tipoConsumidor: "carreta_transportadora", transportadoraId: TRANSP }), EXTERNO)).toEqual([
      "precoCombustivel: Informe o preço cobrado da transportadora",
      "insumoId: Selecione o combustível",
    ]);
  });

  it("carreta em tanque da EMT: preço é opcional; transportadora não", () => {
    expect(mensagens(entrada({ tipoConsumidor: "carreta_transportadora", transportadoraId: TRANSP }))).toEqual([]);
    expect(mensagens(entrada({ tipoConsumidor: "carreta_transportadora" }))).toEqual([
      "transportadoraId: Selecione a transportadora",
    ]);
  });

  it("posto exige preço por litro e combustível; tanque exige o tanque", () => {
    expect(mensagens(entrada({ origem: "requisicao", tanqueId: null }))).toEqual([
      "precoUnitario: Informe o preço por litro",
      "insumoId: Selecione o combustível",
    ]);
    expect(mensagens(entrada({ tanqueId: null }))).toEqual(["tanqueId: Selecione o tanque"]);
  });

  it("equipamento sem etapa (alugado) exige a obra; com obra ou alocações mantidas, passa", () => {
    const alugado = { tanqueExterno: false, equipamentoTemEtapa: false };
    expect(mensagens(entrada(), alugado)).toEqual([
      "obraId: Equipamento sem etapa própria: informe a obra onde ele trabalhou",
    ]);
    expect(mensagens(entrada({ obraId: OBRA }), alugado)).toEqual([]);
    expect(mensagens(entrada({ manterAlocacoes: true }), alugado)).toEqual([]);
    // Carreta nunca precisa de obra.
    expect(
      mensagens(entrada({ tipoConsumidor: "carreta_transportadora", transportadoraId: TRANSP }), alugado),
    ).toEqual([]);
  });
});

describe("schemas: 4 casas", () => {
  function form(troca: Partial<SaidaFormInput> = {}): SaidaFormInput {
    return {
      ...valoresNovoAbastecimento(new Date("2026-09-20T19:30:00Z")),
      tanqueId: TANQUE,
      equipamentoId: EQUIP,
      litros: "150,5",
      ...troca,
    };
  }

  it("preço e taxa aceitam 4 casas e recusam 5", () => {
    const carreta = { tipoConsumidor: "carreta_transportadora" as const, transportadoraId: TRANSP };
    expect(saidaFormSchema.safeParse(form({ ...carreta, precoCombustivel: "6,3947", taxaLitro: "0,1234" })).success).toBe(true);
    expect(saidaFormSchema.safeParse(form({ ...carreta, precoCombustivel: "6,39471" })).success).toBe(false);
    expect(saidaFormSchema.safeParse(form({ ...carreta, taxaLitro: "0,12345" })).success).toBe(false);
    expect(saidaFormSchema.safeParse(form({ litros: "1,12345" })).success).toBe(false);
    expect(saidaSchema.safeParse({ ...entrada(), precoUnitario: 6.39471 }).success).toBe(false);
    expect(saidaSchema.safeParse({ ...entrada(), litros: 0 }).success).toBe(false);
  });

  it("o formulário aponta a regra no campo certo", () => {
    const resultado = saidaFormSchema.safeParse(form({ tanqueExterno: true }));
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues.find((i) => i.path[0] === "tanqueId")?.message).toBe(
      "Tanque externo é só para carreta de transportadora",
    );
  });

  it("saidaDoForm: data de Rio Branco, placa em maiúscula, tanque só na origem tanque", () => {
    const d = saidaDoForm(
      form({ tipoConsumidor: "carreta_transportadora", transportadoraId: TRANSP, placa: " abc1d23 ", origem: "dinheiro", precoUnitario: "6,5" }),
    );
    expect(d.dataHora).toBe("2026-09-20T14:30:00-05:00");
    expect(d.placa).toBe("ABC1D23");
    expect(d.tanqueId).toBeNull();
    expect(d.precoUnitario).toBe(6.5);
    expect(saidaSchema.safeParse(d).success).toBe(true);
  });
});

describe("valores iniciais e opções", () => {
  it("tipo de medição só para horímetro e km", () => {
    expect(tipoMedicaoDoControle("horimetro")).toBe("horimetro");
    expect(tipoMedicaoDoControle("km")).toBe("km");
    expect(tipoMedicaoDoControle("nenhum")).toBe("");
    expect(tipoMedicaoDoControle(null)).toBe("");
  });

  it("editar volta ao formulário com a obra única ou mantendo várias", () => {
    const completo: AbastecimentoCompleto = {
      saida: {
        id: "77777777-7777-4777-8777-777777777777",
        data: "2026-09-20T19:30:00Z",
        origem: "tanque",
        tipoConsumidor: "carreta_transportadora",
        consumidor: "Transterra (ABC1D23)",
        tanqueId: TANQUE,
        tanqueNome: "Transterra",
        tanqueExterno: true,
        equipamentoId: null,
        equipamentoNome: null,
        equipamentoControlePor: null,
        transportadoraId: TRANSP,
        transportadoraNome: "Transterra",
        placa: "ABC1D23",
        motorista: null,
        insumoId: DIESEL,
        insumoNome: "Diesel S10",
        litros: 100,
        precoCombustivel: 6.8,
        precoProprietario: 6.2,
        taxaLitro: 0.15,
        precoUnitario: 6.95,
        precoMedioTanque: null,
        valorTotal: 695,
        pago: false,
        pagoEm: null,
        medicao: null,
        tipoMedicao: null,
        centroCustoNome: null,
        canal: "computador",
        observacoes: null,
      },
      camadas: [],
      movimentos: [],
      alocacoes: [{ id: "a", centroCustoId: OBRA, centroCustoNome: "009", percentual: 100, litros: 100, etapaLegado: null }],
      semSuprimento: null,
    };
    const valores = valoresDoAbastecimento(completo, true);
    expect(valores).toMatchObject({
      dataHora: "2026-09-20T14:30",
      precoCombustivel: "6,8",
      precoProprietario: "6,2",
      taxaLitro: "0,15",
      precoUnitario: "",
      obraId: OBRA,
      manterAlocacoes: false,
      tanqueExterno: true,
    });

    const varias = valoresDoAbastecimento(
      { ...completo, alocacoes: [...completo.alocacoes, { ...completo.alocacoes[0], id: "b", centroCustoId: OUTRA_OBRA }] },
      true,
    );
    expect(varias).toMatchObject({ obraId: "", manterAlocacoes: true });
  });

  it("alocação oferece só raízes de obra", () => {
    const centros = [
      { id: OBRA, nome: "BR-364", codigo: "009", paiId: null, tipo: "obra" },
      { id: "e", nome: "Escritório", codigo: "001", paiId: null, tipo: "escritorio" },
      { id: "m", nome: "Manutenção", codigo: "100", paiId: null, tipo: "manutencao" },
      { id: "x", nome: "Escavadeira", codigo: null, paiId: "m", tipo: null },
    ];
    expect(obrasParaAlocacao(centros).map((c) => c.id)).toEqual([OBRA]);
  });
});
