// @vitest-environment node
import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Versao = { id: string; contratoId: string; numero: number; status: string };

const estado = vi.hoisted(() => ({
  negadas: [] as string[],
  chamadas: [] as { fn: string; args: Record<string, unknown> }[],
  versao: null as Versao | null,
  arquivo: null as { path: string; nome: string } | null,
  buffer: new ArrayBuffer(0),
  anteriores: [] as unknown[] | null,
  hash: "hash-do-servidor",
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissoes", () => ({
  exigirPermissao: vi.fn(async (recurso: string, acao: string) => {
    if (estado.negadas.includes(`${recurso}/${acao}`)) throw new Error("Sem permissão");
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      estado.chamadas.push({ fn, args });
      return { data: 2, error: null };
    },
  }),
}));
vi.mock("@/lib/arquivos", () => ({
  lerBinario: async () => ({ blob: new Blob([estado.buffer]), tamanhoBytes: estado.buffer.byteLength }),
  hashDoArquivo: async () => estado.hash,
}));
vi.mock("@/modules/medicao/planilha/queries", () => ({
  carregarVersaoParaImportar: async () => estado.versao,
  arquivoDaVersao: async () => estado.arquivo,
  linhasDaVersaoAnterior: async () => estado.anteriores,
}));

import {
  aprovarVersao,
  criarRascunho,
  desaprovarVersao,
  excluirVersao,
  gravarImportacao,
  previaDaImportacao,
} from "@/modules/medicao/planilha/actions";

const V = "33333333-3333-4333-8333-333333333333";
const C = "44444444-4444-4444-8444-444444444444";
const MAPA = { aba: "Planilha", linhaCabecalho: 1, colunas: { codigo: 1, descricao: 2, unidade: 3, preco: 4, quantidade: 5, valor: null } };
const H = "hash-do-servidor";
const OK = { paiPorOrdem: {}, itemPorOrdem: {}, duplicadosConfirmados: true, alertasLidos: true };

async function planilha(linhas: unknown[][]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Planilha");
  ws.addRow(["ITEM", "DISCRIMINAÇÃO", "UNID.", "PREÇO UNITÁRIO", "QUANTIDADE"]);
  for (const l of linhas) ws.addRow(l);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

beforeEach(async () => {
  estado.negadas = [];
  estado.chamadas = [];
  estado.versao = { id: V, contratoId: "c", numero: 0, status: "rascunho" };
  estado.arquivo = { path: "anexos/x.xlsx", nome: "planilha.xlsx" };
  estado.anteriores = [];
  estado.hash = "hash-do-servidor";
  estado.buffer = await planilha([["02.07", "Pavimentação"], ["02.07.04", "CBUQ", "t", 580.8642996, 17057.717]]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("gravarImportacao", () => {
  it("sem medicao.planilha/criar não chama o banco", async () => {
    estado.negadas = ["medicao.planilha/criar"];
    await expect(gravarImportacao(V, MAPA, OK, H)).resolves.toEqual({ erro: "Sem permissão para importar planilha" });
    expect(estado.chamadas).toEqual([]);
  });

  it("versão sem xlsx anexado", async () => {
    estado.arquivo = null;
    await expect(gravarImportacao(V, MAPA, OK, H)).resolves.toEqual({ erro: "Anexe o xlsx oficial antes de importar" });
  });

  it("versão que não está em rascunho", async () => {
    estado.versao = { id: V, contratoId: "c", numero: 0, status: "vigente" };
    await expect(gravarImportacao(V, MAPA, OK, H)).resolves.toEqual({ erro: "A versão 0 não está em rascunho" });
  });

  it("alerta que bloqueia impede a gravação", async () => {
    estado.buffer = await planilha([["01", "X", "un", { formula: "1+1" }, 1]]);
    await expect(gravarImportacao(V, MAPA, OK, H)).resolves.toEqual({ erro: "A planilha tem 1 problema que impede a importação" });
    expect(estado.chamadas).toEqual([]);
  });

  it("código repetido sem confirmação", async () => {
    estado.buffer = await planilha([["01", "A", "un", 1, 1], ["01", "B", "un", 1, 1]]);
    await expect(gravarImportacao(V, MAPA, { ...OK, duplicadosConfirmados: false }, H)).resolves.toEqual({ erro: "Confirme os códigos repetidos" });
  });

  it("pai ambíguo sem escolha, e com escolha grava", async () => {
    estado.buffer = await planilha([["02.02", "A", "t", 1, 1], ["02.02", "B", "t", 1, 1], ["02.02.01", "C", "t", 1, 1]]);
    await expect(gravarImportacao(V, MAPA, OK, H)).resolves.toEqual({ erro: "Escolha o pai das linhas com código ambíguo" });
    await expect(gravarImportacao(V, MAPA, { ...OK, paiPorOrdem: { 3: 1 } }, H)).resolves.toEqual({ ok: true, linhas: 2 });
    const linhas = estado.chamadas[0].args.p_linhas as { ordem: number; pai_ordem: number | null }[];
    expect(linhas[2].pai_ordem).toBe(1);
  });

  it("alertas não lidos", async () => {
    estado.buffer = await planilha([["01", "Roçada", "un ", 1, 1]]);
    await expect(gravarImportacao(V, MAPA, { ...OK, alertasLidos: false }, H)).resolves.toEqual({ erro: "Marque que leu os alertas" });
  });

  it("grava os números como texto, o pai por ordem e o hash medido no servidor", async () => {
    await expect(gravarImportacao(V, MAPA, OK, H)).resolves.toEqual({ ok: true, linhas: 2 });
    expect(estado.chamadas).toHaveLength(1);
    const { fn, args } = estado.chamadas[0];
    expect(fn).toBe("fn_mc_planilha_gravar_linhas");
    expect(args.p_arquivo_hash).toBe("hash-do-servidor");
    expect(args.p_arquivo_nome).toBe("planilha.xlsx");
    expect(args.p_linhas).toEqual([
      { ordem: 1, codigo: "02.07", pai_ordem: null, descricao: "Pavimentação", unidade: null, tipo: "titulo",
        preco_unitario: null, quantidade_prevista: null, linha_origem: 2, item_id: null },
      { ordem: 2, codigo: "02.07.04", pai_ordem: 1, descricao: "CBUQ", unidade: "t", tipo: "servico",
        preco_unitario: "580.8642996", quantidade_prevista: "17057.717", linha_origem: 3, item_id: null },
    ]);
  });

  it("aditivo com item ambíguo não grava", async () => {
    estado.versao = { id: V, contratoId: "c", numero: 1, status: "rascunho" };
    estado.anteriores = [
      { itemId: "a", codigo: "02.07.04", descricao: "CBUQ", unidade: "t", tipo: "servico", precoUnitario: "580", quantidadePrevista: "1" },
      { itemId: "b", codigo: "02.07.04", descricao: "CBUQ", unidade: "t", tipo: "servico", precoUnitario: "580", quantidadePrevista: "1" },
    ];
    await expect(gravarImportacao(V, MAPA, OK, H)).resolves.toEqual({ erro: "Resolva os itens ambíguos do aditivo" });
  });

  // Além do brief: a escolha do usuário resolve o ambíguo e o item vai no payload.
  it("aditivo com item escolhido grava o item_id da versão anterior", async () => {
    estado.versao = { id: V, contratoId: "c", numero: 1, status: "rascunho" };
    estado.anteriores = [
      { itemId: "a", codigo: "02.07.04", descricao: "CBUQ", unidade: "t", tipo: "servico", precoUnitario: "580", quantidadePrevista: "1" },
      { itemId: "b", codigo: "02.07.04", descricao: "CBUQ", unidade: "t", tipo: "servico", precoUnitario: "580", quantidadePrevista: "1" },
    ];
    await expect(gravarImportacao(V, MAPA, { ...OK, itemPorOrdem: { 2: "b" } }, H)).resolves.toEqual({ ok: true, linhas: 2 });
    const linhas = estado.chamadas[0].args.p_linhas as { item_id: string | null }[];
    expect(linhas.map((l) => l.item_id)).toEqual([null, "b"]);
  });

  it("mapeamento inválido não chega ao arquivo", async () => {
    await expect(gravarImportacao(V, { ...MAPA, linhaCabecalho: 0 }, OK, H)).resolves.toEqual({ erro: "Mapeamento de colunas inválido" });
    expect(estado.chamadas).toEqual([]);
  });

  it("aba que não existe vira erro de tela, não exceção", async () => {
    await expect(gravarImportacao(V, { ...MAPA, aba: "Outra" }, OK, H)).resolves.toEqual({ erro: "A aba Outra não existe no arquivo" });
  });
});

describe("arquivo trocado entre a prévia e a gravação", () => {
  it("prévia com o arquivo A e gravação com o B mais recente: recusa sem chamar o banco", async () => {
    estado.hash = "hash-A";
    const r = await previaDaImportacao(V, MAPA, OK);
    const hashDaPrevia = "ok" in r ? r.previa.arquivoHash : "";
    expect(hashDaPrevia).toBe("hash-A");
    estado.hash = "hash-B";
    estado.arquivo = { path: "anexos/b.xlsx", nome: "planilha-nova.xlsx" };
    await expect(gravarImportacao(V, MAPA, OK, hashDaPrevia)).resolves.toEqual({ erro: "O arquivo mudou desde a prévia. Veja a prévia de novo" });
    expect(estado.chamadas).toEqual([]);
  });

  it("sem o hash da prévia não grava", async () => {
    await expect(gravarImportacao(V, MAPA, OK, "")).resolves.toEqual({ erro: "Veja a prévia antes de gravar" });
    expect(estado.chamadas).toEqual([]);
  });

  it("aditivo sem a versão anterior recusa em vez de tratar tudo como novo", async () => {
    estado.versao = { id: V, contratoId: "c", numero: 2, status: "rascunho" };
    estado.anteriores = null;
    await expect(gravarImportacao(V, MAPA, OK, H)).resolves.toEqual({
      erro: "A versão 1 do contrato não foi encontrada. Não dá para casar os itens do aditivo",
    });
    expect(estado.chamadas).toEqual([]);
  });
});

describe("previaDaImportacao", () => {
  it("devolve a montagem, o diagnóstico e a contagem de bloqueios sem gravar", async () => {
    estado.buffer = await planilha([["01", "X", "un", { formula: "1+1" }, 1]]);
    const r = await previaDaImportacao(V, MAPA, OK);
    expect("ok" in r && r.previa.bloqueios).toBe(1);
    expect("ok" in r && r.previa.numeroVersao).toBe(0);
    expect("ok" in r && r.previa.casamento).toBeNull();
    expect(estado.chamadas).toEqual([]);
  });
});

describe("criarRascunho", () => {
  it("sem medicao.planilha/criar não chama o banco", async () => {
    estado.negadas = ["medicao.planilha/criar"];
    await expect(criarRascunho(C, { aditivoId: null, vigenteDesde: "2026-01-01", motivo: "" })).resolves.toEqual({
      erro: "Sem permissão para importar planilha",
    });
    expect(estado.chamadas).toEqual([]);
  });

  it("manda os dados no formato da RPC", async () => {
    await criarRascunho(C, { aditivoId: null, vigenteDesde: "2026-01-01", motivo: " Licitada " });
    expect(estado.chamadas).toEqual([
      { fn: "fn_mc_planilha_criar_rascunho", args: { p_contrato: C, p_dados: { aditivo_id: null, vigente_desde: "2026-01-01", motivo: "Licitada" } } },
    ]);
  });

  it("recusa data vazia", async () => {
    await expect(criarRascunho(C, { aditivoId: null, vigenteDesde: "", motivo: "" })).resolves.toEqual({
      erro: "Informe a data de início da versão",
    });
  });
});

describe("transições", () => {
  it("aprovar exige medicao.planilha/aprovar", async () => {
    estado.negadas = ["medicao.planilha/aprovar"];
    await expect(aprovarVersao(V)).resolves.toEqual({ erro: "Sem permissão para tornar a versão vigente" });
    expect(estado.chamadas).toEqual([]);
  });

  it("desaprovar exige motivo e chama a RPC", async () => {
    await expect(desaprovarVersao(V, "  ")).resolves.toMatchObject({ erro: expect.any(String) });
    expect(estado.chamadas).toEqual([]);
    await expect(desaprovarVersao(V, "Erro na importação")).resolves.toEqual({ ok: true });
    expect(estado.chamadas).toEqual([{ fn: "fn_mc_planilha_desaprovar", args: { p_versao: V, p_motivo: "Erro na importação" } }]);
  });

  it("excluir usa fn_mc_excluir da tabela das versões", async () => {
    estado.negadas = ["medicao.planilha/excluir"];
    await expect(excluirVersao(V, "Rascunho errado")).resolves.toEqual({ erro: "Sem permissão para excluir a versão" });
    estado.negadas = [];
    await expect(excluirVersao(V, "Rascunho errado")).resolves.toEqual({ ok: true });
    expect(estado.chamadas).toEqual([
      { fn: "fn_mc_excluir", args: { p_tabela: "mc_planilha_versoes", p_id: V, p_motivo: "Rascunho errado" } },
    ]);
  });
});
