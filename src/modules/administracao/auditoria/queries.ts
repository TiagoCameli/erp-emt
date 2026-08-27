import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/database.types";
import type { RegistroAuditLog } from "@/components/canonicos";
import { resolverNomesAuditLog } from "@/lib/trilha-nomes";
import { inicioDoDiaISO } from "@/modules/compras/_shared/lista";

// As opções de usuário do filtro são as mesmas da lixeira: ficam no _shared de
// Administração para as duas telas lerem a mesma coisa.
export type { UsuarioParaFiltro } from "@/modules/administracao/_shared/queries";
export { listarUsuariosParaFiltro } from "@/modules/administracao/_shared/queries";

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
  /** Início do período da alteração (yyyy-MM-dd), pelo dia de Rio Branco. */
  de?: string;
  /** Fim do período da alteração (yyyy-MM-dd), inclusive. */
  ate?: string;
  /** Início do id do registro alterado, para caçar um registro específico. */
  registro?: string;
}

export interface ResultadoAuditoria {
  registros: RegistroAuditoria[];
  total: number;
  /** Nome resolvido (id -> nome) dos campos FK que aparecem em dados_antes/dados_depois. */
  nomes: Record<string, string>;
}

const NOME_SISTEMA = "Sistema";

/**
 * Padrão "começa com" do termo, sem os caracteres que quebram a sintaxe do
 * PostgREST ou que virariam curinga de like. Termo que sobra vazio devolve
 * null: sem isso o padrão viraria "%" e o filtro sumiria com as linhas sem
 * registro_id, filtrando por nada.
 *
 * Devolve em MINÚSCULAS porque a comparação é `like`, sensível a caixa, e
 * `uuid::text` no Postgres é sempre minúsculo. Sem isto, colar um id em
 * maiúsculas (é como várias ferramentas copiam) devolveria lista vazia, e nesta
 * tela lista vazia lê como "não existe registro nenhum desse documento".
 */
function padraoInicio(termo: string): string | null {
  const limpo = termo
    .replace(/[,()"'\\%_]/g, "")
    .trim()
    .toLowerCase();
  return limpo === "" ? null : `${limpo}%`;
}

/**
 * Lista o audit_log paginado no servidor (count exato) com os filtros
 * opcionais de tabela, usuário, ação, período e id do registro. Resolve os
 * nomes dos usuários envolvidos em uma segunda consulta (join manual via Map).
 *
 * Todo filtro vai para o banco: a paginação é server-side (o audit_log passa de
 * 29 mil linhas), então filtrar só a página carregada mostraria um punhado de
 * resultados e esconderia o resto.
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
  // `criado_em` é timestamptz: o dia do usuário começa 05:00 UTC (Rio Branco),
  // e o fim do período entra pelo início do dia seguinte, para incluir o dia
  // inteiro sem depender de hora.
  if (filtros.de) {
    consulta = consulta.gte("criado_em", inicioDoDiaISO(filtros.de));
  }
  if (filtros.ate) {
    consulta = consulta.lt("criado_em", inicioDoDiaISO(filtros.ate, 1));
  }
  const padraoRegistro = filtros.registro
    ? padraoInicio(filtros.registro)
    : null;
  if (padraoRegistro) {
    // `like`, e NÃO `ilike`. Medido neste banco, com 210.199 linhas na
    // audit_log: o `ilike` levava 1.757 ms e o `like` 91 ms, 19 vezes menos.
    // `ilike` numa coluna uuid obriga o Postgres a baixar a caixa dos dois lados
    // por linha, e ainda o levava ao plano pior (index scan de `criado_em` lendo
    // o heap das 210 mil). Com cache frio a consulta passava dos 8 s do
    // `statement_timeout` do `authenticated` e a tela morria inteira, com "Algo
    // deu errado ao carregar esta tela" -- não é lentidão, é filtro que derruba
    // a página. A caixa é resolvida em `padraoInicio`.
    consulta = consulta.like("registro_id", padraoRegistro);
  }

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
