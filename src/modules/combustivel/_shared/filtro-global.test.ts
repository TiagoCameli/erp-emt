import { describe, expect, it } from "vitest";

import { EQUIPAMENTO_DESCONHECIDO, type BaseCombustivel, type SaidaBase } from "@/modules/combustivel/anomalias/base";
import {
  alternarValor,
  aplicarFiltroGlobal,
  aplicarFiltroGlobalEntradas,
  diasNoPeriodo,
  filtroGlobalDaUrl,
  mudancasParaLimpar,
  opcoesDoFiltroGlobal,
  periodoDoPreset,
  presetDoPeriodo,
  rotuloPeriodo,
  temFiltroAtivo,
  type EntradaComFornecedor,
  type FiltroGlobal,
} from "@/modules/combustivel/_shared/filtro-global";
import { CHAVES_RECORTE } from "@/modules/combustivel/_shared/navegacao";

const HOJE = "2026-09-23";

const OBRA_A = "11111111-1111-4111-8111-111111111111";
const OBRA_B = "22222222-2222-4222-8222-222222222222";
const EQ_1 = "33333333-3333-4333-8333-333333333333";
const EQ_2 = "44444444-4444-4444-8444-444444444444";
const TANQUE_1 = "55555555-5555-4555-8555-555555555555";
const S10 = "66666666-6666-4666-8666-666666666666";
const ARLA = "77777777-7777-4777-8777-777777777777";
const TRANSP = "88888888-8888-4888-8888-888888888888";
const FORN_1 = "99999999-9999-4999-8999-999999999999";
const FORN_2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

let n = 0;
function saida(parcial: Partial<SaidaBase> = {}): SaidaBase {
  n += 1;
  return {
    id: `s${String(n).padStart(3, "0")}`,
    data: "2026-09-10T08:00:00",
    instante: "2026-09-10T13:00:00Z",
    tipoConsumidor: "equipamento_proprio",
    equipamentoId: EQ_1,
    equipamentoIdReal: EQ_1,
    placa: null,
    obraId: OBRA_A,
    tipoCombustivel: S10,
    litros: 100,
    valorTotal: 639.47,
    origem: "tanque",
    tanqueId: TANQUE_1,
    transportadoraId: null,
    motorista: "João",
    precoUnitario: 6.3947,
    pago: false,
    pagoEm: null,
    observacoes: null,
    createdBy: null,
    ...parcial,
  };
}

function filtro(parcial: Partial<FiltroGlobal> = {}): FiltroGlobal {
  return {
    ...filtroGlobalDaUrl({ de: "2026-09-01", ate: "2026-09-30" }),
    ...parcial,
  };
}

describe("filtroGlobalDaUrl", () => {
  it("sem nada na URL: modo próprios, QUALQUER data, nenhum filtro, nada a limpar", () => {
    // Antes caía nos últimos 30 dias, e limpar o período devolvia os 30 dias: o filtro
    // nunca desligava. Sem `de`/`ate` é qualquer data, como no resto do ERP.
    const f = filtroGlobalDaUrl({});
    expect(f.modo).toBe("proprios");
    expect(f.periodo).toBeNull();
    expect(f.obras).toEqual([]);
    expect(temFiltroAtivo(f)).toBe(false);
  });

  it("lê listas por vírgula ou chave repetida, dedup, e descarta id que não é uuid", () => {
    const f = filtroGlobalDaUrl(
      { obra: [`${OBRA_A},${OBRA_B}`, OBRA_A], equipamento: `lixo,${EQ_1}`, placa: " ABC1D23 ,XYZ9Z99", operador: "Maria" },
    );
    expect(f.obras).toEqual([OBRA_A, OBRA_B]);
    expect(f.equipamentos).toEqual([EQ_1]);
    expect(f.placas).toEqual(["ABC1D23", "XYZ9Z99"]);
    expect(f.operadores).toEqual(["Maria"]);
    expect(temFiltroAtivo(f)).toBe(true);
  });

  it("aceita URLSearchParams (o cliente) e lê o modo e o período escolhido", () => {
    const f = filtroGlobalDaUrl(new URLSearchParams(`modo=carretas&de=2026-09-01&ate=2026-09-15&tanque=${TANQUE_1}`));
    expect(f.modo).toBe("carretas");
    expect(f.periodo).toEqual({ de: "2026-09-01", ate: "2026-09-15" });
    expect(temFiltroAtivo(f)).toBe(true);
    expect(f.tanques).toEqual([TANQUE_1]);
  });

  it("período invertido troca de lado; data inválida é o mesmo que nenhuma", () => {
    expect(filtroGlobalDaUrl({ de: "2026-09-20", ate: "2026-09-01" }).periodo).toEqual({
      de: "2026-09-01",
      ate: "2026-09-20",
    });
    expect(filtroGlobalDaUrl({ de: "2026-02-31" }).periodo).toBeNull();
  });

  it("uma ponta só é limite aberto do outro lado", () => {
    expect(filtroGlobalDaUrl({ de: "2026-09-01" }).periodo).toEqual({ de: "2026-09-01", ate: "9999-12-31" });
    expect(filtroGlobalDaUrl({ ate: "2026-09-01" }).periodo).toEqual({ de: "0000-01-01", ate: "2026-09-01" });
  });

  it("toda chave que o filtro lê é chave do recorte (senão não atravessa as abas)", () => {
    const limpar = Object.keys(mudancasParaLimpar());
    for (const chave of limpar) expect(CHAVES_RECORTE).toContain(chave);
    expect(limpar).not.toContain("modo");
  });
});

describe("aplicarFiltroGlobal (o saidasFiltradas da origem)", () => {
  it("modo e período: só o tipo de consumidor do modo, dia do relógio de parede inclusivo", () => {
    const dentro = saida({ data: "2026-09-30T23:59:00" });
    const fora = saida({ data: "2026-10-01T00:00:00" });
    const carreta = saida({ tipoConsumidor: "carreta_transportadora" });
    expect(aplicarFiltroGlobal([dentro, fora, carreta], filtro())).toEqual([dentro]);
  });

  it("obra, tanque, combustível e operador: saída sem o campo não casa", () => {
    const a = saida({ obraId: OBRA_A });
    const b = saida({ obraId: OBRA_B, tanqueId: null, tipoCombustivel: ARLA, motorista: " Maria " });
    const semObra = saida({ obraId: null });
    expect(aplicarFiltroGlobal([a, b, semObra], filtro({ obras: [OBRA_B] }))).toEqual([b]);
    expect(aplicarFiltroGlobal([a, b], filtro({ tanques: [TANQUE_1] }))).toEqual([a]);
    expect(aplicarFiltroGlobal([a, b], filtro({ combustiveis: [ARLA] }))).toEqual([b]);
    // A origem compara o motorista aparado.
    expect(aplicarFiltroGlobal([a, b], filtro({ operadores: ["Maria"] }))).toEqual([b]);
  });

  it("equipamento: o sentinela nunca casa com um equipamento escolhido", () => {
    const eq1 = saida({ equipamentoId: EQ_1 });
    const eq2 = saida({ equipamentoId: EQ_2 });
    const sentinela = saida({ equipamentoId: EQUIPAMENTO_DESCONHECIDO });
    expect(aplicarFiltroGlobal([eq1, eq2, sentinela], filtro({ equipamentos: [EQ_2] }))).toEqual([eq2]);
    expect(aplicarFiltroGlobal([eq1, eq2, sentinela], filtro())).toHaveLength(3);
  });

  it("transportadora e placa só valem no modo carretas; equipamento só no próprios", () => {
    const carreta = saida({ tipoConsumidor: "carreta_transportadora", placa: "abc1d23 ", transportadoraId: TRANSP, equipamentoId: null });
    const outra = saida({ tipoConsumidor: "carreta_transportadora", placa: "XYZ9Z99", transportadoraId: null, equipamentoId: null });
    const carretas = filtro({ modo: "carretas" });
    expect(aplicarFiltroGlobal([carreta, outra], { ...carretas, placas: ["ABC1D23"] })).toEqual([carreta]);
    expect(aplicarFiltroGlobal([carreta, outra], { ...carretas, transportadoras: [TRANSP] })).toEqual([carreta]);
    // Equipamento esquecido na URL não esvazia o modo carretas.
    expect(aplicarFiltroGlobal([carreta, outra], { ...carretas, equipamentos: [EQ_1] })).toHaveLength(2);
    // Placa esquecida na URL não esvazia o modo próprios.
    const propria = saida();
    expect(aplicarFiltroGlobal([propria], filtro({ placas: ["ABC1D23"], transportadoras: [TRANSP] }))).toEqual([propria]);
  });

  it("fornecedor não filtra saída (só entrada), como na origem", () => {
    const s = saida();
    expect(aplicarFiltroGlobal([s], filtro({ fornecedores: [FORN_1] }))).toEqual([s]);
  });

  it("o período anterior usa os mesmos filtros em outra janela", () => {
    const agosto = saida({ data: "2026-08-15T10:00:00", obraId: OBRA_A });
    const agostoOutraObra = saida({ data: "2026-08-15T10:00:00", obraId: OBRA_B });
    const f = filtro({ obras: [OBRA_A] });
    expect(aplicarFiltroGlobal([agosto, agostoOutraObra], f, { de: "2026-08-01", ate: "2026-08-31" })).toEqual([agosto]);
  });
});

describe("aplicarFiltroGlobalEntradas (o entradasFiltradas da origem)", () => {
  const entrada = (parcial: Partial<EntradaComFornecedor>): EntradaComFornecedor => ({
    data: "2026-09-10T08:00:00",
    tanqueId: TANQUE_1,
    insumoId: S10,
    fornecedorId: FORN_1,
    fornecedorNome: "Posto A",
    ...parcial,
  });

  it("período, combustível, fornecedor e tanque; obra, equipamento, operador e modo não filtram entrada", () => {
    const a = entrada({});
    const b = entrada({ fornecedorId: FORN_2, insumoId: ARLA, tanqueId: null });
    const fora = entrada({ data: "2026-08-31T23:00:00" });
    const f = filtro({ modo: "carretas", obras: [OBRA_A], equipamentos: [EQ_1], operadores: ["João"] });
    expect(aplicarFiltroGlobalEntradas([a, b, fora], f)).toEqual([a, b]);
    expect(aplicarFiltroGlobalEntradas([a, b], filtro({ fornecedores: [FORN_2] }))).toEqual([b]);
    expect(aplicarFiltroGlobalEntradas([a, b], filtro({ combustiveis: [S10] }))).toEqual([a]);
    expect(aplicarFiltroGlobalEntradas([a, b], filtro({ tanques: [TANQUE_1] }))).toEqual([a]);
  });
});

describe("presets de período (PeriodoPanel da origem)", () => {
  it("cada preset relativo a hoje", () => {
    expect(periodoDoPreset("hoje", HOJE)).toEqual({ de: HOJE, ate: HOJE });
    expect(periodoDoPreset("ultimos_7", HOJE)).toEqual({ de: "2026-09-17", ate: HOJE });
    expect(periodoDoPreset("ultimos_30", HOJE)).toEqual({ de: "2026-08-25", ate: HOJE });
    expect(periodoDoPreset("mes_atual", HOJE)).toEqual({ de: "2026-09-01", ate: "2026-09-30" });
    expect(periodoDoPreset("mes_anterior", HOJE)).toEqual({ de: "2026-08-01", ate: "2026-08-31" });
    expect(periodoDoPreset("trimestre_atual", HOJE)).toEqual({ de: "2026-07-01", ate: "2026-09-30" });
    expect(periodoDoPreset("ano_atual", HOJE)).toEqual({ de: "2026-01-01", ate: "2026-12-31" });
  });

  it("mês anterior de janeiro é dezembro do ano anterior; trimestre de fevereiro é o 1º", () => {
    expect(periodoDoPreset("mes_anterior", "2026-01-10")).toEqual({ de: "2025-12-01", ate: "2025-12-31" });
    expect(periodoDoPreset("trimestre_atual", "2024-02-10")).toEqual({ de: "2024-01-01", ate: "2024-03-31" });
  });

  it("o preset sai do período; o que não casa é personalizado", () => {
    expect(presetDoPeriodo({ de: "2026-08-25", ate: HOJE }, HOJE)).toBe("ultimos_30");
    expect(presetDoPeriodo({ de: "2026-09-01", ate: "2026-09-30" }, HOJE)).toBe("mes_atual");
    expect(presetDoPeriodo({ de: "2026-09-02", ate: "2026-09-30" }, HOJE)).toBe("personalizado");
  });

  it("rótulo e dias do período", () => {
    expect(rotuloPeriodo({ de: "2026-05-02", ate: "2026-05-08" })).toBe("02/05/26 – 08/05/26");
    expect(rotuloPeriodo({ de: "2026-05-02", ate: "2026-05-02" })).toBe("02/05/26");
    expect(diasNoPeriodo({ de: "2026-09-01", ate: "2026-09-30" })).toBe(30);
    expect(diasNoPeriodo({ de: "2024-01-01", ate: "2024-12-31" })).toBe(366);
  });
});

describe("escrita", () => {
  it("alternarValor liga e desliga sem repetir", () => {
    expect(alternarValor(["a"], "b")).toEqual(["a", "b"]);
    expect(alternarValor(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("opcoesDoFiltroGlobal", () => {
  const base: BaseCombustivel = {
    saidas: [
      saida({ obraId: OBRA_A, motorista: " João ", tipoCombustivel: S10 }),
      saida({ tipoConsumidor: "carreta_transportadora", placa: "ABC1D23", transportadoraId: TRANSP, motorista: "Zé", obraId: null }),
    ],
    equipamentos: [
      { id: EQ_1, codigo: "ESC-01", descricao: "Escavadeira", placa: null, tipo: null, marca: null, modelo: null, ativo: true, sentinela: false },
      { id: EQ_2, codigo: null, descricao: "Outros", placa: null, tipo: null, marca: null, modelo: null, ativo: true, sentinela: true },
    ],
    combustivelNome: new Map([
      [S10, "Diesel S10"],
      [ARLA, "Arla 32"],
    ]),
    obraNome: new Map([
      [OBRA_A, "Lote 9"],
      [OBRA_B, "Escritório"],
    ]),
    tanques: [
      { id: TANQUE_1, nomeExibicao: "Tanque 1", nome: "T1", apelido: "Tanque 1", capacidadeLitros: 1000, ehExterno: false, proprietarioId: null, ativo: true },
    ],
    transportadoraNome: new Map([[TRANSP, "Transportes X"]]),
  };
  const entradas: EntradaComFornecedor[] = [
    { data: "2026-09-10T08:00:00", tanqueId: TANQUE_1, insumoId: ARLA, fornecedorId: FORN_1, fornecedorNome: "Posto A" },
  ];

  it("obra só a que abastece; equipamento sem o sentinela; operador do modo, aparado", () => {
    const opcoes = opcoesDoFiltroGlobal(base, entradas, filtro());
    expect(opcoes.obras).toEqual([{ valor: OBRA_A, rotulo: "Lote 9" }]);
    expect(opcoes.equipamentos).toEqual([{ valor: EQ_1, rotulo: "ESC-01 · Escavadeira" }]);
    expect(opcoes.operadores).toEqual([{ valor: "João", rotulo: "João" }]);
    expect(opcoes.combustiveis.map((o) => o.rotulo)).toEqual(["Arla 32", "Diesel S10"]);
    expect(opcoes.fornecedores).toEqual([{ valor: FORN_1, rotulo: "Posto A" }]);
    expect(opcoes.tanques).toEqual([{ valor: TANQUE_1, rotulo: "Tanque 1" }]);
  });

  it("no modo carretas, placa, motorista e transportadora vêm das carretas; o marcado sempre entra", () => {
    const opcoes = opcoesDoFiltroGlobal(base, entradas, filtro({ modo: "carretas", obras: [OBRA_B] }));
    expect(opcoes.placas).toEqual([{ valor: "ABC1D23", rotulo: "ABC1D23" }]);
    expect(opcoes.operadores).toEqual([{ valor: "Zé", rotulo: "Zé" }]);
    expect(opcoes.transportadoras).toEqual([{ valor: TRANSP, rotulo: "Transportes X" }]);
    expect(opcoes.obras.map((o) => o.valor)).toContain(OBRA_B);
  });
});
