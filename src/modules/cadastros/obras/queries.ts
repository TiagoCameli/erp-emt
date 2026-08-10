import "server-only";

import { createClient } from "@/lib/supabase/server";
import { motivoBloqueioObra } from "@/modules/cadastros/_shared/dependencias";
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
  /**
   * Por que esta obra não pode ser excluída, já em pt-BR, ou null quando
   * pode. Vem de fn_obra_bloqueio: a regra é do banco, aqui só traduzimos.
   */
  motivoBloqueio: string | null;
}

/** Cliente disponível para vincular numa obra (select). */
export interface ClienteOpcao {
  id: string;
  nome: string;
}

/**
 * Lista todas as obras com o nome do cliente (join em clientes).
 * Usa nome_fantasia quando existe, senão a razão social (nome).
 *
 * O bloqueio de exclusão vem numa segunda chamada, em lote
 * (fn_obras_bloqueios), e não por linha: a contagem precisa de security
 * definer para não sair zerada sob RLS, e uma chamada por obra seria N+1.
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

  const { data: bloqueios, error: erroBloqueios } = await supabase.rpc(
    "fn_obras_bloqueios",
    { p_ids: (data ?? []).map((obra) => obra.id) },
  );

  if (erroBloqueios) {
    throw new Error("Não foi possível carregar as obras");
  }

  const porObra = new Map<string, string | null>(
    (bloqueios ?? []).map((linha) => [linha.obra_id, linha.bloqueio]),
  );

  /**
   * Obra ausente do lote é tratada como "não encontrada", nunca como
   * liberada: omissão não pode habilitar um botão destrutivo.
   */
  const bloqueioDe = (id: string): string | null =>
    porObra.has(id) ? (porObra.get(id) ?? null) : "nao_encontrado";

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
    motivoBloqueio: motivoBloqueioObra(bloqueioDe(obra.id)),
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
