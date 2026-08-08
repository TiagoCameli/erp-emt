"use server";

import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";

import type { Acao } from "@/config/recursos";
import { erroAcao } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  formatarBRL,
  formatarDataHora,
  formatarQuantidade,
} from "@/lib/formatadores";
import { STATUS_FOLHA, type StatusFolha } from "@/modules/rh/_shared/formato";
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
 * o rascunho consolidando os colaboradores CLT ativos. Os encargos são
 * discriminados pela config (folha_encargos ativos) dentro da fn, não mais por
 * um % global digitado. Reaplicar regenera a folha em rascunho. Retorna o id.
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
    // Legado: a fn ignora este arg (encargos vêm de folha_encargos). Mantido só
    // para não quebrar a assinatura do RPC.
    p_encargos_pct: 0,
  });

  if (error || !data) {
    return erroAcao(
      "rh.folha.gerar",
      error,
      error?.message || "Não foi possível gerar a folha",
    );
  }

  revalidatePath(ROTA);
  revalidatePath(rotaDetalhe(data));
  return { ok: true, id: data };
}

/* ------------------------------------------------------------------ */
/* Fluxo de aprovação: enviar, aprovar, rejeitar, desaprovar          */
/* ------------------------------------------------------------------ */

/**
 * Atualiza status (e motivo_rejeicao opcional) da folha via UPDATE direto,
 * lendo o status atual antes de escrever. Sem essa leitura, um UPDATE com
 * `.eq("status", statusEsperado)` que não bate nenhuma linha (a folha já
 * mudou de status por outra aba/usuário) não é erro no PostgREST: a action
 * devolveria sucesso falso, e a tela daria o toast de sucesso sobre uma
 * transição que não aconteceu. Espelha transicionarStatus da OC
 * (src/modules/compras/ordens/actions.ts).
 */
async function transicionarStatusFolha(
  id: string,
  acao: Acao,
  statusEsperado: StatusFolha,
  novoStatus: StatusFolha,
  extra: { motivo_rejeicao?: string | null } = {},
): Promise<ResultadoAcao> {
  if (!(await checarPermissao(acao))) {
    return { erro: "Sem permissão para esta ação na folha" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Folha inválida" };

  const supabase = await createClient();
  const { data: atual, error: erroBusca } = await supabase
    .from("folhas")
    .select("status")
    .eq("id", idValido.data)
    .single();

  if (erroBusca || !atual) {
    return erroAcao(
      "rh.folha.transicionarStatus",
      erroBusca,
      "Folha não encontrada",
    );
  }
  if (atual.status !== statusEsperado) {
    return { erro: "A folha não está no status esperado para esta ação" };
  }

  const { error } = await supabase
    .from("folhas")
    .update({ status: novoStatus, ...extra })
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "rh.folha.transicionarStatus",
      error,
      "Não foi possível atualizar a folha. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  revalidatePath(rotaDetalhe(idValido.data));
  return { ok: true };
}

/**
 * Envia a folha de rascunho para aprovação. UPDATE direto pela RLS, guardado
 * pelo trigger fn_guarda_status_folha (que também recusa folha vazia). Limpa o
 * motivo da rejeição anterior, igual a OC faz.
 */
export async function enviarFolhaParaAprovacao(
  id: string,
): Promise<ResultadoAcao> {
  return transicionarStatusFolha(id, "editar", "rascunho", "pendente_aprovacao", {
    motivo_rejeicao: null,
  });
}

/**
 * Aprova a folha via fn_aprovar_folha. É a aprovação que gera os lançamentos no
 * Financeiro (salário por colaborador e as guias por grupo de recolhimento), e
 * a mensagem de erro do banco vai direto pro toast.
 */
export async function aprovarFolha(id: string): Promise<ResultadoAcao> {
  if (!(await checarPermissao("aprovar"))) {
    return { erro: "Sem permissão para aprovar a folha" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Folha inválida" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_aprovar_folha", {
    p_folha: idValido.data,
  });

  if (error) {
    return erroAcao(
      "rh.folha.aprovar",
      error,
      error.message || "Não foi possível aprovar a folha",
    );
  }

  revalidatePath(ROTA);
  revalidatePath(rotaDetalhe(idValido.data));
  return { ok: true };
}

/** Rejeita a folha pendente com motivo, devolvendo para rascunho. */
export async function rejeitarFolha(
  id: string,
  motivo: string,
): Promise<ResultadoAcao> {
  const motivoLimpo = motivo.trim();
  if (motivoLimpo === "") return { erro: "Informe o motivo da rejeição" };

  return transicionarStatusFolha(id, "aprovar", "pendente_aprovacao", "rascunho", {
    motivo_rejeicao: motivoLimpo,
  });
}

/**
 * Desaprova a folha via fn_desaprovar_folha: volta para rascunho e apaga os
 * lançamentos gerados. A RPC recusa se algum pagamento já estiver aprovado,
 * pago ou conciliado, e a mensagem dela vai direto pro toast.
 */
export async function desaprovarFolha(
  id: string,
  motivo: string,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("desaprovar"))) {
    return { erro: "Sem permissão para desaprovar a folha" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Folha inválida" };

  const motivoLimpo = motivo.trim();
  if (motivoLimpo === "") return { erro: "Informe o motivo da desaprovação" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_desaprovar_folha", {
    p_folha: idValido.data,
    p_motivo: motivoLimpo,
  });

  if (error) {
    return erroAcao(
      "rh.folha.desaprovar",
      error,
      error.message || "Não foi possível desaprovar a folha",
    );
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

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Folha inválida" };

  const folha = await buscarFolha(idValido.data);
  if (!folha) return { erro: "Folha não encontrada" };

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ERP EMT";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Folha gerencial");

  worksheet.addRow(["Folha gerencial"]);
  worksheet.addRow(["Competência", competenciaMesAno(folha.competencia)]);
  worksheet.addRow(["Status", STATUS_FOLHA[folha.status].rotulo]);
  worksheet.addRow([
    "Encargos (%)",
    `${formatarQuantidade(folha.encargosPercentual)}%`,
  ]);
  if (folha.aprovadoEm) {
    worksheet.addRow(["Aprovada em", formatarDataHora(folha.aprovadoEm)]);
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
