import "server-only";

import { eventosDoAuditLog, type EventoTrilha } from "@/components/canonicos";
import { createClient } from "@/lib/supabase/server";
import { resolverNomesAuditLog } from "@/lib/trilha-nomes";

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

export async function listarContratos(filtros: { status?: string; tipo?: string; lixeira?: boolean }): Promise<ContratoLista[]> {
  const supabase = await createClient();
  let q = supabase
    .from("mc_contratos")
    .select("id, codigo, nome_obra, numero_contrato, contratante_nome, contratante_tipo, valor_inicial, status, excluido_em, motivo_exclusao")
    .order("codigo");
  q = filtros.lixeira ? q.not("excluido_em", "is", null) : q.is("excluido_em", null);
  if (filtros.status) q = q.eq("status", filtros.status);
  if (filtros.tipo) q = q.eq("contratante_tipo", filtros.tipo);
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
