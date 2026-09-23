// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  acharDieselS10,
  linhasImpacto,
  taxaPadraoDaTransportadora,
  tipoCombustivelDoTanque,
  tipoMedicaoDoControle,
  valoresDoAbastecimento,
  valoresNovoAbastecimento,
} from "@/modules/combustivel/abastecimentos/formulario";
import { obrasParaAlocacao } from "@/modules/combustivel/abastecimentos/opcoes";
import type { AbastecimentoCompleto } from "@/modules/combustivel/abastecimentos/queries";
import {
  avisosDeConferencia,
  montarDadosSaida,
  precoUnitarioSaida,
  regrasSaida,
  saidaDoForm,
  saidaFormSchema,
  saidaSchema,
  saldoInsuficiente,
  tipoIncompativel,
  usaSnapshotSalvo,
  valorSaida,
  type SaidaFormInput,
  type SaidaInput,
} from "@/modules/combustivel/abastecimentos/schemas";

/**
 * As regras do SaidaCombustivelForm do Gestão Obras (schema + submit), caso a caso da
 * matriz consumidor × origem da origem.
 */

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
    insumoId: DIESEL,
    litros: 100,
    precoCombustivel: null,
    precoProprietario: null,
    taxaLitro: null,
    precoUnitario: null,
    pago: false,
    pagoEm: null,
    medicao: null,
    tipoMedicao: null,
    dataHora: DATA,
    obraId: OBRA,
    manterAlocacoes: false,
    observacoes: null,
    ...troca,
  };
}

const carreta = (troca: Partial<SaidaInput> = {}) =>
  entrada({ tipoConsumidor: "carreta_transportadora", equipamentoId: null, transportadoraId: TRANSP, placa: "ABC1D23", ...troca });

function mensagens(d: SaidaInput) {
  return regrasSaida(d).map((p) => `${p.campo}: ${p.mensagem}`);
}

describe("montarDadosSaida: a matriz consumidor × origem da origem", () => {
  it("carreta + tanque interno: unitário = preço + taxa; snapshot = FIFO; sem preço do dono", () => {
    const d = carreta({ precoCombustivel: 6.8, taxaLitro: 0.15 });
    const dados = montarDadosSaida(d, { tanqueExterno: false, precoMedioTanque: 6.2 });
    expect(dados).toMatchObject({
      origem: "tanque",
      tipo_consumidor: "carreta_transportadora",
      tanque_id: TANQUE,
      equipamento_id: null,
      transportadora_id: TRANSP,
      placa: "ABC1D23",
      preco_combustivel: 6.8,
      preco_proprietario: null,
      taxa_litro: 0.15,
      preco_unitario: 6.95,
      preco_medio_tanque: 6.2,
      medicao: null,
      alocacoes: [{ centro_custo_id: OBRA, percentual: 100 }],
    });
    expect(valorSaida(d, 6.2)).toBeCloseTo(695, 10);
  });

  it("carreta + tanque externo: preço do dono e taxa; o do dono vazio repete o cobrado", () => {
    const d = carreta({ precoCombustivel: 6.8, precoProprietario: 6.2, taxaLitro: 0.15 });
    const dados = montarDadosSaida(d, { tanqueExterno: true, precoMedioTanque: 0 });
    expect(dados).toMatchObject({ preco_combustivel: 6.8, preco_proprietario: 6.2, taxa_litro: 0.15, preco_unitario: 6.95 });
    expect(montarDadosSaida({ ...d, precoProprietario: null }, { tanqueExterno: true, precoMedioTanque: 0 }).preco_proprietario).toBe(6.8);
  });

  it("equipamento próprio + tanque: preço = o FIFO em TS (a taxa não conta, nem digitada)", () => {
    const d = entrada({ taxaLitro: 0.5, medicao: 1200, tipoMedicao: "horimetro" });
    const dados = montarDadosSaida(d, { tanqueExterno: false, precoMedioTanque: 6.3947 });
    expect(dados).toMatchObject({
      tanque_id: TANQUE,
      equipamento_id: EQUIP,
      transportadora_id: null,
      placa: null,
      preco_combustivel: 6.3947,
      preco_proprietario: null,
      taxa_litro: 0,
      preco_unitario: 6.3947,
      preco_medio_tanque: 6.3947,
      medicao: 1200,
      tipo_medicao: "horimetro",
    });
    expect(valorSaida(d, 6.3947)).toBeCloseTo(639.47, 10);
  });

  it("dinheiro: preço por litro digitado, sem tanque, sem snapshot, sem pago", () => {
    const d = entrada({ origem: "dinheiro", tanqueId: null, precoUnitario: 6.5, pago: true, pagoEm: "2026-09-21" });
    const dados = montarDadosSaida(d, { tanqueExterno: false, precoMedioTanque: 9.99 });
    expect(dados).toMatchObject({
      tanque_id: null,
      preco_unitario: 6.5,
      preco_combustivel: 6.5,
      preco_medio_tanque: null,
      pago: false,
      pago_em: null,
      taxa_litro: 0,
    });
    expect(valorSaida(d, 9.99)).toBe(650);
  });

  it("requisição: preço digitado; pago e pago em só aqui (o pago em vai mesmo sem o pago, como a origem)", () => {
    const d = entrada({ origem: "requisicao", tanqueId: null, precoUnitario: 6.5, pago: true, pagoEm: "2026-09-21" });
    expect(montarDadosSaida(d, { tanqueExterno: false, precoMedioTanque: 0 })).toMatchObject({
      pago: true,
      pago_em: "2026-09-21",
      preco_unitario: 6.5,
    });
    expect(montarDadosSaida({ ...d, pago: false }, { tanqueExterno: false, precoMedioTanque: 0 })).toMatchObject({
      pago: false,
      pago_em: "2026-09-21",
    });
  });

  it("carreta no posto: preço digitado; a taxa vai no payload mas não soma no preço", () => {
    const d = carreta({ origem: "dinheiro", tanqueId: null, precoUnitario: 6.5, precoCombustivel: 9, taxaLitro: 0.15 });
    const dados = montarDadosSaida(d, { tanqueExterno: false, precoMedioTanque: 0 });
    expect(dados).toMatchObject({
      tanque_id: null,
      preco_unitario: 6.5,
      preco_combustivel: null,
      preco_proprietario: null,
      preco_medio_tanque: null,
      taxa_litro: 0.15,
    });
    expect(precoUnitarioSaida(d, 0)).toBe(6.5);
  });
});

describe("montarDadosSaida: alocação", () => {
  it("uma obra a 100%", () => {
    expect(montarDadosSaida(entrada(), { tanqueExterno: false, precoMedioTanque: 0 }).alocacoes).toEqual([
      { centro_custo_id: OBRA, percentual: 100 },
    ]);
  });

  it("na edição, a etapa da origem sobrevive quando a obra não mudou, e cai quando mudou", () => {
    const originais = [{ centroCustoId: OBRA, percentual: 100, etapaLegado: "Terraplenagem" }];
    const ctx = { tanqueExterno: false, precoMedioTanque: 0, alocacoesOriginais: originais };
    expect(montarDadosSaida(entrada(), ctx).alocacoes).toEqual([
      { centro_custo_id: OBRA, percentual: 100, etapa_legado: "Terraplenagem" },
    ]);
    expect(montarDadosSaida(entrada({ obraId: OUTRA_OBRA }), ctx).alocacoes).toEqual([
      { centro_custo_id: OUTRA_OBRA, percentual: 100 },
    ]);
  });

  it("várias alocações da migração ficam como estão", () => {
    const originais = [
      { centroCustoId: OBRA, percentual: 60, etapaLegado: "A" },
      { centroCustoId: OUTRA_OBRA, percentual: 40, etapaLegado: null },
    ];
    const dados = montarDadosSaida(entrada({ obraId: null, manterAlocacoes: true }), {
      tanqueExterno: false,
      precoMedioTanque: 0,
      alocacoesOriginais: originais,
    });
    expect(dados.alocacoes).toEqual([
      { centro_custo_id: OBRA, percentual: 60, etapa_legado: "A" },
      { centro_custo_id: OUTRA_OBRA, percentual: 40 },
    ]);
  });
});

describe("regrasSaida (schema da origem)", () => {
  it("equipamento próprio completo no tanque passa", () => {
    expect(mensagens(entrada())).toEqual([]);
  });

  it("a obra é sempre obrigatória (na origem, obra + etapa); alocações mantidas passam", () => {
    expect(mensagens(entrada({ obraId: null }))).toEqual(["obraId: Selecione a obra"]);
    expect(mensagens(carreta({ obraId: null, precoCombustivel: 6.8 }))).toEqual(["obraId: Selecione a obra"]);
    expect(mensagens(entrada({ obraId: null, manterAlocacoes: true }))).toEqual([]);
  });

  it("carreta no tanque exige o preço > 0, no tanque da EMT e no externo", () => {
    const esperado = ["precoCombustivel: Informe o preço cobrado da transportadora, maior que zero"];
    expect(mensagens(carreta())).toEqual(esperado);
    expect(mensagens(carreta({ precoCombustivel: 0 }))).toEqual(esperado);
    expect(mensagens(carreta({ precoCombustivel: 6.8 }))).toEqual([]);
  });

  it("carreta exige a transportadora; equipamento próprio, o equipamento", () => {
    expect(mensagens(carreta({ transportadoraId: null, precoCombustivel: 6.8 }))).toEqual([
      "transportadoraId: Selecione a transportadora",
    ]);
    expect(mensagens(entrada({ equipamentoId: null }))).toEqual(["equipamentoId: Selecione o equipamento"]);
  });

  it("posto exige preço por litro > 0; tanque exige o tanque; o combustível é sempre obrigatório", () => {
    expect(mensagens(entrada({ origem: "dinheiro", tanqueId: null }))).toEqual([
      "precoUnitario: Informe o preço por litro, maior que zero",
    ]);
    expect(mensagens(entrada({ origem: "requisicao", tanqueId: null, precoUnitario: 0 }))).toEqual([
      "precoUnitario: Informe o preço por litro, maior que zero",
    ]);
    expect(mensagens(entrada({ tanqueId: null }))).toEqual(["tanqueId: Selecione o tanque"]);
    expect(mensagens(entrada({ insumoId: null }))).toEqual(["insumoId: Selecione o combustível"]);
  });

  it("não recusa tanque externo para equipamento próprio (na origem quem esconde é a tela)", () => {
    expect(mensagens(entrada())).toEqual([]);
  });
});

describe("regras de tela da origem", () => {
  it("snapshot: edição sem trocar tanque nem origem, com snapshot > 0, usa o salvo", () => {
    const salvo = { tanqueId: TANQUE, origem: "tanque", precoMedioTanque: 6.1 };
    expect(usaSnapshotSalvo(salvo, { tanqueId: TANQUE, origem: "tanque" })).toBe(true);
    expect(usaSnapshotSalvo(salvo, { tanqueId: "outro", origem: "tanque" })).toBe(false);
    expect(usaSnapshotSalvo(salvo, { tanqueId: TANQUE, origem: "dinheiro" })).toBe(false);
    expect(usaSnapshotSalvo({ ...salvo, precoMedioTanque: 0 }, { tanqueId: TANQUE, origem: "tanque" })).toBe(false);
    expect(usaSnapshotSalvo({ ...salvo, precoMedioTanque: null }, { tanqueId: TANQUE, origem: "tanque" })).toBe(false);
    expect(usaSnapshotSalvo(null, { tanqueId: TANQUE, origem: "tanque" })).toBe(false);
  });

  it("combustível incompatível: só no tanque da EMT com tipo conhecido e diferente", () => {
    const base = { origem: "tanque" as const, temTanque: true, tanqueEhExterno: false, tipoDoTanque: DIESEL, tipoDaSaida: "s500" };
    expect(tipoIncompativel(base)).toBe(true);
    expect(tipoIncompativel({ ...base, tipoDaSaida: DIESEL })).toBe(false);
    expect(tipoIncompativel({ ...base, tanqueEhExterno: true })).toBe(false);
    expect(tipoIncompativel({ ...base, tipoDoTanque: "" })).toBe(false);
    expect(tipoIncompativel({ ...base, origem: "dinheiro" })).toBe(false);
  });

  it("saldo insuficiente na data: só no tanque da EMT", () => {
    const base = { origem: "tanque" as const, temTanque: true, tanqueEhExterno: false, litros: 500.01, saldoNaData: 500 };
    expect(saldoInsuficiente(base)).toBe(true);
    expect(saldoInsuficiente({ ...base, litros: 500 })).toBe(false);
    expect(saldoInsuficiente({ ...base, tanqueEhExterno: true })).toBe(false);
    expect(saldoInsuficiente({ ...base, origem: "requisicao" })).toBe(false);
  });

  it("avisos: 1.000 L ou mais, R$ 10.000 ou mais", () => {
    expect(avisosDeConferencia(999, 9999)).toEqual([]);
    expect(avisosDeConferencia(1000, 10000)).toHaveLength(2);
    expect(avisosDeConferencia(1000, 10000)[0]).toMatch(/volume alto/);
  });
});

describe("formulário: preenchimentos da origem", () => {
  it("taxa vem da TRANSPORTADORA (taxa_litro_padrao), zero inclusive; sem número, não mexe", () => {
    const transportadoras = [
      { id: TRANSP, taxaLitroPadrao: 0.15 },
      { id: "zero", taxaLitroPadrao: 0 },
      { id: "sem", taxaLitroPadrao: null },
    ];
    expect(taxaPadraoDaTransportadora(transportadoras, TRANSP)).toBe(0.15);
    expect(taxaPadraoDaTransportadora(transportadoras, "zero")).toBe(0);
    expect(taxaPadraoDaTransportadora(transportadoras, "sem")).toBeNull();
    expect(taxaPadraoDaTransportadora(transportadoras, "nao-existe")).toBeNull();
  });

  it("tipo do tanque: externo = Diesel S10; da EMT = o da entrada mais nova; sem entrada, vazio", () => {
    const insumos = [
      { id: "s500", nome: "Diesel S500" },
      { id: DIESEL, nome: " DIESEL S10 " },
    ];
    const dieselS10Id = acharDieselS10(insumos)?.id ?? null;
    expect(dieselS10Id).toBe(DIESEL);
    const porTanque = { [TANQUE]: "s500" };
    expect(
      tipoCombustivelDoTanque({ noTanque: true, tanque: { id: "ext", ehExterno: true }, dieselS10Id, combustivelPorTanque: porTanque }),
    ).toBe(DIESEL);
    expect(
      tipoCombustivelDoTanque({ noTanque: true, tanque: { id: TANQUE, ehExterno: false }, dieselS10Id, combustivelPorTanque: porTanque }),
    ).toBe("s500");
    expect(
      tipoCombustivelDoTanque({ noTanque: true, tanque: { id: "vazio", ehExterno: false }, dieselS10Id, combustivelPorTanque: porTanque }),
    ).toBe("");
    expect(
      tipoCombustivelDoTanque({ noTanque: false, tanque: { id: TANQUE, ehExterno: false }, dieselS10Id, combustivelPorTanque: porTanque }),
    ).toBe("");
  });

  it("impacto financeiro: tanque externo tem crédito do dono, débito e margem; da EMT, débito e estoque", () => {
    const externo = linhasImpacto({
      carreta: true,
      noTanque: true,
      tanque: { nome: "Transterra", externo: true, donoNome: "Areacre" },
      transportadoraNome: "Transterra",
      litros: 100,
      valorTotal: 695,
      precoProprietario: 6.2,
      taxa: 0.15,
    });
    expect(externo.map((l) => l.texto)).toEqual([
      expect.stringMatching(/^Crédito Areacre: R\$\s635,00$/),
      expect.stringMatching(/^Débito Transterra: R\$\s695,00$/),
      expect.stringMatching(/^Margem EMT \(combustível\): R\$\s60,00$/),
    ]);
    const emt = linhasImpacto({
      carreta: true,
      noTanque: true,
      tanque: { nome: "Tanque 1", externo: false, donoNome: null },
      transportadoraNome: "Transterra",
      litros: 100,
      valorTotal: 695,
      precoProprietario: 0,
      taxa: 0.15,
    });
    expect(emt.map((l) => l.texto)).toEqual([expect.stringMatching(/^Débito Transterra/), "Estoque tanque Tanque 1: −100 L"]);
    expect(
      linhasImpacto({
        carreta: false,
        noTanque: true,
        tanque: { nome: "Tanque 1", externo: false, donoNome: null },
        transportadoraNome: null,
        litros: 0,
        valorTotal: 0,
        precoProprietario: 0,
        taxa: 0,
      }),
    ).toEqual([]);
  });
});

describe("schemas: 4 casas e formulário", () => {
  function form(troca: Partial<SaidaFormInput> = {}): SaidaFormInput {
    return {
      ...valoresNovoAbastecimento(new Date("2026-09-20T19:30:00Z")),
      tanqueId: TANQUE,
      equipamentoId: EQUIP,
      insumoId: DIESEL,
      obraId: OBRA,
      litros: "150,5",
      ...troca,
    };
  }

  it("preço e taxa aceitam 4 casas e recusam 5", () => {
    const deCarreta = { tipoConsumidor: "carreta_transportadora" as const, transportadoraId: TRANSP };
    expect(saidaFormSchema.safeParse(form({ ...deCarreta, precoCombustivel: "6,3947", taxaLitro: "0,1234" })).success).toBe(true);
    expect(saidaFormSchema.safeParse(form({ ...deCarreta, precoCombustivel: "6,39471" })).success).toBe(false);
    expect(saidaFormSchema.safeParse(form({ ...deCarreta, precoCombustivel: "6,8", taxaLitro: "0,12345" })).success).toBe(false);
    expect(saidaFormSchema.safeParse(form({ litros: "1,12345" })).success).toBe(false);
    expect(saidaSchema.safeParse({ ...entrada(), precoUnitario: 6.39471 }).success).toBe(false);
    expect(saidaSchema.safeParse({ ...entrada(), litros: 0 }).success).toBe(false);
  });

  it("o formulário aponta a regra no campo certo", () => {
    const resultado = saidaFormSchema.safeParse(form({ obraId: "" }));
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues.find((i) => i.path[0] === "obraId")?.message).toBe("Selecione a obra");
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

  it("editar volta ao formulário com os preços salvos e a obra única, ou mantendo várias", () => {
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
    expect(valoresDoAbastecimento(completo)).toMatchObject({
      dataHora: "2026-09-20T14:30",
      insumoId: DIESEL,
      precoCombustivel: "6,8",
      precoProprietario: "6,2",
      taxaLitro: "0,15",
      precoUnitario: "",
      obraId: OBRA,
      manterAlocacoes: false,
      tanqueExterno: true,
    });

    const varias = valoresDoAbastecimento({
      ...completo,
      alocacoes: [...completo.alocacoes, { ...completo.alocacoes[0], id: "b", centroCustoId: OUTRA_OBRA }],
    });
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
