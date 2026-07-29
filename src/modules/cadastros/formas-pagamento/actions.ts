"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { erroAcao } from "@/lib/erros";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  formaPagamentoSchema,
  type FormaPagamentoInput,
} from "@/modules/cadastros/formas-pagamento/schemas";

const RECURSO = "cadastros.formas-pagamento" as const;
const ROTA = "/cadastros/formas-pagamento";

export type ResultadoAcao = { ok: true } | { erro: string };
export type ResultadoCriacao = { ok: true; id: string } | { erro: string };

const uuidSchema = z.uuid();

const ERRO_NOME_DUPLICADO = "Já existe uma forma de pagamento com este nome";

/**
 * Cria uma forma de pagamento. A escrita passa pela RPC
 * fn_salvar_forma_pagamento (security definer): não há grant de INSERT nem
 * UPDATE em formas_pagamento para o client, e a RPC revalida a permissão e o
 * tipo. As rotas de compras e financeiro são revalidadas porque os selects de
 * forma de pagamento vivem lá.
 */
export async function criarForma(
  dados: FormaPagamentoInput,
): Promise<ResultadoCriacao> {
  try {
    await exigirPermissao(RECURSO, "criar");
  } catch {
    return { erro: "Sem permissão para criar formas de pagamento" };
  }

  const validado = formaPagamentoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("fn_salvar_forma_pagamento", {
    // A RPC aceita p_id nulo em runtime (cria quando nulo, edita quando
    // preenchido); o tipo gerado pro Args não reflete essa nulidade.
    p_id: null as unknown as string,
    p_nome: validado.data.nome,
    p_tipo: validado.data.tipo,
    p_ativo: validado.data.ativo,
  });

  if (error || !id) {
    if (error?.code === "23505") return { erro: ERRO_NOME_DUPLICADO };
    return erroAcao(
      "cadastros.formas-pagamento.criarForma",
      error,
      error?.message ||
        "Não foi possível salvar a forma de pagamento. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true, id };
}

/**
 * Edita nome, tipo e status de uma forma existente. Mudar o tipo muda o caminho
 * dos pagamentos FUTUROS; lançamentos já criados seguem o caminho que tomaram
 * (o banco não reescreve parcela aprovada ou paga).
 */
export async function editarForma(
  id: string,
  dados: FormaPagamentoInput,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para editar formas de pagamento" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Forma de pagamento inválida" };

  const validado = formaPagamentoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_salvar_forma_pagamento", {
    p_id: idValido.data,
    p_nome: validado.data.nome,
    p_tipo: validado.data.tipo,
    p_ativo: validado.data.ativo,
  });

  if (error) {
    if (error.code === "23505") return { erro: ERRO_NOME_DUPLICADO };
    return erroAcao(
      "cadastros.formas-pagamento.editarForma",
      error,
      error.message ||
        "Não foi possível salvar a forma de pagamento. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}
