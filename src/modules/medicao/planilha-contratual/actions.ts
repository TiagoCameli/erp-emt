"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { lerEValidarXlsx } from "@/lib/importacao";
import {
  colunasImportItem,
  itemSchema,
  planilhaSchema,
  type ItemInput,
  type PlanilhaInput,
} from "@/modules/medicao/planilha-contratual/schemas";

const RECURSO = "medicao.planilha-contratual" as const;
const ROTA = "/medicao/planilha-contratual";

export type ResultadoAcao = { ok: true } | { erro: string };

const uuidSchema = z.uuid();

/* ------------------------------------------------------------------ */
/* Planilha (cabeçalho)                                                */
/* ------------------------------------------------------------------ */

/** Cria a planilha contratual de uma obra. */
export async function criarPlanilha(
  dados: PlanilhaInput,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "criar");
  } catch {
    return { erro: "Sem permissão para criar planilhas contratuais" };
  }

  const validado = planilhaSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("planilhas_contratuais").insert({
    obra_id: validado.data.obraId,
    nome: validado.data.nome,
    observacao: validado.data.observacao ?? null,
    ativo: validado.data.ativo,
  });

  if (error) {
    if (error.code === "23505") {
      return { erro: "Essa obra já tem planilha contratual" };
    }
    return { erro: "Não foi possível salvar a planilha. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Edita o cabeçalho de uma planilha contratual. */
export async function editarPlanilha(
  id: string,
  dados: PlanilhaInput,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para editar planilhas contratuais" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Planilha inválida" };

  const validado = planilhaSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("planilhas_contratuais")
    .update({
      obra_id: validado.data.obraId,
      nome: validado.data.nome,
      observacao: validado.data.observacao ?? null,
      ativo: validado.data.ativo,
    })
    .eq("id", idValido.data);

  if (error) {
    if (error.code === "23505") {
      return { erro: "Essa obra já tem planilha contratual" };
    }
    return { erro: "Não foi possível salvar a planilha. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Itens                                                               */
/* ------------------------------------------------------------------ */

/** Converte o input validado do item no insert/update da tabela. */
function montarItem(dados: ItemInput) {
  return {
    codigo: dados.codigo ?? null,
    descricao: dados.descricao,
    unidade_id: dados.unidadeId ?? null,
    quantidade_contratada: dados.quantidadeContratada,
    preco_unitario: dados.precoUnitario,
  };
}

/** Cria um item na planilha, ao fim da ordem atual. */
export async function criarItem(
  planilhaId: string,
  dados: ItemInput,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "criar");
  } catch {
    return { erro: "Sem permissão para criar itens" };
  }

  const idValido = uuidSchema.safeParse(planilhaId);
  if (!idValido.success) return { erro: "Planilha inválida" };

  const validado = itemSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();

  const { data: ultimo, error: erroOrdem } = await supabase
    .from("planilha_itens")
    .select("ordem")
    .eq("planilha_id", idValido.data)
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (erroOrdem) {
    return { erro: "Não foi possível salvar o item. Tente novamente" };
  }

  const proximaOrdem = (ultimo?.ordem ?? 0) + 1;

  const { error } = await supabase.from("planilha_itens").insert({
    planilha_id: idValido.data,
    ordem: proximaOrdem,
    ...montarItem(validado.data),
  });

  if (error) {
    return { erro: "Não foi possível salvar o item. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Edita um item existente da planilha. */
export async function editarItem(
  id: string,
  dados: ItemInput,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para editar itens" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Item inválido" };

  const validado = itemSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("planilha_itens")
    .update(montarItem(validado.data))
    .eq("id", idValido.data);

  if (error) {
    return { erro: "Não foi possível salvar o item. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Remove um item da planilha. Gerenciar itens (add/editar/remover) é "editar"; alinha com a RLS. */
export async function removerItem(id: string): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para remover itens" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Item inválido" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("planilha_itens")
    .delete()
    .eq("id", idValido.data);

  if (error) {
    if (error.code === "23503") {
      return {
        erro: "Item já usado em uma medição. Remova-o da medição antes de excluir",
      };
    }
    return { erro: "Não foi possível remover o item. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Importação por planilha                                             */
/* ------------------------------------------------------------------ */

/** Lê o arquivo do formData e devolve o resumo de validação para a prévia. */
export async function validarImportItens(formData: FormData): Promise<{
  validas: number;
  invalidas: { linha: number; erros: string[] }[];
  totalLinhas: number;
}> {
  try {
    await exigirPermissao(RECURSO, "criar");
  } catch {
    throw new Error("Sem permissão para importar itens");
  }

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File)) {
    throw new Error("Nenhum arquivo enviado");
  }

  const buffer = Buffer.from(await arquivo.arrayBuffer());
  const resultado = await lerEValidarXlsx(buffer, colunasImportItem);

  return {
    validas: resultado.validas.length,
    invalidas: resultado.invalidas.map((linha) => ({
      linha: linha.linha,
      erros: linha.erros,
    })),
    totalLinhas: resultado.totalLinhas,
  };
}

/**
 * Importa as linhas válidas do arquivo para a planilha. Resolve a unidade pela
 * sigla (opcional), define a ordem a partir do último item e insere em massa.
 */
export async function importarItens(
  planilhaId: string,
  formData: FormData,
): Promise<{ importadas: number } | { erro: string }> {
  try {
    await exigirPermissao(RECURSO, "criar");
  } catch {
    return { erro: "Sem permissão para importar itens" };
  }

  const idValido = uuidSchema.safeParse(planilhaId);
  if (!idValido.success) return { erro: "Planilha inválida" };

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File)) {
    return { erro: "Nenhum arquivo enviado" };
  }

  let validacao;
  try {
    const buffer = Buffer.from(await arquivo.arrayBuffer());
    validacao = await lerEValidarXlsx(buffer, colunasImportItem);
  } catch (erro) {
    return {
      erro:
        erro instanceof Error
          ? erro.message
          : "Não foi possível ler o arquivo",
    };
  }

  if (validacao.validas.length === 0) {
    return { erro: "Nenhuma linha válida para importar" };
  }

  const supabase = await createClient();

  const { data: unidades, error: erroUnidades } = await supabase
    .from("unidades_medida")
    .select("id, sigla")
    .eq("ativo", true);

  if (erroUnidades) {
    return { erro: "Não foi possível carregar as unidades para casar" };
  }

  const unidadePorSigla = new Map(
    (unidades ?? []).map((u) => [u.sigla.trim().toLowerCase(), u.id]),
  );

  const { data: ultimo, error: erroOrdem } = await supabase
    .from("planilha_itens")
    .select("ordem")
    .eq("planilha_id", idValido.data)
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (erroOrdem) {
    return { erro: "Não foi possível preparar a importação. Tente novamente" };
  }

  let ordem = ultimo?.ordem ?? 0;

  const registros: {
    planilha_id: string;
    codigo: string | null;
    descricao: string;
    unidade_id: string | null;
    quantidade_contratada: number;
    preco_unitario: number;
    ordem: number;
  }[] = [];

  for (const linha of validacao.validas) {
    const codigoBruto = linha.dados.codigo;
    const codigo =
      typeof codigoBruto === "string" && codigoBruto.trim()
        ? codigoBruto.trim()
        : null;

    const descricao = String(linha.dados.descricao ?? "").trim();

    const siglaBruta = linha.dados.unidade;
    let unidadeId: string | null = null;
    if (typeof siglaBruta === "string" && siglaBruta.trim()) {
      const id = unidadePorSigla.get(siglaBruta.trim().toLowerCase());
      if (!id) {
        return {
          erro: `Unidade "${siglaBruta}" (linha ${linha.linha}) não encontrada. Cadastre a unidade antes de importar.`,
        };
      }
      unidadeId = id;
    }

    ordem += 1;
    registros.push({
      planilha_id: idValido.data,
      codigo,
      descricao,
      unidade_id: unidadeId,
      quantidade_contratada: Number(linha.dados.quantidade_contratada),
      preco_unitario: Number(linha.dados.preco_unitario),
      ordem,
    });
  }

  const { error } = await supabase.from("planilha_itens").insert(registros);
  if (error) {
    return { erro: "Não foi possível importar os itens. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { importadas: registros.length };
}
