"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { EventoTrilha } from "@/components/canonicos";
import { erroAcao, logErroServidor, semLancar } from "@/lib/erros";
import { dataHojeISO, formatarData } from "@/lib/formatadores";
import { idSchema } from "@/lib/id";
import { type ColunaImportacao, lerEValidarXlsx } from "@/lib/importacao";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { traduzirErroFrete } from "@/modules/frete/pagamentos/erros";
import { trilhaDoRegistro } from "@/modules/frete/pagamentos/queries";
import {
  agruparPedidos,
  COLUNAS_PEDIDOS,
  lerLinhaPedido,
  type LinhaCruaPedido,
  type LinhaPedidoPronta,
} from "@/modules/frete/pedidos-material/importacao";
import { listarFornecedoresAtivos, listarInsumosAtivos, listarPedidos } from "@/modules/frete/pedidos-material/queries";
import { pDadosDoPedido, type DadosPedido } from "@/modules/frete/pedidos-material/regras";
import { consolidarPedidos, nomeArquivoPedidos } from "@/modules/frete/pedidos-material/relatorio";
import { pedidoSchema } from "@/modules/frete/pedidos-material/schemas";

/**
 * Mutações da aba Pedidos de material (`frete.pedidos-material`). Permissão tripla: a RPC
 * confere no banco, aqui `exigirPermissao`, a tela esconde. Na origem Editar e Excluir da
 * lista usavam as chaves do frete; no ERP vale o recurso da aba.
 */

const RECURSO = "frete.pedidos-material" as const;
const TABELA = "pedidos_material";
const ROTAS = ["/frete/pedidos-material", "/frete", "/frete/anomalias"];

export type ResultadoAcao = { ok: true } | { erro: string };
export type ResultadoSalvar = { ok: true; id: string } | { erro: string };

const motivoSchema = z.string().trim().min(1);

async function temAcao(acao: "ver" | "criar" | "editar" | "excluir"): Promise<boolean> {
  try {
    await exigirPermissao(RECURSO, acao);
    return true;
  } catch {
    return false;
  }
}

async function podeRestaurar(): Promise<boolean> {
  try {
    await exigirPermissao("administracao.lixeira", "editar");
    await exigirPermissao(RECURSO, "excluir");
    return true;
  } catch {
    return false;
  }
}

function revalidar(): void {
  for (const rota of ROTAS) {
    try {
      revalidatePath(rota);
    } catch (erro) {
      logErroServidor("frete.pedidos-material.revalidar", erro);
    }
  }
}

/** Cria (id nulo) ou edita um pedido pela `fn_pedido_material_salvar` (itens refeitos). */
export async function salvarPedido(id: string | null, dados: DadosPedido): Promise<ResultadoSalvar> {
  return semLancar("frete.pedidos-material.salvar", async () => {
    const criando = id === null;
    if (!(await temAcao(criando ? "criar" : "editar"))) {
      return { erro: criando ? "Sem permissão para criar pedido" : "Sem permissão para editar pedido" };
    }
    if (!criando && !idSchema.safeParse(id).success) return { erro: "Pedido inválido" };

    const validado = pedidoSchema.safeParse(dados);
    if (!validado.success) return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_pedido_material_salvar", {
      p_id: id as unknown as string,
      p_dados: pDadosDoPedido(validado.data),
    });
    if (error) {
      return erroAcao(
        "frete.pedidos-material.salvar",
        error,
        traduzirErroFrete(error, "Não foi possível salvar o pedido. Tente novamente"),
      );
    }
    revalidar();
    return { ok: true, id: data ?? id ?? "" };
  });
}

export async function excluirPedido(id: string, motivo: string): Promise<ResultadoAcao> {
  return semLancar("frete.pedidos-material.excluir", async () => {
    if (!(await temAcao("excluir"))) return { erro: "Sem permissão para excluir pedido" };
    if (!idSchema.safeParse(id).success) return { erro: "Pedido inválido" };
    const motivoValido = motivoSchema.safeParse(motivo);
    if (!motivoValido.success) return { erro: "Informe o motivo da exclusão" };

    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_frete_excluir", { p_tabela: TABELA, p_id: id, p_motivo: motivoValido.data });
    if (error) {
      return erroAcao(
        "frete.pedidos-material.excluir",
        error,
        traduzirErroFrete(error, "Não foi possível excluir o pedido. Tente novamente"),
      );
    }
    revalidar();
    return { ok: true };
  });
}

export async function restaurarPedido(id: string): Promise<ResultadoAcao> {
  return semLancar("frete.pedidos-material.restaurar", async () => {
    if (!(await podeRestaurar())) return { erro: "Sem permissão para restaurar pedido" };
    if (!idSchema.safeParse(id).success) return { erro: "Pedido inválido" };

    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_frete_restaurar", { p_tabela: TABELA, p_id: id });
    if (error) {
      return erroAcao(
        "frete.pedidos-material.restaurar",
        error,
        traduzirErroFrete(error, "Não foi possível restaurar o pedido. Tente novamente"),
      );
    }
    revalidar();
    return { ok: true };
  });
}

export async function carregarTrilhaPedido(id: string): Promise<EventoTrilha[]> {
  try {
    await exigirPermissao(RECURSO, "ver");
    if (!idSchema.safeParse(id).success) return [];
    return await trilhaDoRegistro(TABELA, id, "Pedido", "m");
  } catch (erro) {
    logErroServidor("frete.pedidos-material.trilha", erro);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Exportar (Excel da origem)
// ---------------------------------------------------------------------------

const filtrosSchema = z.strictObject({
  fornecedorId: z.union([z.literal(""), idSchema]),
  materialId: z.union([z.literal(""), idSchema]),
  de: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
  ate: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
});

export type ResultadoPlanilha = { ok: true; base64: string; nomeArquivo: string } | { erro: string };

/**
 * Excel dos pedidos com o filtro da lista. Exportar é ler: pede `ver`. Roda na função da
 * PÁGINA, que declara `maxDuration`; o exceljs entra por `await import`.
 */
export async function gerarPlanilhaPedidosMaterial(filtros: unknown): Promise<ResultadoPlanilha> {
  if (!(await temAcao("ver"))) return { erro: "Sem permissão para exportar pedidos de material" };
  const validado = filtrosSchema.safeParse(filtros);
  if (!validado.success) return { erro: "Filtro inválido" };
  const f = validado.data;

  try {
    const pedidos = await listarPedidos();
    const dados = consolidarPedidos(pedidos, f);
    const rotulos: [string, string][] = [];
    if (f.fornecedorId) {
      rotulos.push(["Fornecedor", pedidos.find((p) => p.fornecedorId === f.fornecedorId)?.fornecedorNome ?? f.fornecedorId]);
    }
    if (f.materialId) {
      const nome = pedidos.flatMap((p) => p.itens).find((i) => i.insumoId === f.materialId)?.insumoNome;
      rotulos.push(["Material", nome ?? f.materialId]);
    }
    if (f.de) rotulos.push(["Data início", formatarData(f.de)]);
    if (f.ate) rotulos.push(["Data fim", formatarData(f.ate)]);

    const { montarPlanilhaPedidos } = await import("@/modules/frete/pedidos-material/planilha");
    const workbook = montarPlanilhaPedidos(dados, rotulos);
    const buffer = await workbook.xlsx.writeBuffer();
    return { ok: true, base64: Buffer.from(buffer).toString("base64"), nomeArquivo: nomeArquivoPedidos(dataHojeISO()) };
  } catch (erro) {
    return erroAcao("frete.pedidos-material.exportar", erro, "Não foi possível gerar a planilha. Tente novamente");
  }
}

// ---------------------------------------------------------------------------
// Importação
// ---------------------------------------------------------------------------

const COLUNAS_IMPORT: ColunaImportacao<LinhaCruaPedido>[] = COLUNAS_PEDIDOS.map((c) => ({
  chave: c.chave,
  rotulo: c.rotulo,
}));

interface PlanilhaLida {
  prontas: { linha: number; dados: LinhaPedidoPronta }[];
  invalidas: { linha: number; erros: string[] }[];
  totalLinhas: number;
}

async function lerPlanilha(formData: FormData): Promise<PlanilhaLida> {
  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File)) throw new Error("Nenhum arquivo enviado");
  const resultado = await lerEValidarXlsx<LinhaCruaPedido>(Buffer.from(await arquivo.arrayBuffer()), COLUNAS_IMPORT);
  const [fornecedores, insumos] = await Promise.all([listarFornecedoresAtivos(), listarInsumosAtivos()]);
  const cadastros = {
    fornecedores: fornecedores.map((f) => ({ id: f.id, nomes: f.nomes })),
    insumos: insumos.map((i) => ({ id: i.id, nomes: [i.nome] })),
  };

  const prontas: PlanilhaLida["prontas"] = [];
  const invalidas = resultado.invalidas.map((l) => ({ linha: l.linha, erros: l.erros }));
  for (const linha of resultado.validas) {
    const lida = lerLinhaPedido(linha.dados, cadastros);
    if (lida.dados) prontas.push({ linha: linha.linha, dados: lida.dados });
    else invalidas.push({ linha: linha.linha, erros: lida.erros });
  }
  invalidas.sort((a, b) => a.linha - b.linha);
  return { prontas, invalidas, totalLinhas: resultado.totalLinhas };
}

export interface ResumoImportacao {
  validas: number;
  invalidas: { linha: number; erros: string[] }[];
  totalLinhas: number;
}

export async function validarImportPedidos(formData: FormData): Promise<ResumoImportacao> {
  try {
    await exigirPermissao(RECURSO, "criar");
    const lida = await lerPlanilha(formData);
    return { validas: lida.prontas.length, invalidas: lida.invalidas, totalLinhas: lida.totalLinhas };
  } catch (erro) {
    logErroServidor("frete.pedidos-material.validarImport", erro);
    const mensagem = erro instanceof Error && erro.message ? erro.message : "Não foi possível ler a planilha";
    return { validas: 0, invalidas: [{ linha: 1, erros: [mensagem] }], totalLinhas: 0 };
  }
}

export type ResultadoImportacao =
  | { importadas: number; itens: number; falhas: { linha: number; erro: string }[] }
  | { erro: string };

/**
 * Agrupa as linhas por data e fornecedor (um pedido por grupo, como a origem) e grava cada
 * pedido pela RPC do formulário. Um pedido recusado volta em `falhas` com as linhas dele.
 * `importadas` conta PEDIDOS; `itens`, as linhas gravadas.
 */
export async function importarPedidos(formData: FormData): Promise<ResultadoImportacao> {
  try {
    await exigirPermissao(RECURSO, "criar");
  } catch {
    return { erro: "Sem permissão para importar pedidos" };
  }

  let lida: PlanilhaLida;
  try {
    lida = await lerPlanilha(formData);
  } catch (erro) {
    return erroAcao(
      "frete.pedidos-material.importar",
      erro,
      erro instanceof Error && erro.message ? erro.message : "Não foi possível ler a planilha",
    );
  }
  if (lida.prontas.length === 0) return { erro: "Nenhuma linha válida para importar" };

  const supabase = await createClient();
  let importadas = 0;
  let itens = 0;
  const falhas: { linha: number; erro: string }[] = [];
  for (const grupo of agruparPedidos(lida.prontas)) {
    let mensagem: string | null = null;
    try {
      const { error } = await supabase.rpc("fn_pedido_material_salvar", {
        p_id: null as unknown as string,
        p_dados: pDadosDoPedido(grupo.dados),
      });
      if (error) {
        logErroServidor("frete.pedidos-material.importar", error);
        mensagem = traduzirErroFrete(error, "Não foi possível gravar o pedido");
      }
    } catch (erro) {
      logErroServidor("frete.pedidos-material.importar", erro);
      mensagem = "Não foi possível gravar o pedido";
    }
    if (mensagem) for (const linha of grupo.linhas) falhas.push({ linha, erro: mensagem });
    else {
      importadas += 1;
      itens += grupo.dados.itens.length;
    }
  }

  if (importadas > 0) revalidar();
  return { importadas, itens, falhas };
}
