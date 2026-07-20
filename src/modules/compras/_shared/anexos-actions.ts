"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { exigirPermissao } from "@/lib/permissoes";
import {
  removerAnexo,
  salvarAnexo,
  urlAssinadaAnexo,
} from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import {
  acaoDoAnexo,
  recursoDaTabelaAnexo,
  type TabelaAnexo,
} from "@/modules/compras/_shared/anexos-recurso";

const uuidSchema = z.uuid();

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
  if (!uuidSchema.safeParse(registroId).success) {
    return { erro: "Registro do anexo inválido" };
  }
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Selecione um arquivo para anexar" };
  }

  let recurso;
  try {
    recurso = recursoDaTabelaAnexo(tabela);
    await exigirPermissao(recurso, acaoDoAnexo());
  } catch {
    return { erro: "Você não tem permissão para anexar arquivos aqui" };
  }

  // Amarra tabela + registroId: o registro precisa existir (e ser visível pela
  // RLS de quem anexa), pra não pendurar anexo em id de outra entidade. O
  // recursoDaTabelaAnexo acima já garante que tabela é uma TabelaAnexo válida.
  const supabase = await createClient();
  const { data: registro } = await supabase
    .from(tabela as TabelaAnexo)
    .select("id")
    .eq("id", registroId)
    .maybeSingle();

  if (!registro) {
    return { erro: "Registro não encontrado para anexar o arquivo" };
  }

  const resultado = await salvarAnexo({ tabela, registroId, arquivo });
  if ("erro" in resultado) return { erro: resultado.erro };

  revalidatePath("/compras");
  return { ok: true };
}

/**
 * Gera a URL assinada (temporária) para baixar um anexo. Checa a permissão de
 * ver do recurso dono da tabela (camada de Server Action) além da RLS da tabela
 * anexos, pra não depender só da RLS no endpoint que entrega o link da NF.
 */
export async function baixarAnexo(
  anexoId: string,
): Promise<ResultadoUrlAnexo> {
  if (!uuidSchema.safeParse(anexoId).success) {
    return { erro: "Anexo inválido" };
  }

  const supabase = await createClient();
  const { data: anexo } = await supabase
    .from("anexos")
    .select("tabela, path_storage")
    .eq("id", anexoId)
    .single();

  if (!anexo) return { erro: "Anexo não encontrado" };

  try {
    await exigirPermissao(recursoDaTabelaAnexo(anexo.tabela), "ver");
  } catch {
    return { erro: "Você não tem permissão para baixar este anexo" };
  }

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
  if (!uuidSchema.safeParse(anexoId).success) {
    return { erro: "Anexo inválido" };
  }

  const supabase = await createClient();
  const { data: anexo } = await supabase
    .from("anexos")
    .select("tabela")
    .eq("id", anexoId)
    .single();

  if (!anexo) return { erro: "Anexo não encontrado" };

  try {
    const recurso = recursoDaTabelaAnexo(anexo.tabela);
    await exigirPermissao(recurso, acaoDoAnexo());
  } catch {
    return { erro: "Você não tem permissão para remover este anexo" };
  }

  const resultado = await removerAnexo(anexoId);
  if ("erro" in resultado) return { erro: resultado.erro };

  revalidatePath("/compras");
  return { ok: true };
}
