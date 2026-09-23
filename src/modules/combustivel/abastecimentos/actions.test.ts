// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const exigirPermissao = vi.fn();
const createClient = vi.fn();
const rpc = vi.fn();
const lerAlocacoesDaSaida = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissoes", () => ({
  exigirPermissao: (...args: unknown[]) => exigirPermissao(...args),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => createClient(),
}));
vi.mock("@/modules/combustivel/abastecimentos/queries", () => ({
  lerAlocacoesDaSaida: (...args: unknown[]) => lerAlocacoesDaSaida(...args),
}));

import {
  consultarEstoqueNaData,
  excluirAbastecimento,
  salvarAbastecimento,
} from "@/modules/combustivel/abastecimentos/actions";
import type { SaidaInput } from "@/modules/combustivel/abastecimentos/schemas";

const ID = "77777777-7777-4777-8777-777777777777";
const TANQUE = "11111111-1111-4111-8111-111111111111";
const EQUIP = "22222222-2222-4222-8222-222222222222";
const TRANSP = "33333333-3333-4333-8333-333333333333";
const DIESEL = "44444444-4444-4444-8444-444444444444";
const OBRA = "55555555-5555-4555-8555-555555555555";

const DADOS: SaidaInput = {
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
  dataHora: "2026-09-20T14:30:00-05:00",
  obraId: null,
  manterAlocacoes: false,
  observacoes: null,
};

/** O que o banco responde às leituras de contexto da action. */
const banco = {
  tanqueExterno: false,
  equipamentoTemEtapa: true,
};

function clienteFalso() {
  return {
    rpc,
    from(tabela: string) {
      const cadeia = {
        select: () => cadeia,
        eq: () => cadeia,
        limit: () => cadeia,
        maybeSingle: async () => {
          if (tabela === "tanques") return { data: { eh_externo: banco.tanqueExterno }, error: null };
          if (tabela === "centros_custo") return { data: banco.equipamentoTemEtapa ? { id: "etapa" } : null, error: null };
          return { data: null, error: null };
        },
      };
      return cadeia;
    },
  };
}

describe("salvarAbastecimento", () => {
  beforeEach(() => {
    exigirPermissao.mockReset();
    createClient.mockReset();
    rpc.mockReset();
    lerAlocacoesDaSaida.mockReset();
    banco.tanqueExterno = false;
    banco.equipamentoTemEtapa = true;
    createClient.mockImplementation(async () => clienteFalso());
    lerAlocacoesDaSaida.mockResolvedValue([]);
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

  it("o servidor relê o tanque: equipamento em tanque externo é recusado sem chamar a RPC", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    banco.tanqueExterno = true;
    await expect(salvarAbastecimento(null, { ...DADOS, insumoId: DIESEL })).resolves.toEqual({
      erro: "Tanque externo é só para carreta de transportadora",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("equipamento sem etapa (alugado) sem obra é recusado", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    banco.equipamentoTemEtapa = false;
    await expect(salvarAbastecimento(null, DADOS)).resolves.toEqual({
      erro: "Equipamento sem etapa própria: informe a obra onde ele trabalhou",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("cria: p_id nulo e p_dados montado", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    rpc.mockResolvedValue({ data: ID, error: null });
    await expect(salvarAbastecimento(null, { ...DADOS, obraId: OBRA })).resolves.toEqual({ ok: true, id: ID });
    expect(lerAlocacoesDaSaida).not.toHaveBeenCalled();
    const [nome, args] = rpc.mock.calls[0] as [string, { p_id: unknown; p_dados: Record<string, unknown> }];
    expect(nome).toBe("fn_comb_salvar_saida");
    expect(args.p_id).toBeNull();
    expect(args.p_dados).toMatchObject({
      origem: "tanque",
      tipo_consumidor: "equipamento_proprio",
      tanque_id: TANQUE,
      equipamento_id: EQUIP,
      litros: 150.5,
      preco_combustivel: null,
      canal: "computador",
      alocacoes: [{ centro_custo_id: OBRA, percentual: 100 }],
    });
  });

  it("edita: as alocações de antes vêm do banco e a etapa da origem sobrevive", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    lerAlocacoesDaSaida.mockResolvedValue([{ centroCustoId: OBRA, percentual: 100, etapaLegado: "Terraplenagem" }]);
    rpc.mockResolvedValue({ data: ID, error: null });
    await expect(salvarAbastecimento(ID, { ...DADOS, obraId: OBRA })).resolves.toEqual({ ok: true, id: ID });
    expect(lerAlocacoesDaSaida).toHaveBeenCalledWith(ID);
    const [, args] = rpc.mock.calls[0] as [string, { p_id: unknown; p_dados: { alocacoes: unknown } }];
    expect(args.p_id).toBe(ID);
    expect(args.p_dados.alocacoes).toEqual([{ centro_custo_id: OBRA, percentual: 100, etapa_legado: "Terraplenagem" }]);
  });

  it("carreta em tanque externo: o preço do dono vazio vai igual ao cobrado", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    banco.tanqueExterno = true;
    rpc.mockResolvedValue({ data: ID, error: null });
    await salvarAbastecimento(null, {
      ...DADOS,
      tipoConsumidor: "carreta_transportadora",
      transportadoraId: TRANSP,
      insumoId: DIESEL,
      precoCombustivel: 6.8,
      taxaLitro: 0.15,
    });
    const [, args] = rpc.mock.calls[0] as [string, { p_dados: Record<string, unknown> }];
    expect(args.p_dados).toMatchObject({ equipamento_id: null, preco_combustivel: 6.8, preco_proprietario: 6.8, taxa_litro: 0.15 });
  });

  it("a trava do banco (P0001) chega à tela; a 23514 de saldo também", async () => {
    exigirPermissao.mockResolvedValue(undefined);
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "P0001", message: "Saldo insuficiente no tanque nessa data: 120.50 L disponíveis" },
    });
    await expect(salvarAbastecimento(null, DADOS)).resolves.toEqual({
      erro: "Saldo insuficiente no tanque nessa data: 120.50 L disponíveis",
    });
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

describe("excluirAbastecimento e consultarEstoqueNaData", () => {
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
