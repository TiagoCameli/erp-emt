"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Acao } from "@/config/recursos";
import { erroAcao } from "@/lib/erros";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  documentoSchema,
  type DocumentoInput,
} from "@/modules/rh/documentos/schemas";

const RECURSO = "rh.documentos" as const;
const ROTA = "/rh/documentos";
const TABELA = "rh_documentos" as const;

export type ResultadoAcao = { ok: true } | { erro: string };

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

/** Cria um documento. */
export async function criarDocumento(
  dados: DocumentoInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("criar"))) {
    return { erro: "Sem permissão para criar documentos" };
  }

  const validado = documentoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from(TABELA).insert({
    colaborador_id: validado.data.colaboradorId,
    tipo: validado.data.tipo,
    descricao: validado.data.descricao,
    data_emissao: validado.data.dataEmissao ?? null,
    data_vencimento: validado.data.dataVencimento ?? null,
    observacao: validado.data.observacao ?? null,
  });

  if (error) {
    return erroAcao(
      "rh.documentos.criar",
      error,
      "Não foi possível salvar o documento. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Edita um documento. */
export async function editarDocumento(
  id: string,
  dados: DocumentoInput,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("editar"))) {
    return { erro: "Sem permissão para editar documentos" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Documento inválido" };

  const validado = documentoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from(TABELA)
    .update({
      colaborador_id: validado.data.colaboradorId,
      tipo: validado.data.tipo,
      descricao: validado.data.descricao,
      data_emissao: validado.data.dataEmissao ?? null,
      data_vencimento: validado.data.dataVencimento ?? null,
      observacao: validado.data.observacao ?? null,
    })
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "rh.documentos.editar",
      error,
      "Não foi possível salvar o documento. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Remove um documento. */
export async function removerDocumento(id: string): Promise<ResultadoAcao> {
  if (!(await checarPermissao("excluir"))) {
    return { erro: "Sem permissão para excluir documentos" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Documento inválido" };

  const supabase = await createClient();
  const { error } = await supabase.from(TABELA).delete().eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "rh.documentos.remover",
      error,
      "Não foi possível excluir o documento. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}
