import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { StatusObra } from "@/modules/cadastros/obras/schemas";

/** Linha da listagem de obras, com o nome do cliente resolvido. */
export interface ObraLista {
  id: string;
  nome: string;
  numeroContrato: string | null;
  clienteId: string | null;
  clienteNome: string | null;
  rodovia: string | null;
  lote: string | null;
  uf: string | null;
  extensaoKm: number | null;
  dataInicio: string | null;
  dataFimPrevista: string | null;
  status: StatusObra;
  observacoes: string | null;
  ativo: boolean;
}

/** Cliente disponível para vincular numa obra (select). */
export interface ClienteOpcao {
  id: string;
  nome: string;
}

/**
 * Lista todas as obras com o nome do cliente (join em clientes).
 * Usa nome_fantasia quando existe, senão a razão social (nome).
 */
export async function listarObras(): Promise<ObraLista[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("obras")
    .select(
      "id, nome, numero_contrato, cliente_id, rodovia, lote, uf, extensao_km, data_inicio, data_fim_prevista, status, observacoes, ativo, clientes(nome, nome_fantasia)",
    )
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar as obras");
  }

  return (data ?? []).map((obra) => ({
    id: obra.id,
    nome: obra.nome,
    numeroContrato: obra.numero_contrato,
    clienteId: obra.cliente_id,
    clienteNome: obra.clientes?.nome_fantasia ?? obra.clientes?.nome ?? null,
    rodovia: obra.rodovia,
    lote: obra.lote,
    uf: obra.uf,
    extensaoKm: obra.extensao_km,
    dataInicio: obra.data_inicio,
    dataFimPrevista: obra.data_fim_prevista,
    status: obra.status as StatusObra,
    observacoes: obra.observacoes,
    ativo: obra.ativo,
  }));
}

/**
 * Clientes ativos para o select da obra, ordenados pelo nome de exibição.
 * Mostra nome_fantasia quando existe, senão a razão social.
 */
export async function listarClientes(): Promise<ClienteOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("clientes")
    .select("id, nome, nome_fantasia")
    .eq("ativo", true)
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar os clientes");
  }

  return (data ?? []).map((cliente) => ({
    id: cliente.id,
    nome: cliente.nome_fantasia ?? cliente.nome,
  }));
}
