import "server-only";

import { eventosDoAuditLog, type EventoTrilha } from "@/components/canonicos";
import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import { resolverNomesAuditLog } from "@/lib/trilha-nomes";
import { facetasNoServidor, type FacetasPresentes } from "@/modules/_shared/filtros-facetados";

/** Leitura do cadastro de contrato. A RLS já filtra pela lista do contrato (D3). */

export interface ContratoLista {
  id: string;
  codigo: string;
  nomeObra: string;
  numeroContrato: string;
  contratanteNome: string;
  contratanteTipo: string;
  valorInicial: number;
  status: string;
  excluidoEm: string | null;
  motivoExclusao: string | null;
}

/**
 * Recorte dos contratos: lixeira (ou não), status e tipo de contratante. Lista vazia é "todos".
 * A lista da tela escolhe um de cada; o painel, vários (o mesmo recorte de `fn_mc_painel`).
 */
export interface FiltrosContratos {
  status?: readonly string[];
  tipos?: readonly string[];
  lixeira?: boolean;
}

/** O pedaço do builder do PostgREST que o recorte usa. */
interface ConsultaFiltravelContratos<T> {
  is: (coluna: string, valor: null) => T;
  not: (coluna: string, operador: string, valor: null) => T;
  in: (coluna: string, valores: readonly string[]) => T;
}

/**
 * Aplica o recorte na consulta recebida. Serve a lista e as facetas (`facetasContratos`), que
 * precisam do MESMO recorte. Síncrona: o builder é "thenable" (ver `aplicarFiltrosPagas`).
 */
export function aplicarFiltrosContratos<T extends ConsultaFiltravelContratos<T>>(consultaInicial: T, filtros: FiltrosContratos): T {
  let q = filtros.lixeira ? consultaInicial.not("excluido_em", "is", null) : consultaInicial.is("excluido_em", null);
  if (filtros.status && filtros.status.length > 0) q = q.in("status", filtros.status);
  if (filtros.tipos && filtros.tipos.length > 0) q = q.in("contratante_tipo", filtros.tipos);
  return q;
}

export async function listarContratos(filtros: { status?: string; tipo?: string; lixeira?: boolean }): Promise<ContratoLista[]> {
  const supabase = await createClient();
  const q = aplicarFiltrosContratos(
    supabase
      .from("mc_contratos")
      .select("id, codigo, nome_obra, numero_contrato, contratante_nome, contratante_tipo, valor_inicial, status, excluido_em, motivo_exclusao")
      .order("codigo"),
    {
      status: filtros.status ? [filtros.status] : [],
      tipos: filtros.tipo ? [filtros.tipo] : [],
      lixeira: filtros.lixeira,
    },
  );
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id, codigo: c.codigo, nomeObra: c.nome_obra, numeroContrato: c.numero_contrato, contratanteNome: c.contratante_nome,
    // `valor_inicial` é dinheiro de 2 casas (NUMERIC) e aqui só é EXIBIDO, nunca somado nem recalculado:
    // converter para `number` na leitura é seguro porque nenhuma conta sai deste valor, só a formatação em tela.
    contratanteTipo: c.contratante_tipo, valorInicial: Number(c.valor_inicial), status: c.status,
    excluidoEm: c.excluido_em, motivoExclusao: c.motivo_exclusao,
  }));
}

/** Os filtros de seleção de contrato (lista e painel): status e tipo de contratante. */
export type FacetaContratos = "status" | "tipo";

/**
 * O que existe no recorte, por filtro de seleção (ver `_shared/filtros-facetados`): as opções de
 * status saem dos contratos que passam no tipo, e vice-versa. A RLS de `mc_contratos` é a mesma
 * lista de acesso que `fn_mc_painel` usa (`fn_mc_meus_contratos`), então serve o painel também.
 * São dezenas de contratos: as consultas (no máximo duas) trazem só as duas colunas.
 */
export async function facetasContratos(filtros: FiltrosContratos): Promise<FacetasPresentes<FacetaContratos>> {
  const supabase = await createClient();
  type Linha = { status: string; contratante_tipo: string };
  return facetasNoServidor<Linha, FacetaContratos>(
    {
      status: { ativo: (filtros.status?.length ?? 0) > 0, chave: (c) => c.status },
      tipo: { ativo: (filtros.tipos?.length ?? 0) > 0, chave: (c) => c.contratante_tipo },
    },
    async (exceto) => {
      const recorte: FiltrosContratos = {
        ...filtros,
        ...(exceto === "status" ? { status: [] } : {}),
        ...(exceto === "tipo" ? { tipos: [] } : {}),
      };
      const { linhas, erro } = await todasAsLinhas<Linha>((de, ate) =>
        aplicarFiltrosContratos(supabase.from("mc_contratos").select("status, contratante_tipo"), recorte)
          .order("id")
          .range(de, ate),
      );
      if (erro) throw new Error("Não foi possível carregar os filtros dos contratos");
      return linhas;
    },
  );
}

export type ContratoDetalhe = NonNullable<Awaited<ReturnType<typeof carregarContrato>>>;

export async function carregarContrato(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("mc_contratos").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listarUsuariosDoContrato(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_mc_usuarios_do_contrato", { p_contrato: id });
  if (error) throw error;
  return data ?? [];
}

export async function listarUsuariosAtivos() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_mc_usuarios_ativos");
  if (error) throw error;
  return data ?? [];
}

export async function listarAditivos(contratoId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mc_aditivos")
    .select("id, numero, data_assinatura, data_vigencia, tipos, prazo_acrescido_meses, motivo, excluido_em")
    .eq("contrato_id", contratoId)
    .is("excluido_em", null)
    .order("numero");
  if (error) throw error;
  return data ?? [];
}

/**
 * Trilha de auditoria do contrato, a partir do audit_log (mesmo padrão de
 * `trilhaCotacao` em compras/cotacoes/queries.ts). Sem acesso à auditoria
 * (RLS devolve vazio) a trilha sai vazia, e a tela mostra "Sem eventos
 * registrados" em vez de quebrar.
 */
export async function trilhaContrato(id: string): Promise<EventoTrilha[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, tabela, registro_id, acao, usuario_id, dados_antes, dados_depois, criado_em")
    .eq("tabela", "mc_contratos")
    .eq("registro_id", id)
    .order("criado_em", { ascending: false })
    .order("id", { ascending: false });

  if (error || !data) return [];

  const idsUsuarios = [
    ...new Set(data.map((linha) => linha.usuario_id).filter((usuarioId): usuarioId is string => usuarioId !== null)),
  ];

  const nomesPorId = new Map<string, string>();
  if (idsUsuarios.length > 0) {
    const { data: usuarios } = await supabase.rpc("nomes_usuarios_auditoria", { p_ids: idsUsuarios });
    for (const usuario of usuarios ?? []) nomesPorId.set(usuario.id, usuario.nome);
  }

  const registros = data.map((linha) => ({
    id: linha.id,
    tabela: linha.tabela,
    registro_id: linha.registro_id,
    acao: linha.acao,
    usuario_id: linha.usuario_id,
    usuario_nome: linha.usuario_id ? (nomesPorId.get(linha.usuario_id) ?? "Sistema") : "Sistema",
    dados_antes: linha.dados_antes,
    dados_depois: linha.dados_depois,
    criado_em: linha.criado_em,
  }));

  const nomes = await resolverNomesAuditLog(supabase, registros);
  return eventosDoAuditLog(registros, { nomes, entidade: "Contrato", genero: "m" });
}
