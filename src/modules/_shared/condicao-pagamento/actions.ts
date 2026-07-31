"use server";

import { logErroServidor } from "@/lib/erros";
import { createClient } from "@/lib/supabase/server";

import { parcelasDoNome } from "./regras";

type CriarResultado = { id: string } | { erro: string };

/**
 * Cria uma condição de pagamento na hora, montando as parcelas pelo nome.
 *
 * Serve OC, cotação e lançamento avulso: o catálogo é um só, então quem cria
 * "45/90 dias" no lançamento passa a ver a mesma opção na OC.
 *
 * A permissão é do cadastro, não do módulo: `salvar_condicao` exige
 * `cadastros.condicoes-pagamento / criar`, e é o banco que recusa. Quem não tem
 * o cadastro continua escolhendo da lista, só não cria.
 */
export async function criarCondicaoPagamento(
  nome: string,
): Promise<CriarResultado> {
  const limpo = (nome ?? "").trim();
  if (limpo.length < 2) return { erro: "Informe um nome válido" };
  const supabase = await createClient();

  // Não duplica: se já existe uma condição com esse nome, devolve a existente.
  const { data: existentes } = await supabase
    .from("condicoes_pagamento")
    .select("id")
    .ilike("descricao", limpo)
    .limit(1);
  if (existentes && existentes.length > 0) {
    return { id: existentes[0].id };
  }

  const { data, error } = await supabase.rpc("salvar_condicao", {
    p_id: null as unknown as string,
    p_descricao: limpo,
    p_ativo: true,
    p_parcelas: parcelasDoNome(limpo),
  });
  if (error) {
    logErroServidor("condicao-pagamento.criar", error);
    return {
      erro: error.message || "Não foi possível criar a condição de pagamento",
    };
  }
  return { id: data as string };
}
