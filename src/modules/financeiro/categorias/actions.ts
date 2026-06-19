"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  categoriaFinanceiraSchema,
  type CategoriaFinanceiraInput,
} from "@/modules/financeiro/categorias/schemas";

const RECURSO = "financeiro.categorias" as const;
const ROTA = "/financeiro/categorias";
const TABELA = "categorias_financeiras" as const;

export type ResultadoAcao = { ok: true } | { erro: string };

const uuidSchema = z.uuid();

/** Cria uma categoria financeira. */
export async function criarCategoria(
  dados: CategoriaFinanceiraInput,
): Promise<ResultadoAcao> {
  await exigirPermissao(RECURSO, "criar");

  const validado = categoriaFinanceiraSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from(TABELA).insert({
    nome: validado.data.nome,
    tipo: validado.data.tipo,
    pai_id: validado.data.paiId,
    ativo: validado.data.ativo,
  });

  if (error) {
    if (error.code === "23505") {
      return { erro: "Já existe uma categoria com este nome e tipo" };
    }
    return { erro: "Não foi possível salvar a categoria. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Edita uma categoria financeira. */
export async function editarCategoria(
  id: string,
  dados: CategoriaFinanceiraInput,
): Promise<ResultadoAcao> {
  await exigirPermissao(RECURSO, "editar");

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Categoria inválida" };

  const validado = categoriaFinanceiraSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  // Uma categoria não pode ser pai de si mesma.
  if (validado.data.paiId === idValido.data) {
    return { erro: "A categoria não pode ser pai dela mesma" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from(TABELA)
    .update({
      nome: validado.data.nome,
      tipo: validado.data.tipo,
      pai_id: validado.data.paiId,
      ativo: validado.data.ativo,
    })
    .eq("id", idValido.data);

  if (error) {
    if (error.code === "23505") {
      return { erro: "Já existe uma categoria com este nome e tipo" };
    }
    return { erro: "Não foi possível salvar a categoria. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Ativa ou desativa uma categoria financeira. */
export async function alternarAtivo(
  id: string,
  ativo: boolean,
): Promise<ResultadoAcao> {
  await exigirPermissao(RECURSO, "editar");

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Categoria inválida" };

  const supabase = await createClient();
  const { error } = await supabase
    .from(TABELA)
    .update({ ativo })
    .eq("id", idValido.data);

  if (error) {
    return { erro: "Não foi possível alterar o status. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}
