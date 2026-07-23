import "server-only";

import type { createClient } from "@/lib/supabase/server";
import {
  CAMPOS_FK,
  type RegistroAuditLog,
  type TabelaFk,
} from "@/components/canonicos";

/** Client de servidor (mesmo tipo que `createClient()` de `@/lib/supabase/server` devolve). */
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** Varre dados_antes/dados_depois dos registros e agrupa os UUIDs de FK por tabela de destino. */
function coletarIdsPorTabela(
  registros: RegistroAuditLog[],
): Map<TabelaFk, Set<string>> {
  const mapa = new Map<TabelaFk, Set<string>>();
  for (const r of registros) {
    for (const dados of [r.dados_antes, r.dados_depois]) {
      if (!dados || typeof dados !== "object" || Array.isArray(dados)) continue;
      for (const [campo, tabela] of Object.entries(CAMPOS_FK)) {
        const v = (dados as Record<string, unknown>)[campo];
        if (typeof v === "string" && v) {
          if (!mapa.has(tabela)) mapa.set(tabela, new Set());
          mapa.get(tabela)!.add(v);
        }
      }
    }
  }
  return mapa;
}

/**
 * Busca id -> nome de uma tabela de FK. Cada tabela tem seu próprio select
 * (literal, não dinâmico) para manter o tipo do retorno seguro sem `any`.
 * Erro de lookup nunca propaga: degrada para "sem nomes dessa tabela", e
 * quem chama (eventosDoAuditLog) já oculta FK sem nome resolvido.
 */
async function buscarNomes(
  supabase: SupabaseServerClient,
  tabela: TabelaFk,
  ids: string[],
): Promise<Record<string, string>> {
  const nomes: Record<string, string> = {};
  try {
    switch (tabela) {
      case "condicoes_pagamento": {
        const { data } = await supabase
          .from("condicoes_pagamento")
          .select("id, descricao")
          .in("id", ids);
        for (const linha of data ?? []) nomes[linha.id] = linha.descricao;
        break;
      }
      case "fornecedores": {
        const { data } = await supabase
          .from("fornecedores")
          .select("id, nome_fantasia, razao_social")
          .in("id", ids);
        for (const linha of data ?? []) {
          nomes[linha.id] = linha.nome_fantasia ?? linha.razao_social;
        }
        break;
      }
      case "centros_custo": {
        const { data } = await supabase
          .from("centros_custo")
          .select("id, nome")
          .in("id", ids);
        for (const linha of data ?? []) nomes[linha.id] = linha.nome;
        break;
      }
      case "insumos": {
        const { data } = await supabase
          .from("insumos")
          .select("id, nome")
          .in("id", ids);
        for (const linha of data ?? []) nomes[linha.id] = linha.nome;
        break;
      }
      case "usuarios": {
        const { data } = await supabase
          .from("usuarios")
          .select("id, nome")
          .in("id", ids);
        for (const linha of data ?? []) nomes[linha.id] = linha.nome;
        break;
      }
    }
  } catch {
    // Lookup nunca pode quebrar a trilha: some com o nome, não com a tela.
  }
  return nomes;
}

/**
 * Resolve os UUIDs de campos FK (fornecedor_id, centro_custo_id, insumo_id,
 * condicao_pagamento_id, usuario_id) presentes nos dados_antes/dados_depois
 * do audit_log para o nome de exibição, em lote (uma query por tabela).
 * Usado pelas telas de detalhe para passar `{ nomes }` a `eventosDoAuditLog`.
 */
export async function resolverNomesAuditLog(
  supabase: SupabaseServerClient,
  registros: RegistroAuditLog[],
): Promise<Record<string, string>> {
  const porTabela = coletarIdsPorTabela(registros);

  const nomes: Record<string, string> = {};
  const resultados = await Promise.all(
    [...porTabela.entries()].map(([tabela, ids]) =>
      buscarNomes(supabase, tabela, [...ids]),
    ),
  );
  for (const resultado of resultados) Object.assign(nomes, resultado);
  return nomes;
}
