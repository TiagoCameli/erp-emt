// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  COLUNAS_PLANILHA_FRETE,
  indicePorNome,
  lerDataPlanilha,
  lerNumeroPlanilha,
  validarLinhaFrete,
  type CadastrosImportacao,
  type LinhaPlanilhaFrete,
} from "@/modules/frete/fretes/importacao";

const L1 = "11111111-1111-4111-8111-111111111111";
const L2 = "22222222-2222-4222-8222-222222222222";
const T = "33333333-3333-4333-8333-333333333333";
const I = "44444444-4444-4444-8444-444444444444";
const O = "55555555-5555-4555-8555-555555555555";

const CADASTROS: CadastrosImportacao = {
  localidades: indicePorNome([
    { id: L1, nome: "Pedreira Britam" },
    { id: L2, nome: "Canteiro BR-364" },
  ]),
  transportadoras: indicePorNome([{ id: T, nome: "ETAM" }]),
  insumos: indicePorNome([{ id: I, nome: "Brita 1" }]),
  obras: indicePorNome([{ id: O, nome: "Lote 09" }]),
};

const LINHA: Partial<LinhaPlanilhaFrete> = {
  dataSaida: "20/09/2026",
  dataChegada: null,
  origem: "pedreira britam",
  destino: "Canteiro BR-364",
  transportadora: "etam",
  motorista: "João",
  material: "BRITA 1",
  peso: 32.5,
  km: "120",
  valorTkm: "0,37",
  obra: "lote 09",
  nf: "123",
  placa: "abc1d23",
  observacoes: null,
};

describe("modelo da origem", () => {
  it("as colunas do template_fretes.xlsx, na ordem", () => {
    expect(COLUNAS_PLANILHA_FRETE.map((c) => c.rotulo)).toEqual([
      "Data Saída",
      "Data Chegada",
      "Origem",
      "Destino",
      "Transportadora",
      "Motorista",
      "Material",
      "Peso (t)",
      "KM",
      "R$/TKM",
      "Obra",
      "NF",
      "Placa Carreta",
      "Observações",
    ]);
  });
});

describe("parsers", () => {
  it("datas: serial do Excel, Date, AAAA-M-D e D/M/AAAA", () => {
    expect(lerDataPlanilha(46285)).toBe("2026-09-20");
    expect(lerDataPlanilha(new Date(Date.UTC(2026, 8, 20)))).toBe("2026-09-20");
    expect(lerDataPlanilha("2026-9-5")).toBe("2026-09-05");
    expect(lerDataPlanilha("5/9/2026")).toBe("2026-09-05");
    expect(lerDataPlanilha("31/02/2026")).toBeNull();
    expect(lerDataPlanilha("amanhã")).toBeNull();
  });

  it("números: o do Excel direto; texto no padrão do ERP (a origem lia 1.234,56 como 1,234)", () => {
    expect(lerNumeroPlanilha(32.5)).toBe(32.5);
    expect(lerNumeroPlanilha("1.234,56")).toBe(1234.56);
    expect(lerNumeroPlanilha("0,37")).toBe(0.37);
    expect(lerNumeroPlanilha("abc")).toBeNull();
  });
});

describe("validarLinhaFrete", () => {
  it("linha boa vira frete de material com valor do material zero", () => {
    const { erros, frete } = validarLinhaFrete(LINHA, CADASTROS);
    expect(erros).toEqual([]);
    expect(frete).toMatchObject({
      tipo: "material",
      data: "2026-09-20",
      dataChegada: null,
      origemLocalidadeId: L1,
      destinoLocalidadeId: L2,
      transportadoraId: T,
      insumoId: I,
      centroCustoId: O,
      pesoToneladas: 32.5,
      kmRodados: 120,
      valorTkm: 0.37,
      valorUnitarioMaterial: 0,
      notaFiscal: "123",
      notaFiscal2: null,
      placaCarreta: "ABC1D23",
    });
  });

  it("as mensagens da origem para o que falta", () => {
    const { erros, frete } = validarLinhaFrete({}, CADASTROS);
    expect(frete).toBeNull();
    expect(erros).toEqual(
      expect.arrayContaining([
        "Falta data",
        "Falta origem",
        "Falta destino",
        "Falta transportadora",
        "Falta motorista",
        "Falta material",
        "Falta peso",
        "Falta KM",
        "Falta R$/TKM",
        "Falta obra",
      ]),
    );
  });

  it("nome que não casa com o cadastro é erro da linha", () => {
    const { erros } = validarLinhaFrete(
      { ...LINHA, material: "Areia", origem: "Pedreira Nova", transportadora: "Outra", obra: "Lote 99" },
      CADASTROS,
    );
    expect(erros).toEqual(
      expect.arrayContaining([
        'Material "Areia" nao encontrado',
        'Origem "Pedreira Nova" nao encontrada',
        'Transportadora "Outra" nao encontrado',
        'Obra "Lote 99" nao encontrada',
      ]),
    );
  });

  it("peso zero, placa inválida", () => {
    const { erros } = validarLinhaFrete({ ...LINHA, peso: 0, placa: "XX" }, CADASTROS);
    expect(erros).toEqual(expect.arrayContaining(["Peso deve ser > 0", "Placa inválida (ex: ABC-1D34)"]));
  });
});
