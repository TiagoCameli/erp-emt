// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `carregarMedicao` junta a medição, o contrato, a versão, o valor (texto, D7), as revisões, os itens
 * de `mc_v_medicao_itens` com código e descrição da planilha (da versão da medição ou, para o item
 * que saiu num aditivo, da linha que a view apontou), os ajustes da revisão corrente somados por item
 * (soma exata, sem float) e os eventos com o nome de quem fez.
 */

vi.mock("server-only", () => ({}));

type Filtros = Record<string, unknown>;
type Resultado = { data: unknown; error: unknown };

const estado = vi.hoisted(() => ({
  responder: (() => ({ data: [], error: null })) as (tabela: string, filtros: Record<string, unknown>) => { data: unknown; error: unknown },
  consultas: [] as { tabela: string; filtros: Record<string, unknown> }[],
  nomes: [] as { id: string; nome: string }[],
}));

function tabela(nome: string) {
  const filtros: Filtros = {};
  const resolver = (): Promise<Resultado> => {
    estado.consultas.push({ tabela: nome, filtros });
    return Promise.resolve(estado.responder(nome, filtros));
  };
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.order = () => builder;
  builder.eq = (coluna: string, valor: unknown) => {
    filtros[coluna] = valor;
    return builder;
  };
  builder.in = (coluna: string, valores: unknown) => {
    filtros[`${coluna}:in`] = valores;
    return builder;
  };
  builder.range = () => resolver();
  builder.maybeSingle = () =>
    resolver().then((r) => ({ ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data }));
  builder.then = (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) => resolver().then(ok, falha);
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (nome: string) => tabela(nome),
    rpc: async (fn: string) => {
      if (fn !== "nomes_usuarios_auditoria") throw new Error(`rpc inesperada: ${fn}`);
      return { data: estado.nomes, error: null };
    },
  }),
}));

import { carregarMedicao, revisaoItens } from "@/modules/medicao/medicoes/detalhe-queries";

const MED = "m1";

function cenario(over: Partial<Record<string, unknown>> = {}) {
  const dados: Record<string, unknown> = {
    mc_medicoes: [{ id: MED, contrato_id: "c1", numero: 2, periodo_inicio: "2026-02-01", periodo_fim: "2026-02-28", status: "em_conferencia", versao_id: "v1" }],
    mc_contratos: [{ codigo: "K5", nome_obra: "Obra teste" }],
    mc_planilha_versoes: [{ numero: 1 }],
    mc_v_medicao_totais: [{ valor: "70.00" }],
    mc_medicao_revisoes: [{ id: "r0", numero: 0, fase: "antes_aprovacao", status: "em_aberto", motivo: null, created_at: "2026-02-01T10:00:00Z" }],
    mc_v_medicao_itens: [
      { item_id: "i2", planilha_item_id: "p0-i2", qtd_medida: "2", qtd_aprovada: null, glosa: null, valor_medicao: "10.00" },
      { item_id: "i1", planilha_item_id: "p1-i1", qtd_medida: "4", qtd_aprovada: null, glosa: null, valor_medicao: "48.00" },
    ],
    mc_planilha_itens_versao: [
      { id: "p1-t", item_id: "t", codigo: "01", descricao: "Pavimentação", unidade: null, ordem: 1, tipo: "titulo" },
      { id: "p1-i1", item_id: "i1", codigo: "01.01", descricao: "CBUQ", unidade: "t", ordem: 2, tipo: "servico" },
    ],
    mc_planilha_itens_ids: [{ id: "p0-i2", item_id: "i2", codigo: "01.02", descricao: "Pintura de ligação", unidade: "m²", ordem: 3, tipo: "servico" }],
    mc_ajustes: [
      { item_id: "i1", quantidade: "-2" },
      { item_id: "i1", quantidade: "1.0001" },
    ],
    mc_medicao_eventos: [
      { id: "e1", evento: "abrir", de_status: null, para_status: "aberta", motivo: null, usuario_id: "u1", criado_em: "2026-02-01T10:00:00Z" },
      { id: "e2", evento: "fechar", de_status: "aberta", para_status: "em_conferencia", motivo: null, usuario_id: null, criado_em: "2026-03-01T10:00:00Z" },
    ],
    ...over,
  };
  estado.responder = (nome, filtros) => {
    if (nome === "mc_planilha_itens") {
      return { data: filtros["id:in"] ? dados.mc_planilha_itens_ids : dados.mc_planilha_itens_versao, error: null };
    }
    return { data: dados[nome] ?? [], error: null };
  };
}

beforeEach(() => {
  estado.consultas = [];
  estado.nomes = [{ id: "u1", nome: "Tiago" }];
  cenario();
});

describe("carregarMedicao", () => {
  it("medição fora da lista de acesso (RLS) ou inexistente: null", async () => {
    cenario({ mc_medicoes: [] });
    await expect(carregarMedicao(MED)).resolves.toBeNull();
  });

  it("monta cabeçalho, revisões, itens na ordem da planilha, ajustes somados e eventos", async () => {
    const m = await carregarMedicao(MED);
    expect(m).not.toBeNull();
    expect(m).toMatchObject({
      id: MED,
      contratoId: "c1",
      contratoCodigo: "K5",
      contratoNome: "Obra teste",
      numero: 2,
      periodoInicio: "2026-02-01",
      periodoFim: "2026-02-28",
      status: "em_conferencia",
      versaoNumero: 1,
      valor: "70.00",
    });
    expect(m?.revisaoCorrente?.id).toBe("r0");
    expect(m?.revisoes).toEqual([
      { id: "r0", numero: 0, fase: "antes_aprovacao", status: "em_aberto", motivo: null, criadoEm: "2026-02-01T10:00:00Z" },
    ]);
    expect(m?.itens).toEqual([
      { itemId: "i1", codigo: "01.01", descricao: "CBUQ", unidade: "t", qtdMedida: "4", ajustes: "-0.9999", qtdAprovada: null, glosa: null, valor: "48.00" },
      { itemId: "i2", codigo: "01.02", descricao: "Pintura de ligação", unidade: "m²", qtdMedida: "2", ajustes: null, qtdAprovada: null, glosa: null, valor: "10.00" },
    ]);
    // Serviço do ajuste: só os serviços da versão da medição (título fica de fora).
    expect(m?.servicos).toEqual([{ itemId: "i1", codigo: "01.01", descricao: "CBUQ", unidade: "t" }]);
    expect(m?.eventos).toEqual([
      { id: "e1", evento: "abrir", deStatus: null, paraStatus: "aberta", motivo: null, criadoEm: "2026-02-01T10:00:00Z", usuarioNome: "Tiago" },
      { id: "e2", evento: "fechar", deStatus: "aberta", paraStatus: "em_conferencia", motivo: null, criadoEm: "2026-03-01T10:00:00Z", usuarioNome: null },
    ]);
  });

  it("ajustes vêm da revisão corrente; sem corrente (aprovada), da última revisão", async () => {
    await carregarMedicao(MED);
    expect(estado.consultas.find((c) => c.tabela === "mc_ajustes")?.filtros).toEqual({ revisao_id: "r0" });

    estado.consultas = [];
    cenario({
      mc_medicoes: [{ id: MED, contrato_id: "c1", numero: 2, periodo_inicio: "2026-02-01", periodo_fim: "2026-02-28", status: "aprovada", versao_id: "v1" }],
      mc_medicao_revisoes: [
        { id: "r0", numero: 0, fase: "antes_aprovacao", status: "substituida", motivo: null, created_at: "2026-02-01T10:00:00Z" },
        { id: "r1", numero: 1, fase: "antes_aprovacao", status: "aprovada", motivo: "DNIT devolveu", created_at: "2026-03-01T10:00:00Z" },
      ],
    });
    const m = await carregarMedicao(MED);
    expect(m?.revisaoCorrente).toBeNull();
    expect(estado.consultas.find((c) => c.tabela === "mc_ajustes")?.filtros).toEqual({ revisao_id: "r1" });
  });

  it("não busca de novo a linha da planilha que já veio da versão", async () => {
    cenario({ mc_v_medicao_itens: [{ item_id: "i1", planilha_item_id: "p1-i1", qtd_medida: "4", qtd_aprovada: null, glosa: null, valor_medicao: "48.00" }] });
    await carregarMedicao(MED);
    expect(estado.consultas.some((c) => c.tabela === "mc_planilha_itens" && c.filtros["id:in"])).toBe(false);
  });

  it("erro do banco nos itens sobe para quem chamou", async () => {
    const original = estado.responder;
    estado.responder = (nome, filtros) => (nome === "mc_v_medicao_itens" ? { data: null, error: { message: "falhou" } } : original(nome, filtros));
    await expect(carregarMedicao(MED)).rejects.toThrow("falhou");
  });
});

describe("revisaoItens", () => {
  function cenarioCongelado(over: Record<string, unknown> = {}) {
    const dados: Record<string, unknown> = {
      mc_medicao_revisoes: [{ id: "r0" }, { id: "r1" }],
      mc_revisao_itens: [
        { revisao_id: "r0", item_id: "i1", quantidade: "28.0000" },
        { revisao_id: "r1", item_id: "i1", quantidade: "29.0000" },
        { revisao_id: "r1", item_id: "i9", quantidade: "1.5000" },
      ],
      mc_planilha_itens: [{ id: "p0-i9", item_id: "i9", codigo: "09.01", descricao: "Saiu no aditivo", unidade: "m", ordem: 9, tipo: "servico" }],
      ...over,
    };
    estado.responder = (nome) => ({ data: dados[nome] ?? [], error: null });
  }

  it("quantidades congeladas de todas as revisões da medição, como texto", async () => {
    cenarioCongelado();
    const r = await revisaoItens(MED, ["i1"]);
    expect(estado.consultas.find((c) => c.tabela === "mc_medicao_revisoes")?.filtros).toEqual({ medicao_id: MED });
    expect(estado.consultas.find((c) => c.tabela === "mc_revisao_itens")?.filtros).toEqual({ "revisao_id:in": ["r0", "r1"] });
    expect(r.congelados).toEqual([
      { revisaoId: "r0", itemId: "i1", quantidade: "28.0000" },
      { revisaoId: "r1", itemId: "i1", quantidade: "29.0000" },
      { revisaoId: "r1", itemId: "i9", quantidade: "1.5000" },
    ]);
  });

  it("rótulo só do item que o detalhe não conhece (saiu da planilha)", async () => {
    cenarioCongelado();
    const r = await revisaoItens(MED, ["i1"]);
    expect(estado.consultas.find((c) => c.tabela === "mc_planilha_itens")?.filtros).toEqual({ "item_id:in": ["i9"] });
    expect(r.extras).toEqual([{ itemId: "i9", codigo: "09.01", descricao: "Saiu no aditivo", unidade: "m" }]);
  });

  it("sem revisão não consulta itens congelados", async () => {
    cenarioCongelado({ mc_medicao_revisoes: [] });
    await expect(revisaoItens(MED, [])).resolves.toEqual({ congelados: [], extras: [] });
    expect(estado.consultas.some((c) => c.tabela === "mc_revisao_itens")).toBe(false);
  });

  it("erro do banco sobe", async () => {
    estado.responder = (nome) => (nome === "mc_revisao_itens" ? { data: null, error: { message: "falhou" } } : { data: [{ id: "r0" }], error: null });
    await expect(revisaoItens(MED, [])).rejects.toThrow("falhou");
  });
});
