// @vitest-environment node
import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const exigirPermissao = vi.fn();
const contarSaidasDoPeriodo = vi.fn();
const lerSaidasDoPeriodo = vi.fn();

vi.mock("@/lib/permissoes", () => ({
  exigirPermissao: (...args: unknown[]) => exigirPermissao(...args),
}));
vi.mock("@/modules/combustivel/relatorios/queries", () => ({
  LIMITE_SAIDAS_RELATORIO: 50_000,
  contarSaidasDoPeriodo: (...args: unknown[]) => contarSaidasDoPeriodo(...args),
  lerSaidasDoPeriodo: (...args: unknown[]) => lerSaidasDoPeriodo(...args),
}));
vi.mock("@/lib/erros", () => ({
  erroAcao: (_contexto: string, _erro: unknown, mensagem: string) => ({ erro: mensagem }),
  textoDoErro: (erro: unknown) => (erro instanceof Error ? erro.message : String(erro)),
}));

import { gerarPlanilhaCombustivel } from "@/modules/combustivel/relatorios/actions";

const SAIDA = {
  id: "s1",
  data: "2026-09-10T15:30:00.000Z",
  origem: "tanque",
  tipoConsumidor: "equipamento_proprio",
  tanqueNome: "Tanque 1",
  equipamentoId: "eq-1",
  equipamentoNome: "EQ-1",
  transportadoraId: null,
  transportadoraNome: null,
  placa: null,
  motorista: null,
  insumoId: "diesel",
  combustivel: "Diesel S10",
  litros: 10,
  precoCombustivel: 6,
  precoProprietario: null,
  taxaLitro: 0,
  precoUnitario: 6,
  precoMedioTanque: 6,
  valorTotal: 60,
  pago: false,
  pagoEm: null,
  medicao: null,
  tipoMedicao: null,
  centroCustoNome: null,
  canal: "computador",
  observacoes: null,
  criadoEm: "2026-09-10T15:31:00.000Z",
  alocacoes: [],
};

beforeEach(() => {
  exigirPermissao.mockReset();
  contarSaidasDoPeriodo.mockReset();
  lerSaidasDoPeriodo.mockReset();
});

describe("gerarPlanilhaCombustivel", () => {
  it("sem combustivel.relatorios/ver: recusa e nem lê o banco", async () => {
    exigirPermissao.mockRejectedValue(new Error("Sem permissão"));
    const resultado = await gerarPlanilhaCombustivel({ tipo: "mensal", de: "2026-09-01", ate: "2026-09-30" });
    expect(resultado).toEqual({ erro: "Sem permissão para exportar relatórios do combustível" });
    expect(exigirPermissao).toHaveBeenCalledWith("combustivel.relatorios", "ver");
    expect(contarSaidasDoPeriodo).not.toHaveBeenCalled();
  });

  it("recusa tipo, data e chave desconhecidos", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    expect("erro" in (await gerarPlanilhaCombustivel({ tipo: "xpto", de: "2026-09-01", ate: "2026-09-30" }))).toBe(true);
    expect("erro" in (await gerarPlanilhaCombustivel({ tipo: "mensal", de: "2026-02-31", ate: "2026-09-30" }))).toBe(true);
    expect(
      "erro" in (await gerarPlanilhaCombustivel({ tipo: "mensal", de: "2026-09-01", ate: "2026-09-30", extra: 1 })),
    ).toBe(true);
    expect(contarSaidasDoPeriodo).not.toHaveBeenCalled();
  });

  it("período vazio e período acima do teto avisam em vez de gerar", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    contarSaidasDoPeriodo.mockResolvedValueOnce(0);
    expect(await gerarPlanilhaCombustivel({ tipo: "bruto", de: "2026-09-01", ate: "2026-09-30" })).toEqual({
      erro: "O período não tem nenhum abastecimento para exportar",
    });
    contarSaidasDoPeriodo.mockResolvedValueOnce(50_001);
    const acima = await gerarPlanilhaCombustivel({ tipo: "bruto", de: "2026-09-01", ate: "2026-09-30" });
    expect("erro" in acima && acima.erro).toMatch(/acima do limite/);
    expect(lerSaidasDoPeriodo).not.toHaveBeenCalled();
  });

  it("leitura menor que a contagem recusa a planilha incompleta", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    contarSaidasDoPeriodo.mockResolvedValue(2);
    lerSaidasDoPeriodo.mockResolvedValue([SAIDA]);
    const resultado = await gerarPlanilhaCombustivel({ tipo: "mensal", de: "2026-09-01", ate: "2026-09-30" });
    expect("erro" in resultado && resultado.erro).toMatch(/Li 1 de 2/);
  });

  it("gera o arquivo, com o período invertido trocado de lado", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    contarSaidasDoPeriodo.mockResolvedValue(1);
    lerSaidasDoPeriodo.mockResolvedValue([SAIDA]);
    const resultado = await gerarPlanilhaCombustivel({ tipo: "mensal", de: "2026-09-30", ate: "2026-09-01" });
    expect(lerSaidasDoPeriodo).toHaveBeenCalledWith({ de: "2026-09-01", ate: "2026-09-30" });
    if (!("ok" in resultado)) throw new Error(resultado.erro);
    expect(resultado.nomeArquivo).toBe("combustivel-mensal-2026-09-01-a-2026-09-30.xlsx");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(resultado.base64, "base64") as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Mensal"]);
  });
});
