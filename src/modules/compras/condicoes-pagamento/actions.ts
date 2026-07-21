"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";

type ResultadoCriacao = { descricao: string } | { erro: string };

const descricaoSchema = z
  .string()
  .trim()
  .min(1, { error: "Informe a condição de pagamento" })
  .max(120, { error: "No máximo 120 caracteres" });

/**
 * Cria uma condição de pagamento nova a partir do texto digitado no combobox.
 * Liberada para quem cria/edita Ordens ou Cotações. Idempotente: se já existir
 * (unique em descricao), apenas reaproveita. RLS no banco é a barreira final.
 */
export async function criarCondicaoPagamento(
  descricao: string,
): Promise<ResultadoCriacao> {
  const usuario = await getUsuarioLogado();
  const pode =
    temPermissao(usuario, "compras.ordens", "criar") ||
    temPermissao(usuario, "compras.ordens", "editar") ||
    temPermissao(usuario, "compras.cotacoes", "criar") ||
    temPermissao(usuario, "compras.cotacoes", "editar");
  if (!pode) {
    return { erro: "Sem permissão para criar condição de pagamento" };
  }

  const parsed = descricaoSchema.safeParse(descricao);
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Condição inválida" };
  }
  const desc = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("condicoes_pagamento")
    .insert({ descricao: desc });

  // Conflito de unicidade = já existe: tudo certo, só reaproveita a existente.
  if (error && !/duplicate key|23505/i.test(`${error.code} ${error.message}`)) {
    return { erro: "Não foi possível salvar a condição. Tente novamente." };
  }

  revalidatePath("/compras/ordens");
  revalidatePath("/compras/cotacoes");
  return { descricao: desc };
}
