"use server";

import { z } from "zod";

import { logErroServidor } from "@/lib/erros";
import { getUsuarioLogado } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";

/**
 * Preferência de tabela por usuário, guardada no banco.
 *
 * Não tem checagem de permissão de recurso de propósito: a preferência é da
 * pessoa sobre a própria tela, não é dado de negócio. O que garante isolamento é
 * a RLS (só lê a própria linha) e a RPC, que escreve sempre em `auth.uid()` e
 * ignora qualquer id que venha do cliente. Ninguém consegue ler nem escrever a
 * preferência de outro, mesmo chamando a ação na mão.
 */

const tabelaSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  // Mesmo formato dos recursos: modulo.aba, e um sufixo opcional para a tela que
  // tem mais de uma tabela (ex. financeiro.pagamentos.pagas).
  .regex(/^[a-z0-9-]+(\.[a-z0-9-]+)*$/, "Tabela inválida");

export async function buscarPreferenciaTabela(
  tabela: string,
): Promise<string | null> {
  const valida = tabelaSchema.safeParse(tabela);
  if (!valida.success) return null;

  const usuario = await getUsuarioLogado();
  if (!usuario) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("preferencias_tabela")
    .select("preferencia")
    .eq("tabela", valida.data)
    .maybeSingle();

  if (error || !data) return null;
  return JSON.stringify(data.preferencia);
}

export async function salvarPreferenciaTabela(
  tabela: string,
  preferenciaJson: string,
): Promise<void> {
  const valida = tabelaSchema.safeParse(tabela);
  if (!valida.success) return;

  const usuario = await getUsuarioLogado();
  if (!usuario) return;

  let preferencia: unknown;
  try {
    preferencia = JSON.parse(preferenciaJson);
  } catch {
    return;
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_salvar_preferencia_tabela", {
    p_tabela: valida.data,
    p_preferencia: preferencia as never,
  });

  // Falha aqui não pode atrapalhar quem está usando a tela: a preferência é
  // conforto, não trabalho. Fica no log do servidor.
  if (error) {
    logErroServidor("preferencias-tabela.salvar", error);
  }
}

export async function limparPreferenciaTabela(tabela: string): Promise<void> {
  const valida = tabelaSchema.safeParse(tabela);
  if (!valida.success) return;

  const usuario = await getUsuarioLogado();
  if (!usuario) return;

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_limpar_preferencia_tabela", {
    p_tabela: valida.data,
  });

  if (error) {
    logErroServidor("preferencias-tabela.limpar", error);
  }
}
