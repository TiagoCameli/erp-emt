// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MovimentosFifoTanque } from "@/modules/combustivel/_shared/fifo-ts";

const exigirPermissao = vi.fn();
const createClient = vi.fn();
const rpc = vi.fn();
const lerAlocacoesDaSaida = vi.fn();
const lerMovimentosFifoDoTanque = vi.fn();
const lerSnapshotDaSaida = vi.fn();
const buscarUltimaLeitura = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissoes", () => ({
  exigirPermissao: (...args: unknown[]) => exigirPermissao(...args),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => createClient(),
}));
vi.mock("@/modules/combustivel/abastecimentos/queries", () => ({
  lerAlocacoesDaSaida: (...args: unknown[]) => lerAlocacoesDaSaida(...args),
  lerMovimentosFifoDoTanque: (...args: unknown[]) => lerMovimentosFifoDoTanque(...args),
  lerSnapshotDaSaida: (...args: unknown[]) => lerSnapshotDaSaida(...args),
}));
vi.mock("@/modules/manutencao/medicoes/queries", () => ({
  buscarUltimaLeitura: (...args: unknown[]) => buscarUltimaLeitura(...args),
}));

import {
  calcularPrecoFifo,
  consultarEstoqueNaData,
  excluirAbastecimento,
  restaurarAbastecimento,
  salvarAbastecimento,
} from "@/modules/combustivel/abastecimentos/actions";
import type { SaidaInput } from "@/modules/combustivel/abastecimentos/schemas";

const ID = "77777777-7777-4777-8777-777777777777";
const TANQUE = "11111111-1111-4111-8111-111111111111";
const EQUIP = "22222222-2222-4222-8222-222222222222";
const TRANSP = "33333333-3333-4333-8333-333333333333";
const DIESEL = "44444444-4444-4444-8444-444444444444";
const OBRA = "55555555-5555-4555-8555-555555555555";
const S500 = "88888888-8888-4888-8888-888888888888";

const DADOS: SaidaInput = {
  origem: "tanque",
  tipoConsumidor: "equipamento_proprio",
  tanqueId: TANQUE,
  equipamentoId: EQUIP,
  transportadoraId: null,
  placa: null,
  motorista: null,
  insumoId: DIESEL,
  litros: 150,
  precoCombustivel: null,
  precoProprietario: null,
  taxaLitro: null,
  precoUnitario: null,
  pago: false,
  pagoEm: null,
  medicao: null,
  tipoMedicao: null,
  dataHora: "2026-09-20T14:30:00-05:00",
  obraId: OBRA,
  manterAlocacoes: false,
  observacoes: null,
};

/** Duas camadas de diesel: 100 L a 6,00 (01/09) e 1.000 L a 7,00 (10/09). */
function movimentos(): MovimentosFifoTanque {
  return {
    entradas: [
      { id: "b", depositoId: TANQUE, dataHora: "2026-09-10T08:00:00", tipoCombustivel: DIESEL, quantidadeLitros: 1000, valorTotal: 7000 },
      { id: "a", depositoId: TANQUE, dataHora: "2026-09-01T08:00:00", tipoCombustivel: DIESEL, quantidadeLitros: 100, valorTotal: 600 },
    ],
    transferencias: [],
    saidas: [],
    esvaziamentos: [],
  };
}

const banco = { tanqueExterno: false };

function clienteFalso() {
  return {
    rpc,
    from() {
      const cadeia = {
        select: () => cadeia,
        eq: () => cadeia,
        maybeSingle: async () => ({ data: { eh_externo: banco.tanqueExterno }, error: null }),
      };
      return cadeia;
    },
  };
}

function pDados(): Record<string, unknown> {
  const [, args] = rpc.mock.calls[0] as [string, { p_dados: Record<string, unknown> }];
  return args.p_dados;
}

describe("salvarAbastecimento", () => {
  beforeEach(() => {
    exigirPermissao.mockReset();
    createClient.mockReset();
    rpc.mockReset();
    lerAlocacoesDaSaida.mockReset();
    lerMovimentosFifoDoTanque.mockReset();
    lerSnapshotDaSaida.mockReset();
    banco.tanqueExterno = false;
    createClient.mockImplementation(async () => clienteFalso());
    lerAlocacoesDaSaida.mockResolvedValue([]);
    lerMovimentosFifoDoTanque.mockResolvedValue(movimentos());
    lerSnapshotDaSaida.mockResolvedValue(null);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("sem permissão: recusa e nem abre o banco (criar e editar)", async () => {
    exigirPermissao.mockRejectedValue(new Error("Sem permissão"));
    await expect(salvarAbastecimento(null, DADOS)).resolves.toEqual({ erro: "Sem permissão para lançar abastecimento" });
    expect(exigirPermissao).toHaveBeenLastCalledWith("combustivel.saidas", "criar");
    await expect(salvarAbastecimento(ID, DADOS)).resolves.toEqual({ erro: "Sem permissão para editar abastecimento" });
    expect(exigirPermissao).toHaveBeenLastCalledWith("combustivel.saidas", "editar");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("sem obra é recusado antes do banco (a origem exige obra e etapa)", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    await expect(salvarAbastecimento(null, { ...DADOS, obraId: null })).resolves.toEqual({ erro: "Selecione a obra" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("equipamento próprio no tanque: o snapshot e o preço são o FIFO em TS calculado no servidor", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    rpc.mockResolvedValue({ data: ID, error: null });
    await expect(salvarAbastecimento(null, DADOS)).resolves.toEqual({ ok: true, id: ID });
    expect(lerMovimentosFifoDoTanque).toHaveBeenCalledWith(TANQUE);
    // 100 L a 6,00 + 50 L a 7,00 = 950 / 150.
    expect(pDados()).toMatchObject({
      tanque_id: TANQUE,
      preco_medio_tanque: 950 / 150,
      preco_combustivel: 950 / 150,
      preco_unitario: 950 / 150,
      taxa_litro: 0,
      alocacoes: [{ centro_custo_id: OBRA, percentual: 100 }],
    });
  });

  it("carreta no tanque: vai o preço digitado; o snapshot continua o FIFO", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    rpc.mockResolvedValue({ data: ID, error: null });
    await salvarAbastecimento(null, {
      ...DADOS,
      tipoConsumidor: "carreta_transportadora",
      equipamentoId: null,
      transportadoraId: TRANSP,
      litros: 50,
      precoCombustivel: 6.5,
      taxaLitro: 0.15,
    });
    expect(pDados()).toMatchObject({ preco_combustivel: 6.5, taxa_litro: 0.15, preco_unitario: 6.65, preco_medio_tanque: 6 });
  });

  it("carreta em tanque externo: o preço do dono vazio vai igual ao cobrado", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    banco.tanqueExterno = true;
    rpc.mockResolvedValue({ data: ID, error: null });
    await salvarAbastecimento(null, {
      ...DADOS,
      tipoConsumidor: "carreta_transportadora",
      equipamentoId: null,
      transportadoraId: TRANSP,
      precoCombustivel: 6.8,
      taxaLitro: 0.15,
    });
    expect(pDados()).toMatchObject({ equipamento_id: null, preco_combustivel: 6.8, preco_proprietario: 6.8, taxa_litro: 0.15 });
  });

  it("edição sem trocar tanque nem origem mantém o snapshot salvo; trocou o tanque, recalcula", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    rpc.mockResolvedValue({ data: ID, error: null });
    lerSnapshotDaSaida.mockResolvedValue({ tanqueId: TANQUE, origem: "tanque", precoMedioTanque: 5.4321 });
    await salvarAbastecimento(ID, DADOS);
    expect(pDados().preco_medio_tanque).toBe(5.4321);

    rpc.mockClear();
    lerSnapshotDaSaida.mockResolvedValue({ tanqueId: "99999999-9999-4999-8999-999999999999", origem: "tanque", precoMedioTanque: 5.4321 });
    await salvarAbastecimento(ID, DADOS);
    expect(pDados().preco_medio_tanque).toBe(950 / 150);
  });

  it("combustível diferente do da entrada mais nova do tanque (da EMT) é recusado", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    await expect(salvarAbastecimento(null, { ...DADOS, insumoId: S500 })).resolves.toEqual({
      erro: "Combustível incompatível: a saída é de um combustível e o tanque hoje tem outro",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("dinheiro: sem tanque, sem FIFO, o preço digitado", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    rpc.mockResolvedValue({ data: ID, error: null });
    await salvarAbastecimento(null, { ...DADOS, origem: "dinheiro", tanqueId: null, precoUnitario: 6.5 });
    expect(lerMovimentosFifoDoTanque).not.toHaveBeenCalled();
    expect(pDados()).toMatchObject({ tanque_id: null, preco_unitario: 6.5, preco_medio_tanque: null });
  });

  it("edita: as alocações de antes vêm do banco e a etapa da origem sobrevive", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    lerAlocacoesDaSaida.mockResolvedValue([{ centroCustoId: OBRA, percentual: 100, etapaLegado: "Terraplenagem" }]);
    rpc.mockResolvedValue({ data: ID, error: null });
    await expect(salvarAbastecimento(ID, DADOS)).resolves.toEqual({ ok: true, id: ID });
    expect(lerAlocacoesDaSaida).toHaveBeenCalledWith(ID);
    const [, args] = rpc.mock.calls[0] as [string, { p_id: unknown; p_dados: { alocacoes: unknown } }];
    expect(args.p_id).toBe(ID);
    expect(args.p_dados.alocacoes).toEqual([{ centro_custo_id: OBRA, percentual: 100, etapa_legado: "Terraplenagem" }]);
  });

  it("a trava do banco (P0001) chega à tela; a 23514 de saldo também", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "P0001", message: "Informe a obra e a etapa do abastecimento" },
    });
    await expect(salvarAbastecimento(null, DADOS)).resolves.toEqual({ erro: "Informe a obra e a etapa do abastecimento" });
    const saldo = "O tanque ficaria com saldo negativo em algum momento: confira as datas e os litros";
    rpc.mockResolvedValueOnce({ data: null, error: { code: "23514", message: saldo } });
    await expect(salvarAbastecimento(null, DADOS)).resolves.toEqual({ erro: saldo });
  });

  it("erro técnico não vaza", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    rpc.mockResolvedValue({ data: null, error: { code: "22P02", message: "invalid input syntax" } });
    await expect(salvarAbastecimento(null, DADOS)).resolves.toEqual({
      erro: "Não foi possível salvar o abastecimento. Tente novamente",
    });
  });
});

describe("calcularPrecoFifo (o FIFO em TS para a tela)", () => {
  beforeEach(() => {
    exigirPermissao.mockReset();
    lerMovimentosFifoDoTanque.mockReset();
    lerMovimentosFifoDoTanque.mockResolvedValue(movimentos());
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("pede 'ver'; devolve preço médio, lotes e litros sem suprimento", async () => {
    exigirPermissao.mockRejectedValue(new Error("Sem permissão"));
    await expect(calcularPrecoFifo(TANQUE, "2026-09-20T14:30:00-05:00", 150, DIESEL, null)).resolves.toEqual({
      erro: "Sem permissão para ver abastecimentos",
    });
    expect(lerMovimentosFifoDoTanque).not.toHaveBeenCalled();

    exigirPermissao.mockResolvedValue(undefined);
    const r = await calcularPrecoFifo(TANQUE, "2026-09-20T14:30:00-05:00", 1200, DIESEL, null);
    expect(r).toMatchObject({ ok: true, litrosSemSuprimento: 100 });
    if (!("ok" in r)) throw new Error("esperava ok");
    expect(r.detalhamento.map((p) => [p.fonteId, p.litros])).toEqual([
      ["a", 100],
      ["b", 1000],
    ]);
    expect(r.precoMedio).toBeCloseTo(7600 / 1100, 12);
  });

  it("a data é comparada no relógio de Rio Branco: a entrada das 08:00 de 10/09 fica fora de uma saída às 07:59", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    const r = await calcularPrecoFifo(TANQUE, "2026-09-10T07:59:00-05:00", 200, DIESEL, null);
    expect(r).toMatchObject({ ok: true, litrosSemSuprimento: 100 });
  });

  it("valida os argumentos", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    await expect(calcularPrecoFifo("x", "2026-09-20T14:30:00-05:00", 1, null, null)).resolves.toEqual({ erro: "Tanque inválido" });
    await expect(calcularPrecoFifo(TANQUE, "20/09/2026", 1, null, null)).resolves.toEqual({ erro: "Data inválida" });
    await expect(calcularPrecoFifo(TANQUE, "2026-09-20T14:30:00-05:00", -1, null, null)).resolves.toEqual({
      erro: "Litros inválidos",
    });
  });
});

describe("excluir, restaurar e estoque na data", () => {
  beforeEach(() => {
    exigirPermissao.mockReset();
    createClient.mockReset();
    rpc.mockReset();
    createClient.mockImplementation(async () => clienteFalso());
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("excluir sem permissão não abre o banco; com motivo chama fn_comb_excluir", async () => {
    exigirPermissao.mockRejectedValue(new Error("Sem permissão"));
    await expect(excluirAbastecimento(ID, "duplicado")).resolves.toEqual({ erro: "Sem permissão para excluir abastecimento" });
    expect(createClient).not.toHaveBeenCalled();

    exigirPermissao.mockResolvedValue(undefined);
    await expect(excluirAbastecimento(ID, "")).resolves.toEqual({ erro: "Informe o motivo da exclusão" });
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(excluirAbastecimento(ID, "duplicado")).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("fn_comb_excluir", { p_tabela: "combustivel_saidas", p_id: ID, p_motivo: "duplicado" });
  });

  it("restaurar pede editar a Lixeira E excluir na aba", async () => {
    exigirPermissao.mockImplementation(async (recurso: string) => {
      if (recurso === "administracao.lixeira") throw new Error("Sem permissão");
    });
    await expect(restaurarAbastecimento(ID)).resolves.toEqual({ erro: "Sem permissão para restaurar abastecimento" });
    exigirPermissao.mockImplementation(async (recurso: string, acao: string) => {
      if (recurso === "combustivel.saidas" && acao === "excluir") throw new Error("Sem permissão");
    });
    await expect(restaurarAbastecimento(ID)).resolves.toEqual({ erro: "Sem permissão para restaurar abastecimento" });
    expect(createClient).not.toHaveBeenCalled();

    exigirPermissao.mockResolvedValue(undefined);
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(restaurarAbastecimento(ID)).resolves.toEqual({ ok: true });
    expect(exigirPermissao).toHaveBeenCalledWith("administracao.lixeira", "editar");
    expect(exigirPermissao).toHaveBeenCalledWith("combustivel.saidas", "excluir");
    expect(rpc).toHaveBeenCalledWith("fn_comb_restaurar", { p_tabela: "combustivel_saidas", p_id: ID });
  });

  it("estoque na data pede 'ver' e repassa o id a excluir da conta", async () => {
    exigirPermissao.mockRejectedValue(new Error("Sem permissão"));
    await expect(consultarEstoqueNaData(TANQUE, "2026-09-20T14:30:00-05:00", null)).resolves.toEqual({
      erro: "Sem permissão para ver abastecimentos",
    });
    expect(exigirPermissao).toHaveBeenCalledWith("combustivel.saidas", "ver");
    expect(createClient).not.toHaveBeenCalled();

    exigirPermissao.mockResolvedValue(undefined);
    rpc.mockResolvedValue({ data: 1234.5678, error: null });
    await expect(consultarEstoqueNaData(TANQUE, "2026-09-20T14:30:00-05:00", ID)).resolves.toEqual({
      ok: true,
      litros: 1234.5678,
    });
    expect(rpc).toHaveBeenCalledWith("fn_comb_estoque_na_data", {
      p_tanque: TANQUE,
      p_data: "2026-09-20T14:30:00-05:00",
      p_excluir: ID,
    });
    await expect(consultarEstoqueNaData(TANQUE, "20/09/2026", null)).resolves.toEqual({ erro: "Data inválida" });
  });
});
