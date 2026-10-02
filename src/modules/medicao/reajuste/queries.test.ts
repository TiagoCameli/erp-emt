// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Consultas do reajuste (RLS, cliente do usuário): o que vale na medição com linhas, rateio (com o
 * código do item) e índices só do relatório que vale; o histórico com os excluídos; os serviços
 * para casar com "0" quando o item não tem linha na view; os PDFs ainda sem relatório.
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
  builder.limit = () => builder;
  builder.eq = (coluna: string, valor: unknown) => {
    filtros[coluna] = valor;
    return builder;
  };
  builder.in = (coluna: string, valores: unknown) => {
    filtros[`${coluna}:in`] = valores;
    return builder;
  };
  builder.is = (coluna: string, valor: unknown) => {
    filtros[`${coluna}:is`] = valor;
    return builder;
  };
  builder.range = () => resolver();
  builder.maybeSingle = () => resolver().then((r) => ({ ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data }));
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

import {
  carregarConfigReajuste,
  carregarReajusteMedicao,
  casamentosSalvos,
  itensParaCasar,
  listarReajustes,
  medicaoParaReajuste,
  pdfDaMedicao,
  pdfsPendentes,
} from "@/modules/medicao/reajuste/queries";

const MED = "m1";

function relatorio(over: Record<string, unknown>) {
  return {
    id: "r1",
    sequencia: 1,
    origem: "siac",
    situacao: "provisorio",
    total: "5.01",
    valor_pi: "400.00",
    medicao_tipo: "PROVISÓRIA",
    contrato_texto: "24 00999/2026 - PROVA",
    periodo_inicio: "2026-01-01",
    periodo_fim: "2026-01-31",
    data_base: "2025-01-01",
    processado_em: "2026-02-10",
    arquivo_id: "a1",
    observacao: null,
    created_at: "2026-02-10T10:00:00Z",
    created_by: "u1",
    excluido_em: null,
    excluido_por: null,
    motivo_exclusao: null,
    ...over,
  };
}

function cenario(over: Partial<Record<string, unknown>> = {}) {
  const dados: Record<string, unknown> = {
    mc_medicoes: [{ id: MED, contrato_id: "c1", versao_id: "v1" }],
    mc_v_reajuste_medicao: [
      { medicao_id: MED, relatorio_id: "r2", sequencia: 2, origem: "siac", situacao: "definitivo", total: "8.00", anterior_total: "5.01", diferenca: "2.99", relatorios: 2 },
    ],
    mc_reajuste_relatorios: [
      relatorio({}),
      relatorio({ id: "r2", sequencia: 2, situacao: "definitivo", total: "8.00", arquivo_id: "a2", created_by: "u2" }),
      relatorio({ id: "r3", sequencia: 3, situacao: "definitivo", total: "9.00", arquivo_id: "a3", excluido_em: "2026-03-01T10:00:00Z", excluido_por: "u1", motivo_exclusao: "PDF errado" }),
    ],
    anexo_vinculos: [
      { arquivo_id: "a3", created_at: "2026-02-12T10:00:00Z", arquivos: { path_storage: "p/a3.pdf", nome_original: "siac-3.pdf" } },
      { arquivo_id: "a2", created_at: "2026-02-11T10:00:00Z", arquivos: { path_storage: "p/a2.pdf", nome_original: "siac-2.pdf" } },
      { arquivo_id: "a1", created_at: "2026-02-10T10:00:00Z", arquivos: { path_storage: "p/a1.pdf", nome_original: "siac-1.pdf" } },
      { arquivo_id: "a4", created_at: "2026-02-13T10:00:00Z", arquivos: { path_storage: "p/a4.pdf", nome_original: "siac-4.pdf" } },
    ],
    mc_reajuste_linhas: [
      { id: "l1", relatorio_id: "r2", ordem: 1, grupo: "1,0", grupo_descricao: "ADM", codigo: "111", descricao: "Linha 111", unidade: "M3", preco_unitario: "10", valor_pi: "400.00", fator: "0.03", reajuste: "12.00" },
      { id: "l2", relatorio_id: "r2", ordem: 2, grupo: "1,0", grupo_descricao: "ADM", codigo: "222", descricao: "Linha 222", unidade: "T", preco_unitario: "5", valor_pi: "-50.00", fator: "-0.08", reajuste: "-4.00" },
    ],
    mc_reajuste_rateio: [
      { linha_id: "l1", item_id: "i1", valor_base: "300.00", valor: "9.00" },
      { linha_id: "l1", item_id: "i2", valor_base: "100.00", valor: "3.00" },
      { linha_id: "l2", item_id: "i4", valor_base: "0", valor: "-4.00" },
    ],
    mc_reajuste_relatorio_indices: [{ sigla: "PAV", i0: "100", i1: "103", k: "0.03" }],
    mc_planilha_itens: [
      { item_id: "i1", codigo: "01.01", versao_id: "v1" },
      { item_id: "i2", codigo: "01.02", versao_id: "v1" },
      { item_id: "i4", codigo: "01.04-v0", versao_id: "v0" },
      { item_id: "i4", codigo: "01.04", versao_id: "v1" },
    ],
    ...over,
  };
  estado.responder = (nome) => ({ data: dados[nome] ?? [], error: null });
}

beforeEach(() => {
  estado.consultas = [];
  estado.nomes = [
    { id: "u1", nome: "Tiago" },
    { id: "u2", nome: "Andreia" },
  ];
  cenario();
});

describe("carregarReajusteMedicao", () => {
  it("o que vale, com a diferença do banco", async () => {
    const r = await carregarReajusteMedicao(MED);
    expect(r.vigente).toEqual({ relatorioId: "r2", sequencia: 2, origem: "siac", situacao: "definitivo", total: "8.00", anteriorTotal: "5.01", diferenca: "2.99" });
  });

  it("linhas, rateio e índices só do relatório que vale, com o código do item da versão da medição", async () => {
    const r = await carregarReajusteMedicao(MED);
    const linhas = estado.consultas.filter((c) => c.tabela === "mc_reajuste_linhas" || c.tabela === "mc_reajuste_rateio" || c.tabela === "mc_reajuste_relatorio_indices");
    expect(linhas.map((c) => c.filtros.relatorio_id)).toEqual(["r2", "r2", "r2"]);
    expect(r.linhas.map((l) => [l.grupo, l.codigo, l.reajuste])).toEqual([
      ["1,0", "111", "12.00"],
      ["1,0", "222", "-4.00"],
    ]);
    expect(r.linhas[0].rateio).toEqual([
      { itemId: "i1", codigo: "01.01", valor: "9.00", valorBase: "300.00" },
      { itemId: "i2", codigo: "01.02", valor: "3.00", valorBase: "100.00" },
    ]);
    expect(r.linhas[1].rateio).toEqual([{ itemId: "i4", codigo: "01.04", valor: "-4.00", valorBase: "0" }]);
    expect(r.indices).toEqual([{ sigla: "PAV", i0: "100", i1: "103", k: "0.03" }]);
  });

  it("histórico com todos os relatórios, inclusive o excluído, com nomes e PDF", async () => {
    const r = await carregarReajusteMedicao(MED);
    expect(r.relatorios.map((x) => [x.sequencia, x.total, x.criadoPorNome, x.arquivoNome, x.excluidoEm !== null, x.motivoExclusao])).toEqual([
      [1, "5.01", "Tiago", "siac-1.pdf", false, null],
      [2, "8.00", "Andreia", "siac-2.pdf", false, null],
      [3, "9.00", "Tiago", "siac-3.pdf", true, "PDF errado"],
    ]);
    expect(r.relatorios[2].excluidoPorNome).toBe("Tiago");
  });

  it("sem relatório: vazio, sem buscar linhas", async () => {
    cenario({ mc_v_reajuste_medicao: [], mc_reajuste_relatorios: [] });
    const r = await carregarReajusteMedicao(MED);
    expect(r).toEqual({ vigente: null, relatorios: [], linhas: [], indices: [] });
    expect(estado.consultas.some((c) => c.tabela === "mc_reajuste_linhas")).toBe(false);
  });

  it("manual que vale: sem linhas nem índices", async () => {
    cenario({
      mc_v_reajuste_medicao: [{ medicao_id: MED, relatorio_id: "r9", sequencia: 1, origem: "manual", situacao: "provisorio", total: "-1234.56", anterior_total: null, diferenca: null, relatorios: 1 }],
      mc_reajuste_relatorios: [relatorio({ id: "r9", origem: "manual", total: "-1234.56", valor_pi: null, arquivo_id: null, observacao: "Sem SIAC" })],
    });
    const r = await carregarReajusteMedicao(MED);
    expect(r.vigente?.diferenca).toBeNull();
    expect(r.linhas).toEqual([]);
    expect(r.relatorios[0]).toMatchObject({ origem: "manual", arquivoId: null, arquivoNome: null, observacao: "Sem SIAC", valorPi: null });
  });
});

describe("itensParaCasar", () => {
  it("serviços da versão da medição com o valor da view; '0' quando o item não tem linha", async () => {
    cenario({
      mc_planilha_itens: [
        { item_id: "i1", codigo: "01.01", descricao: "CBUQ", unidade: "t", preco: "10.00" },
        { item_id: "i2", codigo: "01.02", descricao: "Pintura", unidade: "m²", preco: "5.00" },
      ],
      mc_v_medicao_itens: [{ item_id: "i1", valor_medicao: "300.00" }],
    });
    await expect(itensParaCasar(MED)).resolves.toEqual([
      { itemId: "i1", codigo: "01.01", descricao: "CBUQ", unidade: "t", preco: "10.00", valor: "300.00" },
      { itemId: "i2", codigo: "01.02", descricao: "Pintura", unidade: "m²", preco: "5.00", valor: "0" },
    ]);
    const planilha = estado.consultas.find((c) => c.tabela === "mc_planilha_itens");
    expect(planilha?.filtros).toMatchObject({ versao_id: "v1", tipo: "servico" });
  });

  it("valor nulo na view também vira '0'; medição inexistente, lista vazia", async () => {
    cenario({ mc_planilha_itens: [{ item_id: "i1", codigo: "01.01", descricao: "X", unidade: "t", preco: "1" }], mc_v_medicao_itens: [{ item_id: "i1", valor_medicao: null }] });
    expect((await itensParaCasar(MED))[0].valor).toBe("0");
    cenario({ mc_medicoes: [] });
    await expect(itensParaCasar(MED)).resolves.toEqual([]);
  });
});

describe("casamentosSalvos", () => {
  it("de-para do contrato", async () => {
    cenario({ mc_reajuste_de_para: [{ grupo: "4,0", codigo: "60112", item_id: "i1" }] });
    await expect(casamentosSalvos("c1")).resolves.toEqual([{ grupo: "4,0", codigo: "60112", itemId: "i1" }]);
    expect(estado.consultas[0]).toMatchObject({ tabela: "mc_reajuste_de_para", filtros: { contrato_id: "c1" } });
  });
});

describe("pdfDaMedicao e pdfsPendentes", () => {
  it("pdfDaMedicao: o vínculo mc_reajuste da medição com aquele arquivo", async () => {
    cenario({ anexo_vinculos: [{ arquivo_id: "a2", created_at: "x", arquivos: { path_storage: "p/a2.pdf", nome_original: "siac-2.pdf" } }] });
    await expect(pdfDaMedicao(MED, "a2")).resolves.toEqual({ path: "p/a2.pdf", nome: "siac-2.pdf" });
    expect(estado.consultas[0].filtros).toEqual({ entidade_tipo: "mc_reajuste", entidade_id: MED, arquivo_id: "a2" });
    cenario({ anexo_vinculos: [] });
    await expect(pdfDaMedicao(MED, "a9")).resolves.toBeNull();
  });

  it("pdfsPendentes tira só os arquivos de relatório NÃO excluído: o PDF de um relatório excluído volta a ser lido", async () => {
    // O anexo faz dedup por conteúdo: reenviar o mesmo PDF devolve o mesmo arquivo_id, que está no
    // relatório excluído (r3/a3). Ele tem de voltar como pendente para refazer o rateio.
    const base = estado.responder;
    estado.responder = (nome, filtros) => {
      const r = base(nome, filtros);
      if (nome !== "mc_reajuste_relatorios" || filtros["excluido_em:is"] !== null) return r;
      return { ...r, data: (r.data as { excluido_em: string | null }[]).filter((l) => l.excluido_em === null) };
    };
    await expect(pdfsPendentes(MED)).resolves.toEqual([
      { arquivoId: "a3", nome: "siac-3.pdf", criadoEm: "2026-02-12T10:00:00Z" },
      { arquivoId: "a4", nome: "siac-4.pdf", criadoEm: "2026-02-13T10:00:00Z" },
    ]);
    const usados = estado.consultas.find((c) => c.tabela === "mc_reajuste_relatorios");
    expect(usados?.filtros).toEqual({ medicao_id: MED, "excluido_em:is": null });
  });
});

describe("carregarConfigReajuste", () => {
  it("config do contrato ou o padrão (sem reajuste, 12 meses)", async () => {
    cenario({ mc_reajuste_config: [{ tem_reajuste: true, data_base: "2025-01-01", periodicidade_meses: 12, indice_descricao: "SICRO" }] });
    await expect(carregarConfigReajuste("c1")).resolves.toEqual({ temReajuste: true, dataBase: "2025-01-01", periodicidadeMeses: 12, indiceDescricao: "SICRO" });
    cenario({ mc_reajuste_config: [] });
    await expect(carregarConfigReajuste("c1")).resolves.toEqual({ temReajuste: false, dataBase: null, periodicidadeMeses: 12, indiceDescricao: null });
  });
});

describe("listarReajustes", () => {
  function lista(over: Partial<Record<string, unknown>> = {}) {
    cenario({
      mc_medicoes: [
        { id: "m3", contrato_id: "c1", numero: 3, periodo_inicio: "2026-03-01", periodo_fim: "2026-03-31", status: "enviada" },
        { id: "m4", contrato_id: "c1", numero: 4, periodo_inicio: "2026-04-01", periodo_fim: "2026-04-30", status: "aprovada" },
        { id: "m9", contrato_id: "c2", numero: 1, periodo_inicio: "2026-01-01", periodo_fim: "2026-01-31", status: "aprovada" },
      ],
      mc_contratos: [
        { id: "c1", codigo: "L09", nome_obra: "Lote 09" },
        { id: "c2", codigo: "L10", nome_obra: "Lote 10" },
      ],
      mc_v_reajuste_medicao: [
        { medicao_id: "m4", relatorio_id: "r2", sequencia: 2, origem: "siac", situacao: "definitivo", total: "-40021.28", diferenca: "2.99", relatorios: 2 },
        { medicao_id: "m9", relatorio_id: "r5", sequencia: 1, origem: "manual", situacao: "provisorio", total: "10.00", diferenca: null, relatorios: 1 },
      ],
      ...over,
    });
  }

  it("medições enviadas e aprovadas com o reajuste à esquerda", async () => {
    lista();
    const r = await listarReajustes({});
    expect(r.map((l) => [l.contratoCodigo, l.numero, l.situacao, l.total, l.relatorios])).toEqual([
      ["L09", 4, "definitivo", "-40021.28", 2],
      ["L09", 3, null, null, 0],
      ["L10", 1, "provisorio", "10.00", 1],
    ]);
    expect(estado.consultas.find((c) => c.tabela === "mc_medicoes")?.filtros).toMatchObject({ "status:in": ["enviada", "aprovada"] });
  });

  it("filtra contrato e situação", async () => {
    lista();
    await listarReajustes({ contratoId: "c1" });
    expect(estado.consultas.find((c) => c.tabela === "mc_medicoes")?.filtros).toMatchObject({ contrato_id: "c1" });
    lista();
    expect((await listarReajustes({ situacao: "sem_relatorio" })).map((l) => l.medicaoId)).toEqual(["m3"]);
    lista();
    expect((await listarReajustes({ situacao: "provisorio" })).map((l) => l.medicaoId)).toEqual(["m9"]);
  });
});

describe("medicaoParaReajuste", () => {
  it("contrato, número, período e status; null fora da RLS", async () => {
    cenario({ mc_medicoes: [{ id: MED, contrato_id: "c1", numero: 4, periodo_inicio: "2026-02-01", periodo_fim: "2026-02-28", status: "enviada" }] });
    await expect(medicaoParaReajuste(MED)).resolves.toEqual({ id: MED, contratoId: "c1", numero: 4, periodoInicio: "2026-02-01", periodoFim: "2026-02-28", status: "enviada" });
    cenario({ mc_medicoes: [] });
    await expect(medicaoParaReajuste(MED)).resolves.toBeNull();
  });
});
