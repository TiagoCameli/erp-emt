import "server-only";

import {
  eventosDoAuditLog,
  type EventoTrilha,
  type RegistroAuditLog,
} from "@/components/canonicos";
import { createClient } from "@/lib/supabase/server";
import type { StatusPedido } from "@/modules/compras/pedidos/schemas";

/** Linha da listagem de pedidos. */
export interface PedidoLista {
  id: string;
  numero: string | null;
  status: StatusPedido;
  qtdItens: number;
  criadoEm: string;
  solicitanteNome: string | null;
}

/** Item de um pedido no detalhe, com nomes resolvidos para exibir. */
export interface PedidoItemDetalhe {
  id: string;
  insumoId: string;
  insumoNome: string;
  insumoUnidade: string | null;
  quantidade: number;
  centroCustoId: string;
  centroCustoNome: string;
  depositoId: string | null;
  depositoNome: string | null;
  observacao: string | null;
}

/** Pedido completo do detalhe, com itens e dados de aprovação. */
export interface PedidoDetalhe {
  id: string;
  numero: string | null;
  status: StatusPedido;
  justificativa: string | null;
  motivoRejeicao: string | null;
  aprovadoPorNome: string | null;
  aprovadoEm: string | null;
  criadoEm: string;
  solicitanteNome: string | null;
  itens: PedidoItemDetalhe[];
}

/** Opção genérica de select por nome. */
export interface OpcaoSelecao {
  id: string;
  nome: string;
}

/** Insumo do select, com a unidade de medida para exibir junto da quantidade. */
export interface InsumoOpcao {
  id: string;
  nome: string;
  unidade: string | null;
}

/** Resolve o nome de exibição de um usuário pela razão de exibição. */
function nomePorId(
  mapa: Map<string, string>,
  id: string | null,
): string | null {
  if (!id) return null;
  return mapa.get(id) ?? null;
}

/**
 * Busca os nomes dos usuários de uma lista de ids. Resolve por uma RPC security
 * definer gated em compras.pedidos/ver, porque a RLS de public.usuarios só deixa
 * o usuário ver o próprio registro: ler a tabela direto sumiria com o nome do
 * solicitante e do aprovador para quem não é admin.
 */
async function mapaNomesUsuarios(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: (string | null)[],
): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unicos.length === 0) return new Map();

  const { data } = await supabase.rpc("nomes_usuarios_compras", {
    p_ids: unicos,
  });

  const mapa = new Map<string, string>();
  for (const usuario of data ?? []) {
    mapa.set(usuario.id, usuario.nome);
  }
  return mapa;
}

/**
 * Lista os pedidos com contagem de itens e nome do solicitante.
 * O solicitante (created_by) não tem FK declarada para usuarios, então
 * resolvemos os nomes num select separado.
 */
export async function listarPedidos(): Promise<PedidoLista[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("pedidos")
    .select("id, numero, status, created_at, created_by, pedido_itens(id)")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error("Não foi possível carregar os pedidos");
  }

  const linhas = data ?? [];
  const mapaNomes = await mapaNomesUsuarios(
    supabase,
    linhas.map((pedido) => pedido.created_by),
  );

  return linhas.map((pedido) => ({
    id: pedido.id,
    numero: pedido.numero,
    status: pedido.status as StatusPedido,
    qtdItens: pedido.pedido_itens?.length ?? 0,
    criadoEm: pedido.created_at,
    solicitanteNome: nomePorId(mapaNomes, pedido.created_by),
  }));
}

/**
 * Busca um pedido com os itens e os nomes de insumo, centro de custo e
 * depósito resolvidos por join. Retorna null se não existir ou sem acesso.
 */
export async function buscarPedido(
  id: string,
): Promise<PedidoDetalhe | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("pedidos")
    .select(
      `id, numero, status, justificativa, motivo_rejeicao, aprovado_por, aprovado_em, created_at, created_by,
       pedido_itens(
         id, insumo_id, quantidade, centro_custo_id, deposito_id, observacao,
         insumos(nome, unidades_medida(sigla)),
         centros_custo(nome),
         depositos(nome)
       )`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  const mapaNomes = await mapaNomesUsuarios(supabase, [
    data.created_by,
    data.aprovado_por,
  ]);

  const itens: PedidoItemDetalhe[] = (data.pedido_itens ?? []).map((item) => ({
    id: item.id,
    insumoId: item.insumo_id,
    insumoNome: item.insumos?.nome ?? "Insumo removido",
    insumoUnidade: item.insumos?.unidades_medida?.sigla ?? null,
    quantidade: item.quantidade,
    centroCustoId: item.centro_custo_id,
    centroCustoNome: item.centros_custo?.nome ?? "Centro removido",
    depositoId: item.deposito_id,
    depositoNome: item.depositos?.nome ?? null,
    observacao: item.observacao,
  }));

  return {
    id: data.id,
    numero: data.numero,
    status: data.status as StatusPedido,
    justificativa: data.justificativa,
    motivoRejeicao: data.motivo_rejeicao,
    aprovadoPorNome: nomePorId(mapaNomes, data.aprovado_por),
    aprovadoEm: data.aprovado_em,
    criadoEm: data.created_at,
    solicitanteNome: nomePorId(mapaNomes, data.created_by),
    itens,
  };
}

/** Insumos ativos para o select do item, com a sigla da unidade. */
export async function listarInsumos(): Promise<InsumoOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("insumos")
    .select("id, nome, unidades_medida(sigla)")
    .eq("ativo", true)
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar os insumos");
  }

  return (data ?? []).map((insumo) => ({
    id: insumo.id,
    nome: insumo.nome,
    unidade: insumo.unidades_medida?.sigla ?? null,
  }));
}

/** Centros de custo ativos para o select do item, ordenados pelo nome. */
export async function listarCentrosCusto(): Promise<OpcaoSelecao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("centros_custo")
    .select("id, nome, codigo")
    .eq("ativo", true)
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar os centros de custo");
  }

  return (data ?? []).map((centro) => ({
    id: centro.id,
    nome: centro.codigo ? `${centro.codigo} ${centro.nome}` : centro.nome,
  }));
}

/** Depósitos ativos para o select do item, ordenados pelo nome. */
export async function listarDepositos(): Promise<OpcaoSelecao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("depositos")
    .select("id, nome")
    .eq("ativo", true)
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar os depósitos");
  }

  return (data ?? []).map((deposito) => ({
    id: deposito.id,
    nome: deposito.nome,
  }));
}

/**
 * Trilha de auditoria do pedido: eventos do próprio pedido e dos itens dele.
 * Lê o audit_log de pedidos (registro_id = id) e de pedido_itens (cujos
 * registros pertencem ao pedido), resolve o nome do usuário e converte com
 * eventosDoAuditLog.
 */
export async function trilhaPedido(id: string): Promise<EventoTrilha[]> {
  const supabase = await createClient();

  // Ids dos itens que pertencem (ou pertenceram) ao pedido, para casar o log.
  const { data: itens } = await supabase
    .from("pedido_itens")
    .select("id")
    .eq("pedido_id", id);
  const idsItens = (itens ?? []).map((item) => item.id);

  const [logPedido, logItens] = await Promise.all([
    supabase
      .from("audit_log")
      .select(
        "id, tabela, registro_id, acao, usuario_id, dados_antes, dados_depois, criado_em",
      )
      .eq("tabela", "pedidos")
      .eq("registro_id", id),
    idsItens.length > 0
      ? supabase
          .from("audit_log")
          .select(
            "id, tabela, registro_id, acao, usuario_id, dados_antes, dados_depois, criado_em",
          )
          .eq("tabela", "pedido_itens")
          .in("registro_id", idsItens)
      : Promise.resolve({ data: [] as RegistroAuditLog[] }),
  ]);

  const registros: RegistroAuditLog[] = [
    ...(logPedido.data ?? []),
    ...(logItens.data ?? []),
  ];

  const mapaNomes = await mapaNomesUsuarios(
    supabase,
    registros.map((registro) => registro.usuario_id ?? null),
  );

  return eventosDoAuditLog(
    registros.map((registro) => ({
      ...registro,
      usuario_nome: registro.usuario_id
        ? (mapaNomes.get(registro.usuario_id) ?? null)
        : null,
    })),
  );
}
