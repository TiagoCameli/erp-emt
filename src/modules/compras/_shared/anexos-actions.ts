"use server";

import { revalidatePath } from "next/cache";

import { exigirPermissao } from "@/lib/permissoes";
import {
  removerAnexo,
  salvarAnexo,
  urlAssinadaAnexo,
} from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { recursoDaTabelaAnexo } from "@/modules/compras/_shared/anexos-recurso";

/** Resumo de um anexo para a lista na tela. */
export interface AnexoResumo {
  id: string;
  nomeArquivo: string;
  tamanhoBytes: number | null;
  tipoMime: string | null;
}

export type ResultadoAnexo = { ok: true } | { erro: string };
export type ResultadoUrlAnexo = { url: string } | { erro: string };

/**
 * Lista os anexos de um registro. A RLS da tabela anexos cobre a permissão
 * de ver; a tela só renderiza a lista para quem já vê a aba.
 */
export async function listarAnexos(
  tabela: string,
  registroId: string,
): Promise<AnexoResumo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("anexos")
    .select("id, nome_arquivo, tamanho_bytes, tipo_mime")
    .eq("tabela", tabela)
    .eq("registro_id", registroId)
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  return data.map((anexo) => ({
    id: anexo.id,
    nomeArquivo: anexo.nome_arquivo,
    tamanhoBytes: anexo.tamanho_bytes,
    tipoMime: anexo.tipo_mime,
  }));
}

/**
 * Envia um anexo a partir do FormData { tabela, registroId, arquivo }.
 * Exige a permissão de editar do recurso dono da tabela e revalida a rota
 * do módulo de compras.
 */
export async function enviarAnexo(
  formData: FormData,
): Promise<ResultadoAnexo> {
  const tabela = formData.get("tabela");
  const registroId = formData.get("registroId");
  const arquivo = formData.get("arquivo");

  if (typeof tabela !== "string" || typeof registroId !== "string") {
    return { erro: "Dados do anexo incompletos" };
  }
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Selecione um arquivo para anexar" };
  }

  let recurso;
  try {
    recurso = recursoDaTabelaAnexo(tabela);
    await exigirPermissao(recurso, "editar");
  } catch {
    return { erro: "Você não tem permissão para anexar arquivos aqui" };
  }

  const resultado = await salvarAnexo({ tabela, registroId, arquivo });
  if ("erro" in resultado) return { erro: resultado.erro };

  revalidatePath("/compras");
  return { ok: true };
}

/**
 * Gera a URL assinada (temporária) para baixar um anexo. A RLS de leitura
 * da tabela anexos garante que só quem vê o registro chega ao path.
 */
export async function baixarAnexo(
  anexoId: string,
): Promise<ResultadoUrlAnexo> {
  const supabase = await createClient();
  const { data: anexo } = await supabase
    .from("anexos")
    .select("path_storage")
    .eq("id", anexoId)
    .single();

  if (!anexo) return { erro: "Anexo não encontrado" };

  const url = await urlAssinadaAnexo(anexo.path_storage);
  if (!url) return { erro: "Não foi possível gerar o link de download" };

  return { url };
}

/**
 * Exclui um anexo. Exige a permissão de editar do recurso dono da tabela
 * do registro e revalida a rota do módulo de compras.
 */
export async function excluirAnexo(
  anexoId: string,
): Promise<ResultadoAnexo> {
  const supabase = await createClient();
  const { data: anexo } = await supabase
    .from("anexos")
    .select("tabela")
    .eq("id", anexoId)
    .single();

  if (!anexo) return { erro: "Anexo não encontrado" };

  try {
    const recurso = recursoDaTabelaAnexo(anexo.tabela);
    await exigirPermissao(recurso, "editar");
  } catch {
    return { erro: "Você não tem permissão para remover este anexo" };
  }

  const resultado = await removerAnexo(anexoId);
  if ("erro" in resultado) return { erro: resultado.erro };

  revalidatePath("/compras");
  return { ok: true };
}
