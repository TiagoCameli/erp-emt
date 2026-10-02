// @vitest-environment node
import { describe, expect, it } from "vitest";

import { totaisDosFretes } from "@/modules/frete/fretes/calculo";
import {
  FILTROS_VAZIOS,
  filtrarFretes,
  filtrarFretesFacetado,
  lerFiltrosFretes,
  normalizarPlaca,
  periodoEsteMes,
  periodoEstaSemana,
  periodoMesPassado,
  presetAtivo,
  topTransportadoras,
} from "@/modules/frete/fretes/filtros";
import { frete } from "@/modules/frete/fretes/fixture-frete";

const UUID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const UUID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("rodapé Totais (utils/freteTotais.ts)", () => {
  it("soma peso, valor e material; o preço médio exclui quem não tem material", () => {
    const t = totaisDosFretes([
      frete({ pesoToneladas: 10, valorTotal: 370, valorMaterial: 800 }),
      frete({ pesoToneladas: 30, valorTotal: 1110, valorMaterial: 3000 }),
      frete({ tipo: "transferencia", pesoToneladas: 20, valorTotal: 500, valorMaterial: 0 }),
    ]);
    expect(t.quantidade).toBe(3);
    expect(t.peso).toBe(60);
    expect(t.valor).toBe(1980);
    expect(t.valorMaterial).toBe(3800);
    expect(t.pesoComMaterial).toBe(40);
    expect(t.precoMedioMaterial).toBe(3800 / 40);
  });

  it("sem material nenhum, preço médio zero", () => {
    expect(totaisDosFretes([frete({ valorMaterial: 0 })]).precoMedioMaterial).toBe(0);
    expect(totaisDosFretes([]).peso).toBe(0);
  });

  it("peso de 4 casas soma sem erro de ponto flutuante", () => {
    expect(totaisDosFretes([frete({ pesoToneladas: 0.1 }), frete({ pesoToneladas: 0.2 })]).peso).toBe(0.3);
  });
});

describe("lerFiltrosFretes", () => {
  it("lê as chaves e ignora o inválido", () => {
    const f = lerFiltrosFretes({
      busca: "12",
      tipo: "transferencia",
      obra: UUID_A,
      transportadora: "nao-e-uuid",
      de: "2026-09-01",
      ate: "2026-02-30",
      material: UUID_B,
      sem_chegada: "sim",
      excluidos: "sim",
    });
    expect(f).toMatchObject({
      busca: "12",
      tipo: "transferencia",
      obraId: UUID_A,
      transportadoraId: "",
      de: "2026-09-01",
      ate: "",
      insumoId: UUID_B,
      semChegada: true,
      excluidos: true,
    });
    expect(lerFiltrosFretes({ tipo: "outro" }).tipo).toBe("");
  });

  it("placa sai da URL normalizada", () => {
    expect(lerFiltrosFretes({ placa: " sqs-7e71 " }).placa).toBe("SQS7E71");
    expect(lerFiltrosFretes({}).placa).toBe("");
  });
});

describe("filtro de placa", () => {
  const lista = [
    frete({ id: "a", placaCarreta: "SQS7E71" }),
    frete({ id: "b", placaCarreta: "SQS7E01" }),
    frete({ id: "c", placaCarreta: "sqs-7e71" }),
    frete({ id: "d", placaCarreta: null }),
  ];
  const ids = (placa: string) => filtrarFretes(lista, { ...FILTROS_VAZIOS, placa }).map((x) => x.id);

  it("casa a placa inteira, sem diferenciar grafia, e não por pedaço", () => {
    expect(ids("SQS7E71")).toEqual(["a", "c"]);
    expect(ids("SQS7E01")).toEqual(["b"]);
    expect(ids("SQS7E")).toEqual([]);
  });

  it("sem placa no filtro, todos passam (inclusive quem não tem placa)", () => {
    expect(ids("")).toEqual(["a", "b", "c", "d"]);
  });

  it("normalizarPlaca", () => {
    expect(normalizarPlaca("abc 1.d-23")).toBe("ABC1D23");
    expect(normalizarPlaca(null)).toBe("");
  });
});

describe("filtrarFretes (FreteListV2)", () => {
  const lista = [
    frete({ id: "a", notaFiscal: "NF-100", data: "2026-09-01", motorista: "Carlos", dataChegada: "2026-09-02" }),
    frete({ id: "b", notaFiscal: null, notaFiscal2: "100", data: "2026-09-05", tipo: "transferencia", transportadoraId: "t2" }),
    frete({ id: "c", notaFiscal: "200", data: "2026-09-09", origemId: "o2", destinoId: "d2", insumoId: "i2" }),
  ];
  const ids = (f: Partial<typeof FILTROS_VAZIOS>) => filtrarFretes(lista, { ...FILTROS_VAZIOS, ...f }).map((x) => x.id);

  it("busca só na NF 1, sem diferenciar maiúscula", () => {
    expect(ids({ busca: "nf-1" })).toEqual(["a"]);
    expect(ids({ busca: "100" })).toEqual(["a"]);
  });

  it("período inclusivo na data de saída", () => {
    expect(ids({ de: "2026-09-05", ate: "2026-09-09" })).toEqual(["b", "c"]);
  });

  it("sem chegada esconde quem tem chegada", () => {
    expect(ids({ semChegada: true })).toEqual(["b", "c"]);
  });

  it("tipo, transportadora, motorista (substring), material, origem e destino", () => {
    expect(ids({ tipo: "transferencia" })).toEqual(["b"]);
    expect(ids({ transportadoraId: "t2" })).toEqual(["b"]);
    expect(ids({ motorista: "carl" })).toEqual(["a"]);
    expect(ids({ insumoId: "i2" })).toEqual(["c"]);
    expect(ids({ origemId: "o2" })).toEqual(["c"]);
    expect(ids({ destinoId: "d2" })).toEqual(["c"]);
  });
});

describe("filtrarFretesFacetado (pedido de 02/10/2026)", () => {
  const lista = [
    frete({ id: "a", transportadoraId: "t1", insumoId: "i1", data: "2026-09-01" }),
    frete({ id: "b", transportadoraId: "t2", insumoId: "i2", data: "2026-09-05" }),
    frete({ id: "c", transportadoraId: "t2", insumoId: "i3", data: "2026-09-09" }),
  ];
  const transportadoras = [
    { valor: "t1", rotulo: "T1" },
    { valor: "t2", rotulo: "T2" },
  ];
  const materiais = [
    { valor: "i1", rotulo: "I1" },
    { valor: "i2", rotulo: "I2" },
    { valor: "i3", rotulo: "I3" },
  ];

  it("escolher a transportadora restringe os materiais; o próprio filtro continua com todas", () => {
    const { linhas, opcoes } = filtrarFretesFacetado(lista, { ...FILTROS_VAZIOS, transportadoraId: "t2" });
    expect(linhas.map((f) => f.id)).toEqual(["b", "c"]);
    expect(opcoes("material", materiais).map((o) => o.valor)).toEqual(["i2", "i3"]);
    expect(opcoes("transportadora", transportadoras).map((o) => o.valor)).toEqual(["t1", "t2"]);
  });

  it("o período restringe as opções, e o escolhido sem linha não some", () => {
    const { opcoes } = filtrarFretesFacetado(lista, { ...FILTROS_VAZIOS, de: "2026-09-05", insumoId: "i1" });
    expect(opcoes("transportadora", transportadoras)).toEqual([]);
    expect(opcoes("material", materiais).map((o) => o.valor)).toEqual(["i1", "i2", "i3"]);
  });
});

describe("presets (utils/dateRangePresets.ts)", () => {
  it("esta semana: segunda até hoje; domingo é fim da semana anterior", () => {
    expect(periodoEstaSemana("2026-09-24")).toEqual({ de: "2026-09-21", ate: "2026-09-24" }); // quinta
    expect(periodoEstaSemana("2026-09-27")).toEqual({ de: "2026-09-21", ate: "2026-09-27" }); // domingo
    expect(periodoEstaSemana("2026-09-21")).toEqual({ de: "2026-09-21", ate: "2026-09-21" }); // segunda
  });

  it("este mês e mês passado (virando o ano)", () => {
    expect(periodoEsteMes("2026-09-24")).toEqual({ de: "2026-09-01", ate: "2026-09-24" });
    expect(periodoMesPassado("2026-09-24")).toEqual({ de: "2026-08-01", ate: "2026-08-31" });
    expect(periodoMesPassado("2026-01-10")).toEqual({ de: "2025-12-01", ate: "2025-12-31" });
    expect(periodoMesPassado("2028-03-01")).toEqual({ de: "2028-02-01", ate: "2028-02-29" });
  });

  it("reconhece o preset ativo", () => {
    const hoje = "2026-09-24";
    expect(presetAtivo({ de: "", ate: "", semChegada: true }, hoje)).toBe("sem_chegada");
    expect(presetAtivo({ de: "2026-09-01", ate: "2026-09-24", semChegada: false }, hoje)).toBe("este_mes");
    expect(presetAtivo({ de: "2026-08-01", ate: "2026-08-31", semChegada: false }, hoje)).toBe("mes_passado");
    expect(presetAtivo({ de: "2026-09-02", ate: "", semChegada: false }, hoje)).toBeNull();
  });

  it("top transportadora: 5 por contagem nos últimos 90 dias", () => {
    const hoje = "2026-09-24";
    const fretes = [
      ...Array.from({ length: 3 }, (_, i) => frete({ id: `x${i}`, transportadoraId: "t1", transportadoraNome: "Alfa" })),
      ...Array.from({ length: 5 }, (_, i) =>
        frete({ id: `y${i}`, transportadoraId: "t2", transportadoraNome: "Beta", data: "2026-06-26" }),
      ),
      frete({ id: "velho", transportadoraId: "t3", transportadoraNome: "Gama", data: "2026-06-25" }),
    ];
    const top = topTransportadoras(fretes, hoje);
    expect(top.map((t) => [t.id, t.quantidade])).toEqual([
      ["t2", 5],
      ["t1", 3],
    ]);
  });
});

describe("filtro por fretes escolhidos (alerta de rota das Carretas EMT)", () => {
  it("lê só ids válidos, sem repetir, e filtra só eles", () => {
    const filtros = lerFiltrosFretes({ fretes: `${UUID_A}, nao-e-id,${UUID_B},${UUID_A}` });
    expect(filtros.ids).toEqual([UUID_A, UUID_B]);
    const lista = [frete({ id: UUID_A }), frete({ id: UUID_B }), frete({ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" })];
    expect(filtrarFretes(lista, filtros).map((f) => f.id)).toEqual([UUID_A, UUID_B]);
    expect(filtrarFretes(lista, FILTROS_VAZIOS)).toHaveLength(3);
  });
});
