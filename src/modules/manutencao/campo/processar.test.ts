import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
let usuario: { id: string; nome: string; permissoes: { recurso: string; acao: string }[] } | null = null;

vi.mock("@/lib/erros", () => ({ logErroServidor: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }));
vi.mock("@/lib/permissoes", () => ({
  getUsuarioLogado: async () => usuario,
  temPermissao: (u: typeof usuario, recurso: string, acao: string) =>
    !!u && u.permissoes.some((p) => p.recurso === recurso && p.acao === acao),
}));
vi.mock("@/lib/formatadores", () => ({ dataHojeISO: () => "2026-09-23" }));
const precoFifoCampo = vi.fn();
vi.mock("@/modules/manutencao/campo/queries", () => ({
  precoFifoCampo: (...args: unknown[]) => precoFifoCampo(...args),
}));

import { processarEnvioCampo } from "@/modules/manutencao/campo/processar";

const EQUIP = "11111111-1111-4111-8111-111111111111";
const ID_CLIENTE = "22222222-2222-4222-8222-222222222222";

const medicao = (data = "2026-09-23") => ({
  tipo: "medicao",
  idCliente: ID_CLIENTE,
  dados: { equipamentoId: EQUIP, data, valor: 1234.5, observacoes: "" },
});

const os = {
  tipo: "os",
  idCliente: ID_CLIENTE,
  dados: {
    equipamentoId: EQUIP,
    centroCustoId: null,
    tipo: "corretiva",
    prioridade: "alta",
    descricao: "Vazamento no hidráulico",
    defeitoReportado: "Pinga óleo",
    causaRaiz: null,
    observacoes: null,
    dataAbertura: "2026-09-23",
    medicaoAbertura: null,
  },
};

function com(...permissoes: [string, string][]) {
  usuario = { id: "u", nome: "Operador Teste", permissoes: permissoes.map(([recurso, acao]) => ({ recurso, acao })) };
}

beforeEach(() => {
  rpc.mockReset();
  precoFifoCampo.mockReset();
  precoFifoCampo.mockResolvedValue({ preco: 6.3745, insumoId: "55555555-5555-4555-8555-555555555555" });
  usuario = null;
});

describe("processarEnvioCampo", () => {
  it("leitura vai com origem celular e o id do celular", async () => {
    com(["manutencao.medicoes", "criar"]);
    rpc.mockResolvedValue({ data: "novo", error: null });

    expect(await processarEnvioCampo(medicao())).toEqual({ ok: true, id: "novo" });
    expect(rpc).toHaveBeenCalledWith(
      "fn_registrar_medicao",
      expect.objectContaining({ p_origem: "celular", p_id_cliente: ID_CLIENTE, p_valor: 1234.5 }),
    );
  });

  it("OS vai sempre como nova (p_id nulo), origem celular e id do celular", async () => {
    com(["manutencao.servicos", "criar"]);
    rpc.mockResolvedValue({ data: "os1", error: null });

    expect(await processarEnvioCampo(os)).toEqual({ ok: true, id: "os1" });
    expect(rpc).toHaveBeenCalledWith(
      "fn_os_salvar",
      expect.objectContaining({ p_id: null, p_origem: "celular", p_id_cliente: ID_CLIENTE, p_tipo: "corretiva" }),
    );
  });

  it("sem sessão: passageiro e marcado, sem chamar o banco", async () => {
    expect(await processarEnvioCampo(medicao())).toMatchObject({ ok: false, definitivo: false, semSessao: true });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("permissão de uma coisa não abre a outra", async () => {
    com(["manutencao.medicoes", "criar"]);
    expect(await processarEnvioCampo(os)).toMatchObject({ ok: false, definitivo: true });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("data no futuro é recusa definitiva", async () => {
    com(["manutencao.medicoes", "criar"]);
    expect(await processarEnvioCampo(medicao("2026-09-24"))).toMatchObject({ ok: false, definitivo: true });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("chave a mais no envio é recusada (schema estrito)", async () => {
    com(["manutencao.medicoes", "criar"]);
    const resposta = await processarEnvioCampo({ ...medicao(), extra: 1 });
    expect(resposta).toMatchObject({ ok: false, definitivo: true });
  });

  it("trava do banco (P0001) sobe com o texto dela e é definitiva", async () => {
    com(["manutencao.medicoes", "criar"]);
    rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "Equipamento inativo: reative no cadastro" } });
    expect(await processarEnvioCampo(medicao())).toEqual({
      ok: false,
      erro: "Equipamento inativo: reative no cadastro",
      definitivo: true,
    });
  });

  it("falha de conexão do banco é passageira: a fila tenta de novo", async () => {
    com(["manutencao.medicoes", "criar"]);
    rpc.mockResolvedValue({ data: null, error: { code: "08006", message: "connection failure" } });
    expect(await processarEnvioCampo(medicao())).toMatchObject({ ok: false, definitivo: false });
  });

  it("corrida no id_cliente (23505) repete uma vez e devolve a linha que já existe", async () => {
    com(["manutencao.medicoes", "criar"]);
    rpc
      .mockResolvedValueOnce({ data: null, error: { code: "23505", message: "duplicate key" } })
      .mockResolvedValueOnce({ data: "existente", error: null });
    expect(await processarEnvioCampo(medicao())).toEqual({ ok: true, id: "existente" });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("exceção no meio vira resposta, nunca lança", async () => {
    com(["manutencao.medicoes", "criar"]);
    rpc.mockRejectedValue(new Error("boom"));
    expect(await processarEnvioCampo(medicao())).toMatchObject({ ok: false, definitivo: false });
  });

  it("abastecimento vai como equipamento próprio do tanque, canal celular, obra a 100%", async () => {
    com(["combustivel.saidas", "criar"]);
    rpc.mockResolvedValue({ data: "s1", error: null });
    const TANQUE = "33333333-3333-4333-8333-333333333333";
    const OBRA = "44444444-4444-4444-8444-444444444444";
    const resposta = await processarEnvioCampo({
      tipo: "abastecimento",
      idCliente: ID_CLIENTE,
      dados: { equipamentoId: EQUIP, tanqueId: TANQUE, litros: 120.5, data: "2026-09-23T14:00:00-05:00", medicao: 5000,
        centroCustoId: OBRA, observacoes: "" },
    });
    expect(resposta).toEqual({ ok: true, id: "s1" });
    expect(rpc).toHaveBeenCalledWith("fn_comb_salvar_saida", {
      p_id: null,
      p_dados: expect.objectContaining({ origem: "tanque", tipo_consumidor: "equipamento_proprio", tanque_id: TANQUE,
        equipamento_id: EQUIP, litros: 120.5, canal: "celular", motorista: "Operador Teste",
        preco_medio_tanque: 6.3745, insumo_id: "55555555-5555-4555-8555-555555555555",
        observacoes: "Saída via mobile · Operador Teste", alocacoes: [{ centro_custo_id: OBRA, percentual: 100 }] }),
    });
  });

  it("abastecimento sem obra é recusado sem ir ao banco (a origem pede obra sempre)", async () => {
    com(["combustivel.saidas", "criar"]);
    const resposta = await processarEnvioCampo({
      tipo: "abastecimento",
      idCliente: ID_CLIENTE,
      dados: { equipamentoId: EQUIP, tanqueId: EQUIP, litros: 10, data: "2026-09-23T14:00:00-05:00", medicao: null,
        centroCustoId: null, observacoes: "" },
    });
    expect(resposta).toMatchObject({ ok: false, definitivo: true });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("abastecimento sem permissão de combustível é recusado sem ir ao banco (manutenção não basta)", async () => {
    com(["manutencao.servicos", "criar"], ["manutencao.medicoes", "criar"]);
    const resposta = await processarEnvioCampo({
      tipo: "abastecimento",
      idCliente: ID_CLIENTE,
      dados: { equipamentoId: EQUIP, tanqueId: EQUIP, litros: 10, data: "2026-09-23T14:00:00-05:00", medicao: null,
        centroCustoId: EQUIP, observacoes: "" },
    });
    expect(resposta).toMatchObject({ ok: false, definitivo: true });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("abastecimento sem conseguir ler o FIFO não grava e deixa tentar de novo", async () => {
    com(["combustivel.saidas", "criar"]);
    precoFifoCampo.mockResolvedValue(null);
    const resposta = await processarEnvioCampo({
      tipo: "abastecimento",
      idCliente: ID_CLIENTE,
      dados: { equipamentoId: EQUIP, tanqueId: EQUIP, litros: 10, data: "2026-09-23T14:00:00-05:00", medicao: null,
        centroCustoId: EQUIP, observacoes: "" },
    });
    expect(resposta).toMatchObject({ ok: false, definitivo: false });
    expect(rpc).not.toHaveBeenCalled();
  });
});
