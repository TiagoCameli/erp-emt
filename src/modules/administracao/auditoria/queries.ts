import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/database.types";
import type { RegistroAuditLog } from "@/components/canonicos";
import { resolverNomesAuditLog } from "@/lib/trilha-nomes";

/** Ações gravadas pelos triggers de auditoria. */
export type AcaoAuditoria = "INSERT" | "UPDATE" | "DELETE";

export interface RegistroAuditoria {
  id: number;
  tabela: string;
  registroId: string | null;
  acao: string;
  usuarioId: string | null;
  /** Nome resolvido do usuário; registros sem usuário viram "Sistema". */
  usuarioNome: string;
  dadosAntes: Json | null;
  dadosDepois: Json | null;
  criadoEm: string;
}

export interface FiltrosAuditoria {
  /** Página atual, base 1. */
  pagina: number;
  /** Registros por página. */
  tamanho: number;
  tabela?: string;
  usuarioId?: string;
  acao?: AcaoAuditoria;
}

export interface ResultadoAuditoria {
  registros: RegistroAuditoria[];
  total: number;
  /** Nome resolvido (id -> nome) dos campos FK que aparecem em dados_antes/dados_depois. */
  nomes: Record<string, string>;
}

export interface UsuarioParaFiltro {
  id: string;
  nome: string;
}

const NOME_SISTEMA = "Sistema";

/**
 * Lista o audit_log paginado no servidor (count exato) com os filtros
 * opcionais de tabela, usuário e ação. Resolve os nomes dos usuários
 * envolvidos em uma segunda consulta (join manual via Map).
 */
export async function listarAuditoria(
  filtros: FiltrosAuditoria,
): Promise<ResultadoAuditoria> {
  const supabase = await createClient();

  const de = Math.max(0, (filtros.pagina - 1) * filtros.tamanho);
  const ate = de + filtros.tamanho - 1;

  let consulta = supabase
    .from("audit_log")
    .select(
      "id, tabela, registro_id, acao, usuario_id, dados_antes, dados_depois, criado_em",
      { count: "exact" },
    );

  if (filtros.tabela) consulta = consulta.eq("tabela", filtros.tabela);
  if (filtros.usuarioId) consulta = consulta.eq("usuario_id", filtros.usuarioId);
  if (filtros.acao) consulta = consulta.eq("acao", filtros.acao);

  const { data, error, count } = await consulta
    .order("criado_em", { ascending: false })
    .order("id", { ascending: false })
    .range(de, ate);

  if (error) {
    throw new Error(`Falha ao listar a auditoria: ${error.message}`);
  }

  const linhas = data ?? [];

  const idsUsuarios = [
    ...new Set(
      linhas
        .map((linha) => linha.usuario_id)
        .filter((id): id is string => id !== null),
    ),
  ];

  // RPC com security definer: resolve nomes pra quem tem permissão de
  // auditoria mesmo sem administracao.usuarios ver (RLS da tabela).
  const nomesPorId = new Map<string, string>();
  if (idsUsuarios.length > 0) {
    const { data: usuarios, error: erroUsuarios } = await supabase.rpc(
      "nomes_usuarios_auditoria",
      { p_ids: idsUsuarios },
    );

    if (erroUsuarios) {
      throw new Error(
        `Falha ao buscar os usuários da auditoria: ${erroUsuarios.message}`,
      );
    }

    for (const usuario of usuarios ?? []) {
      nomesPorId.set(usuario.id, usuario.nome);
    }
  }

  const registros: RegistroAuditoria[] = linhas.map((linha) => ({
    id: linha.id,
    tabela: linha.tabela,
    registroId: linha.registro_id,
    acao: linha.acao,
    usuarioId: linha.usuario_id,
    usuarioNome:
      linha.usuario_id === null
        ? NOME_SISTEMA
        : (nomesPorId.get(linha.usuario_id) ?? NOME_SISTEMA),
    dadosAntes: linha.dados_antes,
    dadosDepois: linha.dados_depois,
    criadoEm: linha.criado_em,
  }));

  // Resolve os nomes de FK (fornecedor, centro de custo, insumo, condição de
  // pagamento) presentes nos dados_antes/dados_depois desta página, pro diff
  // exibir nome em vez de UUID cru.
  const registrosParaNomes: RegistroAuditLog[] = linhas.map((linha) => ({
    id: linha.id,
    tabela: linha.tabela,
    registro_id: linha.registro_id,
    acao: linha.acao,
    dados_antes: linha.dados_antes,
    dados_depois: linha.dados_depois,
    criado_em: linha.criado_em,
  }));
  const nomes = await resolverNomesAuditLog(supabase, registrosParaNomes);

  return { registros, total: count ?? 0, nomes };
}

/**
 * Tabelas distintas presentes no audit_log, em ordem alfabética.
 * Distinct no banco via RPC: sem o cap de 1000 linhas do PostgREST.
 */
export async function listarTabelasAuditadas(): Promise<string[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("tabelas_auditadas");

  if (error) {
    throw new Error(`Falha ao listar as tabelas auditadas: ${error.message}`);
  }

  return data ?? [];
}

/** Usuários para o filtro da auditoria, em ordem alfabética. */
export async function listarUsuariosParaFiltro(): Promise<UsuarioParaFiltro[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("usuarios")
    .select("id, nome")
    .order("nome", { ascending: true });

  if (error) {
    throw new Error(
      `Falha ao listar os usuários para o filtro: ${error.message}`,
    );
  }

  return data ?? [];
}
