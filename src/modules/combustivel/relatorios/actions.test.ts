// @vitest-environment node
import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BaseCombustivel, SaidaBase } from "@/modules/combustivel/anomalias/base";

const exigirPermissao = vi.fn();
const carregarBaseCombustivel = vi.fn();
const lerEntradasDoPeriodo = vi.fn();
const lerTransferenciasDoPeriodo = vi.fn();
const lerNomesDeUsuarios = vi.fn();
const lerTransportadorasAtivas = vi.fn();
const listarInsumosCombustivel = vi.fn();

vi.mock("@/lib/permissoes", () => ({
  exigirPermissao: (...args: unknown[]) => exigirPermissao(...args),
}));
vi.mock("@/modules/combustivel/anomalias/queries", () => ({
  carregarBaseCombustivel: () => carregarBaseCombustivel(),
}));
vi.mock("@/modules/combustivel/entradas/queries", () => ({
  listarInsumosCombustivel: () => listarInsumosCombustivel(),
}));
vi.mock("@/modules/combustivel/relatorios/queries", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/modules/combustivel/relatorios/queries")>();
  return {
    cadastrosDaBase: real.cadastrosDaBase,
    lerEntradasDoPeriodo: (...args: unknown[]) => lerEntradasDoPeriodo(...args),
    lerTransferenciasDoPeriodo: (...args: unknown[]) => lerTransferenciasDoPeriodo(...args),
    lerNomesDeUsuarios: (...args: unknown[]) => lerNomesDeUsuarios(...args),
    lerTransportadorasAtivas: () => lerTransportadorasAtivas(),
  };
});
vi.mock("@/lib/erros", () => ({
  erroAcao: (_contexto: string, _erro: unknown, mensagem: string) => ({ erro: mensagem }),
  textoDoErro: (erro: unknown) => (erro instanceof Error ? erro.message : String(erro)),
}));

import { gerarPlanilhaCombustivel } from "@/modules/combustivel/relatorios/actions";

const EQUIPAMENTO = "9f2b7c1d-2222-4333-8444-555566667777";
const OBRA = "0b3c5d7e-1111-4222-8333-444455556666";

function saida(parcial: Partial<SaidaBase> = {}): SaidaBase {
  return {
    id: "s1",
    data: "2026-08-10T08:00:00",
    instante: "2026-08-10T13:00:00Z",
    tipoConsumidor: "equipamento_proprio",
    equipamentoId: EQUIPAMENTO,
    equipamentoIdReal: EQUIPAMENTO,
    placa: null,
    obraId: OBRA,
    tipoCombustivel: "diesel",
    litros: 10,
    valorTotal: 60,
    origem: "tanque",
    tanqueId: null,
    transportadoraId: null,
    motorista: null,
    precoUnitario: 6,
    pago: false,
    pagoEm: null,
    observacoes: null,
    createdBy: null,
    ...parcial,
  };
}

function base(saidas: SaidaBase[]): BaseCombustivel {
  return {
    saidas,
    equipamentos: [
      {
        id: EQUIPAMENTO,
        codigo: "EQ-01",
        descricao: "Escavadeira",
        placa: null,
        tipo: null,
        marca: null,
        modelo: null,
        ativo: true,
        sentinela: false,
      },
    ],
    combustivelNome: new Map([["diesel", "Diesel S10"]]),
    obraNome: new Map([[OBRA, "Obra 009"]]),
    tanques: [],
    transportadoraNome: new Map(),
  };
}

async function abas(base64: string): Promise<string[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(base64, "base64") as unknown as ArrayBuffer);
  return wb.worksheets.map((w) => w.name);
}

beforeEach(() => {
  for (const f of [
    exigirPermissao,
    carregarBaseCombustivel,
    lerEntradasDoPeriodo,
    lerTransferenciasDoPeriodo,
    lerNomesDeUsuarios,
    lerTransportadorasAtivas,
    listarInsumosCombustivel,
  ]) {
    f.mockReset();
  }
  lerEntradasDoPeriodo.mockResolvedValue([]);
  lerTransferenciasDoPeriodo.mockResolvedValue([]);
  lerNomesDeUsuarios.mockResolvedValue(new Map());
  lerTransportadorasAtivas.mockResolvedValue([]);
  listarInsumosCombustivel.mockResolvedValue([]);
});

describe("gerarPlanilhaCombustivel", () => {
  it("sem combustivel.relatorios/ver: recusa e nem lê o banco", async () => {
    exigirPermissao.mockRejectedValue(new Error("Sem permissão"));
    const resultado = await gerarPlanilhaCombustivel({ tipo: "mensal", mes: "2026-08" });
    expect(resultado).toEqual({ erro: "Sem permissão para exportar relatórios do combustível" });
    expect(exigirPermissao).toHaveBeenCalledWith("combustivel.relatorios", "ver");
    expect(carregarBaseCombustivel).not.toHaveBeenCalled();
  });

  it("recusa tipo, mês, id e chave desconhecidos antes de ler", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    expect("erro" in (await gerarPlanilhaCombustivel({ tipo: "xpto", mes: "2026-08" }))).toBe(true);
    expect("erro" in (await gerarPlanilhaCombustivel({ tipo: "mensal", mes: "2026-13" }))).toBe(true);
    expect("erro" in (await gerarPlanilhaCombustivel({ tipo: "obra", obraId: "x", mes: "2026-08" }))).toBe(true);
    expect("erro" in (await gerarPlanilhaCombustivel({ tipo: "mensal", mes: "2026-08", extra: 1 }))).toBe(true);
    expect(carregarBaseCombustivel).not.toHaveBeenCalled();
  });

  it("mês sem movimentação avisa em vez de gerar (a origem desliga o botão)", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    carregarBaseCombustivel.mockResolvedValue(base([saida({ data: "2026-07-31T23:59:00" })]));
    expect(await gerarPlanilhaCombustivel({ tipo: "mensal", mes: "2026-08" })).toEqual({
      erro: "Sem movimentação no mês selecionado. Escolha outro mês",
    });
  });

  it("mensal: o arquivo e as abas da origem, com o nome de arquivo da origem", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    carregarBaseCombustivel.mockResolvedValue(base([saida()]));
    const resultado = await gerarPlanilhaCombustivel({ tipo: "mensal", mes: "2026-08" });
    if (!("ok" in resultado)) throw new Error(resultado.erro);
    expect(resultado.nomeArquivo).toBe("EMT - Mensal Consolidado - Ago-2026.xlsx");
    expect(lerEntradasDoPeriodo).toHaveBeenCalledWith({ de: "2026-08-01", ate: "2026-08-31" });
    expect(await abas(resultado.base64)).toEqual(["Resumo", "Equipamentos", "Carretas", "Obras", "Fornecedores", "Anomalias"]);
  });

  it("por obra só com saída da obra no mês; por equipamento com o intervalo invertido trocado de lado", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    carregarBaseCombustivel.mockResolvedValue(base([saida()]));
    const obra = await gerarPlanilhaCombustivel({ tipo: "obra", obraId: OBRA, mes: "2026-08" });
    if (!("ok" in obra)) throw new Error(obra.erro);
    expect(obra.nomeArquivo).toBe("EMT - Por Obra - Obra 009 - Ago-2026.xlsx");

    expect(await gerarPlanilhaCombustivel({ tipo: "obra", obraId: OBRA, mes: "2026-09" })).toEqual({
      erro: "Sem saídas desta obra no mês selecionado. Escolha outro mês",
    });

    const equipamento = await gerarPlanilhaCombustivel({
      tipo: "equipamento",
      equipamentoId: EQUIPAMENTO,
      de: "2026-08-31",
      ate: "2026-08-01",
    });
    if (!("ok" in equipamento)) throw new Error(equipamento.erro);
    expect(lerEntradasDoPeriodo).toHaveBeenLastCalledWith({ de: "2026-08-01", ate: "2026-08-31" });
    expect(equipamento.nomeArquivo).toBe("EMT - Por Equipamento - EQ-01 - Ago-2026.xlsx");
  });

  it("raw export: cinco abas", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    carregarBaseCombustivel.mockResolvedValue(base([saida()]));
    const resultado = await gerarPlanilhaCombustivel({ tipo: "bruto", mes: "2026-08" });
    if (!("ok" in resultado)) throw new Error(resultado.erro);
    expect(resultado.nomeArquivo).toBe("EMT - Raw Export - Ago-2026.xlsx");
    expect(await abas(resultado.base64)).toEqual(["Resumo", "Saídas", "Entradas", "Transferências", "Cadastros"]);
  });
});
