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
import { ROTULO_REAJUSTE } from "@/modules/medicao/_shared/formato";
import {
  buscarMedicao,
  planilhaDaObra,
  type PlanilhaDaObra,
} from "@/modules/medicao/medicoes/queries";
import {
  aprovarSchema,
  criarMedicaoSchema,
  editarCabecalhoSchema,
  itemSchema,
  motivoSchema,
  type AprovarInput,
  type CriarMedicaoInput,
  type EditarCabecalhoInput,
  type ItemInput,
} from "@/modules/medicao/medicoes/schemas";

const RECURSO = "medicao.medicoes" as const;
const ROTA = "/medicao/medicoes";

/** Caminho do detalhe de uma medição, para revalidar junto com a lista. */
function rotaDetalhe(id: string): string {
  return `${ROTA}/${id}`;
}

export type ResultadoAcao = { ok: true } | { erro: string };
export type ResultadoCriacao = { ok: true; id: string } | { erro: string };
export type ResultadoBoletim =
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

/**
 * Erro se a medição não está em rascunho. Itens só mudam no rascunho (a RLS
 * no banco também barra; aqui devolvemos a mensagem amigável). Retorna a
 * mensagem de bloqueio, ou null se a medição é editável.
 */
async function medicaoNaoEditavel(medicaoId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("medicoes")
    .select("status")
    .eq("id", medicaoId)
    .maybeSingle();
  if (!data) return "Medição não encontrada";
  if (data.status !== "rascunho") {
    return "Só dá para alterar itens de uma medição em rascunho";
  }
  return null;
}

/**
 * Acumulado anterior (outras medições aprovadas) de um planilha_item, mais a
 * quantidade contratada do próprio item. Usado para validar atual <= saldo
 * antes de gravar o item. A RPC de aprovar revalida no banco.
 */
async function saldoDoItem(
  medicaoId: string,
  planilhaItemId: string,
): Promise<{ contratada: number; anterior: number } | null> {
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("planilha_itens")
    .select("quantidade_contratada")
    .eq("id", planilhaItemId)
    .maybeSingle();
  if (!item) return null;

  const { data: medidos, error } = await supabase
    .from("medicao_itens")
    .select("quantidade, medicao_id, medicoes!inner(status)")
    .eq("planilha_item_id", planilhaItemId)
    .eq("medicoes.status", "aprovada");

  if (error) return null;

  let anterior = 0;
  for (const linha of medidos ?? []) {
    if (linha.medicao_id === medicaoId) continue;
    anterior += linha.quantidade;
  }

  return { contratada: item.quantidade_contratada, anterior };
}

export type ResultadoPlanilha =
  | { ok: true; planilha: PlanilhaDaObra | null }
  | { erro: string };

/**
 * Carrega a planilha contratual de uma obra (e seus itens) para o formulário
 * de nova medição, conforme a obra escolhida no drawer. Guardada por "ver".
 * Retorna planilha null quando a obra não tem planilha contratual.
 */
export async function buscarPlanilhaDaObra(
  obraId: string,
): Promise<ResultadoPlanilha> {
  if (!(await checarPermissao("ver"))) {
    return { erro: "Sem permissão para consultar a planilha da obra" };
  }

  const idValido = uuidSchema.safeParse(obraId);
  if (!idValido.success) return { erro: "Obra inválida" };

  try {
    const planilha = await planilhaDaObra(idValido.data);
    return { ok: true, planilha };
  } catch {
    return { erro: "Não foi possível carregar a planilha da obra" };
  }
}

/* ------------------------------------------------------------------ */
/* Criar medição                                                      */
/* ------------------------------------------------------------------ */

/**
 * Cria a medição em rascunho (insert direto, RLS criar). O número é gerado por
 * trigger no banco, não setamos aqui. Os valores ficam zerados até a aprovação.
 */
export async function criarMedicao(
  dados: CriarMedicaoInput,
): Promise<ResultadoCriacao> {
  if (!(await checarPermissao("criar"))) {
    return { erro: "Sem permissão para criar medições" };
  }

  const validado = criarMedicaoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("medicoes")
    .insert({
      obra_id: validado.data.obraId,
      planilha_id: validado.data.planilhaId,
      competencia: validado.data.competencia,
      descricao: validado.data.descricao ?? null,
      reajuste_tipo: validado.data.reajusteTipo,
      reajuste_valor: validado.data.reajusteValor,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { erro: error?.message || "Não foi possível criar a medição" };
  }

  revalidatePath(ROTA);
  return { ok: true, id: data.id };
}

/* ------------------------------------------------------------------ */
/* Editar cabeçalho (só rascunho, colunas com grant)                  */
/* ------------------------------------------------------------------ */

/**
 * Edita o cabeçalho da medição: só as colunas com grant (competência,
 * descrição, reajuste) e só em rascunho. A RLS no banco também restringe.
 */
export async function editarCabecalho(
  id: string,
  dados: EditarCabecalhoInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para editar medições" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Medição inválida" };

  const validado = editarCabecalhoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const bloqueio = await medicaoNaoEditavel(idValido.data);
  if (bloqueio) return { erro: bloqueio };

  const supabase = await createClient();
  const { error } = await supabase
    .from("medicoes")
    .update({
      competencia: validado.data.competencia,
      descricao: validado.data.descricao ?? null,
      reajuste_tipo: validado.data.reajusteTipo,
      reajuste_valor: validado.data.reajusteValor,
    })
    .eq("id", idValido.data);

  if (error) {
    return { erro: error.message || "Não foi possível salvar o cabeçalho" };
  }

  revalidatePath(ROTA);
  revalidatePath(rotaDetalhe(idValido.data));
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Itens da medição                                                   */
/* ------------------------------------------------------------------ */

/**
 * Adiciona um item medido. Valida atual <= (contratada - acumulado anterior)
 * antes de inserir (a RPC de aprovar revalida). A RLS já barra fora do
 * rascunho; o bloqueio aqui é só a mensagem amigável.
 */
export async function adicionarItem(
  medicaoId: string,
  dados: ItemInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para lançar itens" };
  }

  const idValido = uuidSchema.safeParse(medicaoId);
  if (!idValido.success) return { erro: "Medição inválida" };

  const validado = itemSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const bloqueio = await medicaoNaoEditavel(idValido.data);
  if (bloqueio) return { erro: bloqueio };

  const saldo = await saldoDoItem(idValido.data, validado.data.planilhaItemId);
  if (!saldo) return { erro: "Item da planilha não encontrado" };
  if (validado.data.quantidade > saldo.contratada - saldo.anterior) {
    return {
      erro: `Quantidade acima do saldo disponível (${formatarQuantidade(
        saldo.contratada - saldo.anterior,
      )})`,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("medicao_itens").insert({
    medicao_id: idValido.data,
    planilha_item_id: validado.data.planilhaItemId,
    quantidade: validado.data.quantidade,
    memoria_calculo: validado.data.memoriaCalculo ?? null,
  });

  if (error) {
    if (error.code === "23505") {
      return { erro: "Esse item já foi lançado nesta medição" };
    }
    return { erro: error.message || "Não foi possível lançar o item" };
  }

  revalidatePath(ROTA);
  revalidatePath(rotaDetalhe(idValido.data));
  return { ok: true };
}

/**
 * Edita um item medido (quantidade e memória). Revalida atual <= saldo com
 * base no planilha_item do próprio registro. Só em rascunho.
 */
export async function editarItem(
  medicaoId: string,
  itemId: string,
  dados: ItemInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para editar itens" };
  }

  const medicaoValida = uuidSchema.safeParse(medicaoId);
  const idValido = uuidSchema.safeParse(itemId);
  if (!medicaoValida.success || !idValido.success) {
    return { erro: "Registro inválido" };
  }

  const validado = itemSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const bloqueio = await medicaoNaoEditavel(medicaoValida.data);
  if (bloqueio) return { erro: bloqueio };

  const saldo = await saldoDoItem(
    medicaoValida.data,
    validado.data.planilhaItemId,
  );
  if (!saldo) return { erro: "Item da planilha não encontrado" };
  if (validado.data.quantidade > saldo.contratada - saldo.anterior) {
    return {
      erro: `Quantidade acima do saldo disponível (${formatarQuantidade(
        saldo.contratada - saldo.anterior,
      )})`,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("medicao_itens")
    .update({
      quantidade: validado.data.quantidade,
      memoria_calculo: validado.data.memoriaCalculo ?? null,
    })
    .eq("id", idValido.data);

  if (error) {
    return { erro: error.message || "Não foi possível salvar o item" };
  }

  revalidatePath(ROTA);
  revalidatePath(rotaDetalhe(medicaoValida.data));
  return { ok: true };
}

/** Remove um item medido pelo id (delete direto, RLS só em rascunho). */
export async function removerItem(
  medicaoId: string,
  itemId: string,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para remover itens" };
  }

  const medicaoValida = uuidSchema.safeParse(medicaoId);
  const idValido = uuidSchema.safeParse(itemId);
  if (!medicaoValida.success || !idValido.success) {
    return { erro: "Registro inválido" };
  }

  const bloqueio = await medicaoNaoEditavel(medicaoValida.data);
  if (bloqueio) return { erro: bloqueio };

  const supabase = await createClient();
  const { error } = await supabase
    .from("medicao_itens")
    .delete()
    .eq("id", idValido.data);

  if (error) {
    return { erro: error.message || "Não foi possível remover o item" };
  }

  revalidatePath(ROTA);
  revalidatePath(rotaDetalhe(medicaoValida.data));
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Aprovar / cancelar / desaprovar                                    */
/* ------------------------------------------------------------------ */

/**
 * Aprova a medição via fn_aprovar_medicao: valida cada item (atual <= saldo),
 * calcula bruto + reajuste + total, gera a fatura e o lançamento a receber.
 * A data de vencimento é opcional; quando vazia, a função usa o padrão dela.
 */
export async function aprovarMedicao(
  id: string,
  dados: AprovarInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("aprovar"))) {
    return { erro: "Sem permissão para aprovar medições" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Medição inválida" };

  const validado = aprovarSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const args: { p_medicao: string; p_data_vencimento?: string } = {
    p_medicao: idValido.data,
  };
  if (validado.data.dataVencimento !== undefined) {
    args.p_data_vencimento = validado.data.dataVencimento;
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_aprovar_medicao", args);

  if (error) {
    return { erro: error.message || "Não foi possível aprovar a medição" };
  }

  revalidatePath(ROTA);
  revalidatePath(rotaDetalhe(idValido.data));
  return { ok: true };
}

/** Cancela a medição via fn_cancelar_medicao (só rascunho), com motivo. */
export async function cancelarMedicao(
  id: string,
  motivo: string,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para cancelar medições" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Medição inválida" };

  const motivoValido = motivoSchema.safeParse(motivo);
  if (!motivoValido.success) {
    return { erro: motivoValido.error.issues[0]?.message ?? "Motivo inválido" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_cancelar_medicao", {
    p_medicao: idValido.data,
    p_motivo: motivoValido.data,
  });

  if (error) {
    return { erro: error.message || "Não foi possível cancelar a medição" };
  }

  revalidatePath(ROTA);
  revalidatePath(rotaDetalhe(idValido.data));
  return { ok: true };
}

/**
 * Desaprova a medição via fn_desaprovar_medicao (aprovada -> rascunho),
 * revertendo a fatura e o lançamento se ainda não recebidos. Com motivo.
 */
export async function desaprovarMedicao(
  id: string,
  motivo: string,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("desaprovar"))) {
    return { erro: "Sem permissão para desaprovar medições" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Medição inválida" };

  const motivoValido = motivoSchema.safeParse(motivo);
  if (!motivoValido.success) {
    return { erro: motivoValido.error.issues[0]?.message ?? "Motivo inválido" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_desaprovar_medicao", {
    p_medicao: idValido.data,
    p_motivo: motivoValido.data,
  });

  if (error) {
    return { erro: error.message || "Não foi possível desaprovar a medição" };
  }

  revalidatePath(ROTA);
  revalidatePath(rotaDetalhe(idValido.data));
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Boletim de medição (Excel)                                         */
/* ------------------------------------------------------------------ */

const COR_FUNDO_HEADER = "FFF7F7F5";
const COR_BORDA_HEADER = "FFE8E6E1";
const COR_TEXTO_HEADER = "FF1F1F1F";

/** Excel limita o nome da aba a 31 caracteres e proíbe \\ / ? * [ ] : */
function sanitizarNomePlanilha(nome: string): string {
  const limpo = nome.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31);
  return limpo.length > 0 ? limpo : "Boletim";
}

/** Nome de arquivo seguro a partir do número da medição. */
function nomeArquivoBoletim(numero: string | null): string {
  const base = (numero ?? "medicao").replace(/[^a-zA-Z0-9._-]+/g, "-");
  return `boletim-${base}.xlsx`;
}

/**
 * Gera o boletim da medição em .xlsx: cabeçalho com obra, número e competência;
 * uma tabela com código, descrição, unidade, quantidade contratada, acumulado
 * anterior, atual, acumulado total, saldo, preço unitário e valor; e a linha de
 * totais (bruto, reajuste, total). Devolve o arquivo em base64 para o client
 * baixar via Blob. Disponível em qualquer status.
 */
export async function gerarBoletim(id: string): Promise<ResultadoBoletim> {
  if (!(await checarPermissao("ver"))) {
    return { erro: "Sem permissão para exportar o boletim" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Medição inválida" };

  const medicao = await buscarMedicao(idValido.data);
  if (!medicao) return { erro: "Medição não encontrada" };

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ERP EMT";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(
    sanitizarNomePlanilha(`Boletim ${medicao.numero ?? ""}`),
  );

  const obra = medicao.obraLote
    ? `${medicao.obraNome} (Lote ${medicao.obraLote})`
    : medicao.obraNome;

  worksheet.addRow(["Boletim de medição"]);
  worksheet.addRow(["Obra", obra]);
  worksheet.addRow(["Número", medicao.numero ?? "Sem número"]);
  worksheet.addRow(["Competência", formatarData(medicao.competencia)]);
  if (medicao.reajusteTipo !== "nenhum") {
    worksheet.addRow(["Reajuste", ROTULO_REAJUSTE[medicao.reajusteTipo]]);
  }
  worksheet.addRow([]);

  const cabecalhos = [
    "Código",
    "Descrição",
    "Unidade",
    "Qtd. contratada",
    "Acum. anterior",
    "Atual",
    "Acum. total",
    "Saldo",
    "Preço unit. (R$)",
    "Valor (R$)",
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

  for (const item of medicao.itens) {
    worksheet.addRow([
      item.codigo ?? "",
      item.descricao,
      item.unidadeSigla ?? "",
      formatarQuantidade(item.quantidadeContratada),
      formatarQuantidade(item.acumuladoAnterior),
      formatarQuantidade(item.atual),
      formatarQuantidade(item.acumuladoTotal),
      formatarQuantidade(item.saldo),
      formatarBRL(item.precoUnitario),
      formatarBRL(item.valor),
    ]);
  }

  // Total bruto da medição: soma do valor dos itens. Quando a medição já foi
  // aprovada, o banco já fechou os valores; usamos os do cabeçalho. No rascunho
  // o reajuste ainda não foi aplicado, então só mostramos o bruto previsto.
  const brutoPrevisto = medicao.itens.reduce((soma, item) => soma + item.valor, 0);
  const aprovada = medicao.status === "aprovada";
  const bruto = aprovada ? medicao.valorBruto : brutoPrevisto;
  const reajuste = aprovada ? medicao.valorReajuste : 0;
  const total = aprovada ? medicao.valorTotal : brutoPrevisto;

  worksheet.addRow([]);
  function linhaTotal(rotulo: string, valor: number, negrito = false) {
    const linha = worksheet.addRow([
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      rotulo,
      formatarBRL(valor),
    ]);
    if (negrito) {
      linha.getCell(9).font = { bold: true };
      linha.getCell(10).font = { bold: true };
    }
  }
  linhaTotal("Valor bruto", bruto);
  linhaTotal("Reajuste", reajuste);
  linhaTotal("Valor total", total, true);

  worksheet.getColumn(2).width = 48;
  for (const indice of [1, 3, 4, 5, 6, 7, 8, 9, 10]) {
    const coluna = worksheet.getColumn(indice);
    coluna.width = Math.max(coluna.width ?? 0, 16);
  }

  const conteudo = await workbook.xlsx.writeBuffer();
  const base64 = Buffer.from(conteudo).toString("base64");

  return {
    ok: true,
    base64,
    nomeArquivo: nomeArquivoBoletim(medicao.numero),
  };
}
