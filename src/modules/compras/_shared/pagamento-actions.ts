"use server";

import { logErroServidor } from "@/lib/erros";
import { createClient } from "@/lib/supabase/server";
import {
  tipoFormaPagamento,
  type TipoFormaPagamento,
} from "@/modules/_shared/forma-pagamento";

type CriarResultado = { id: string } | { erro: string };

/**
 * Interpreta o nome da condição em parcelas {dias_offset, percentual}:
 * "à vista" -> [0/100]; "15 dias" -> [15/100]; "30/60 dias" -> [30/50, 60/50];
 * "30/60/90" -> 3 parcelas (a última fecha os 100). Sem número reconhecido,
 * cai em à vista.
 */
function parcelasDoNome(
  nome: string,
): { dias_offset: number; percentual: number }[] {
  const texto = nome.trim().toLowerCase();
  const nums = (texto.match(/\d+/g) ?? [])
    .map((n) => Number.parseInt(n, 10))
    .filter((n) => !Number.isNaN(n));
  if (nums.length === 0) return [{ dias_offset: 0, percentual: 100 }];
  const k = nums.length;
  const base = Math.floor((100 / k) * 100) / 100;
  return nums.map((dias, i) => ({
    dias_offset: dias,
    percentual: i === k - 1 ? Number((100 - base * (k - 1)).toFixed(2)) : base,
  }));
}

/** Cria uma condição de pagamento na hora, montando as parcelas pelo nome. */
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
    logErroServidor("compras.criar-condicao", error);
    return {
      erro: error.message || "Não foi possível criar a condição de pagamento",
    };
  }
  return { id: data as string };
}

/** Cria uma forma de pagamento (método) na hora. */
export async function criarFormaPagamento(
  nome: string,
  tipo: TipoFormaPagamento = "bancario",
): Promise<CriarResultado> {
  const limpo = (nome ?? "").trim();
  if (limpo.length < 2) return { erro: "Informe um nome válido" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_criar_forma_pagamento", {
    p_nome: limpo,
    p_tipo: tipoFormaPagamento(tipo),
  });
  if (error) {
    logErroServidor("compras.criar-forma", error);
    return {
      erro: error.message || "Não foi possível criar a forma de pagamento",
    };
  }
  return { id: data as string };
}
