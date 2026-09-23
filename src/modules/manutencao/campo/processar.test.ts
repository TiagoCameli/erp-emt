import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
let usuario: { id: string; permissoes: { recurso: string; acao: string }[] } | null = null;

vi.mock("@/lib/erros", () => ({ logErroServidor: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }));
vi.mock("@/lib/permissoes", () => ({
  getUsuarioLogado: async () => usuario,
  temPermissao: (u: typeof usuario, recurso: string, acao: string) =>
    !!u && u.permissoes.some((p) => p.recurso === recurso && p.acao === acao),
}));
vi.mock("@/lib/formatadores", () => ({ dataHojeISO: () => "2026-09-23" }));

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
  usuario = { id: "u", permissoes: permissoes.map(([recurso, acao]) => ({ recurso, acao })) };
}

beforeEach(() => {
  rpc.mockReset();
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
});
