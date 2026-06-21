"use server";

import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";
import { z } from "zod";

import type { Acao } from "@/config/recursos";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  formatarBRL,
  formatarData,
  formatarQuantidade,
} from "@/lib/formatadores";
import { buscarFolha } from "@/modules/rh/folha/queries";
import {
  gerarFolhaSchema,
  type GerarFolhaInput,
} from "@/modules/rh/folha/schemas";

const RECURSO = "rh.folha" as const;
const ROTA = "/rh/folha";

/** Caminho do detalhe de uma folha, para revalidar junto com a lista. */
function rotaDetalhe(id: string): string {
  return `${ROTA}/${id}`;
}

export type ResultadoAcao = { ok: true } | { erro: string };
export type ResultadoGeracao = { ok: true; id: string } | { erro: string };
export type ResultadoPlanilha =
  | { ok: true; base64: string; nomeArquivo: string }
  | { erro: string };

const uuidSchema = z.uuid();

/** Converte o throw de exigirPermissao no contrato { erro } das actions. */
async function checarPermissao(acao: Acao): Promise<boolean> {
  try {
    await exigirPermissao(RECURSO, acao);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Gerar folha (criar/regenerar o rascunho da competência)            */
/* ------------------------------------------------------------------ */

/**
 * Gera a folha gerencial da competência via fn_gerar_folha: cria (ou regenera)
 * o rascunho consolidando os colaboradores CLT ativos, aplicando o percentual
 * de encargos. Reaplicar regenera a folha em rascunho. Retorna o id da folha.
 */
export async function gerarFolha(
  dados: GerarFolhaInput,
): Promise<ResultadoGeracao> {
  if (!(await checarPermissao("criar"))) {
    return { erro: "Sem permissão para gerar folhas" };
  }

  const validado = gerarFolhaSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_gerar_folha", {
    p_competencia: validado.data.competencia,
    p_encargos_pct: validado.data.encargosPercentual,
  });

  if (error || !data) {
    return { erro: error?.message || "Não foi possível gerar a folha" };
  }

  revalidatePath(ROTA);
  revalidatePath(rotaDetalhe(data));
  return { ok: true, id: data };
}

/* ------------------------------------------------------------------ */
/* Fechar / reabrir                                                   */
/* ------------------------------------------------------------------ */

/** Fecha a folha via fn_fechar_folha (rascunho -> fechada). */
export async function fecharFolha(id: string): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para fechar folhas" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Folha inválida" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_fechar_folha", {
    p_folha: idValido.data,
  });

  if (error) {
    return { erro: error.message || "Não foi possível fechar a folha" };
  }

  revalidatePath(ROTA);
  revalidatePath(rotaDetalhe(idValido.data));
  return { ok: true };
}

/** Reabre a folha via fn_reabrir_folha (fechada -> rascunho). */
export async function reabrirFolha(id: string): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para reabrir folhas" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Folha inválida" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_reabrir_folha", {
    p_folha: idValido.data,
  });

  if (error) {
    return { erro: error.message || "Não foi possível reabrir a folha" };
  }

  revalidatePath(ROTA);
  revalidatePath(rotaDetalhe(idValido.data));
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Planilha da folha (Excel)                                          */
/* ------------------------------------------------------------------ */

const COR_FUNDO_HEADER = "FFF7F7F5";
const COR_BORDA_HEADER = "FFE8E6E1";
const COR_TEXTO_HEADER = "FF1F1F1F";

/** Competência (yyyy-MM-01) como MM/AAAA. */
function competenciaMesAno(competencia: string): string {
  const [ano, mes] = competencia.split("-");
  return `${mes}/${ano}`;
}

/** Nome de arquivo seguro a partir da competência. */
function nomeArquivoFolha(competencia: string): string {
  const [ano, mes] = competencia.split("-");
  return `folha-${ano}-${mes}.xlsx`;
}

/**
 * Gera a planilha gerencial da folha em .xlsx para o contador: cabeçalho com a
 * competência, o status e o percentual de encargos; uma tabela por colaborador
 * com salário base, horas, encargos, adiantamentos, custo total (custo da
 * empresa) e líquido (o que o colaborador recebe); e a linha de totais. Devolve
 * o arquivo em base64 para o client baixar via Blob. Disponível em qualquer
 * status.
 */
export async function gerarPlanilhaFolha(
  id: string,
): Promise<ResultadoPlanilha> {
  if (!(await checarPermissao("ver"))) {
    return { erro: "Sem permissão para exportar a folha" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Folha inválida" };

  const folha = await buscarFolha(idValido.data);
  if (!folha) return { erro: "Folha não encontrada" };

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ERP EMT";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Folha gerencial");

  worksheet.addRow(["Folha gerencial"]);
  worksheet.addRow(["Competência", competenciaMesAno(folha.competencia)]);
  worksheet.addRow([
    "Status",
    folha.status === "fechada" ? "Fechada" : "Rascunho",
  ]);
  worksheet.addRow([
    "Encargos (%)",
    `${formatarQuantidade(folha.encargosPercentual)}%`,
  ]);
  if (folha.dataFechamento) {
    worksheet.addRow(["Fechamento", formatarData(folha.dataFechamento)]);
  }
  worksheet.addRow([]);

  const cabecalhos = [
    "Colaborador",
    "Função",
    "Centro de custo",
    "Salário base",
    "Horas normais",
    "Horas extras",
    "Valor extras",
    "Encargos",
    "Adiantamentos",
    "Custo total",
    "Líquido",
  ];
  const linhaHeader = worksheet.addRow(cabecalhos);
  linhaHeader.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: COR_TEXTO_HEADER } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COR_FUNDO_HEADER },
    };
    cell.border = {
      bottom: { style: "thin", color: { argb: COR_BORDA_HEADER } },
    };
    cell.alignment = { vertical: "middle" };
  });

  for (const item of folha.itens) {
    const centro = item.centroCustoNome
      ? item.centroCustoCodigo
        ? `${item.centroCustoCodigo} - ${item.centroCustoNome}`
        : item.centroCustoNome
      : "Sem centro de custo";

    worksheet.addRow([
      item.colaboradorNome,
      item.colaboradorFuncao ?? "",
      centro,
      formatarBRL(item.salarioBase),
      formatarQuantidade(item.horasNormais),
      formatarQuantidade(item.horasExtras),
      formatarBRL(item.valorExtras),
      formatarBRL(item.encargos),
      formatarBRL(item.adiantamentos),
      formatarBRL(item.custoTotal),
      formatarBRL(item.valorLiquido),
    ]);
  }

  worksheet.addRow([]);
  const linhaTotais = worksheet.addRow([
    "Totais",
    "",
    "",
    formatarBRL(folha.valorBruto),
    "",
    "",
    "",
    formatarBRL(folha.valorEncargos),
    formatarBRL(folha.valorAdiantamentos),
    formatarBRL(folha.custoTotal),
    formatarBRL(folha.valorLiquido),
  ]);
  linhaTotais.eachCell((cell) => {
    cell.font = { bold: true };
  });

  worksheet.getColumn(1).width = 28;
  worksheet.getColumn(2).width = 22;
  worksheet.getColumn(3).width = 26;
  for (const indice of [4, 5, 6, 7, 8, 9, 10, 11]) {
    const coluna = worksheet.getColumn(indice);
    coluna.width = Math.max(coluna.width ?? 0, 16);
  }

  const conteudo = await workbook.xlsx.writeBuffer();
  const base64 = Buffer.from(conteudo).toString("base64");

  return {
    ok: true,
    base64,
    nomeArquivo: nomeArquivoFolha(folha.competencia),
  };
}
