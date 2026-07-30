import "server-only";

import type { Json } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import { inicioDoDiaISO } from "@/modules/compras/_shared/lista";

// As opções de usuário do filtro são as mesmas da auditoria: ficam no _shared de
// Administração para as duas telas lerem a mesma coisa.
export type { UsuarioParaFiltro } from "@/modules/administracao/_shared/queries";
export { listarUsuariosParaFiltro } from "@/modules/administracao/_shared/queries";

export interface ItemLixeira {
  id: string;
  tabela: string;
  registroId: string;
  motivo: string;
  dados: Json;
  excluidoPor: string;
  excluidoPorNome: string | null;
  excluidoEm: string;
  restauradoPor: string | null;
  restauradoPorNome: string | null;
  restauradoEm: string | null;
}

export interface ListarLixeiraParams {
  /** Página atual, base 0. */
  pagina: number;
  /** Registros por página. */
  tamanho: number;
  /** true: somente itens na lixeira (restaurado_em nulo). false: inclui o histórico de restaurados. */
  somenteAtivos: boolean;
  /** Nome da tabela de origem do registro excluído. */
  tabela?: string;
  /** Id do usuário que excluiu. */
  excluidoPor?: string;
  /** Início do período de exclusão (yyyy-MM-dd), pelo dia de Rio Branco. */
  de?: string;
  /** Fim do período de exclusão (yyyy-MM-dd), inclusive. */
  ate?: string;
  /** Termo procurado no motivo da exclusão. */
  motivo?: string;
}

export interface ResultadoLixeira {
  itens: ItemLixeira[];
  total: number;
}

/**
 * Padrão "contém" do termo, sem os caracteres que quebram a sintaxe do
 * PostgREST ou que virariam curinga de ilike. Termo que sobra vazio devolve
 * null: filtrar por "%" não é filtrar por nada, é ruído na consulta.
 */
function padraoContem(termo: string): string | null {
  const limpo = termo.replace(/[,()"'\\%_]/g, "").trim();
  return limpo === "" ? null : `%${limpo}%`;
}

/**
 * Lista a lixeira paginada no servidor, mais recente primeiro.
 * Faz o join manual dos nomes de quem excluiu e de quem restaurou.
 *
 * Todo filtro vai para o banco: a paginação é server-side, então filtrar só a
 * página carregada esconderia exclusões que existem e não apareceriam no total.
 */
export async function listarLixeira({
  pagina,
  tamanho,
  somenteAtivos,
  tabela,
  excluidoPor,
  de,
  ate,
  motivo,
}: ListarLixeiraParams): Promise<ResultadoLixeira> {
  const supabase = await createClient();

  const inicio = pagina * tamanho;
  let consulta = supabase
    .from("lixeira")
    .select(
      "id, tabela, registro_id, motivo, dados, excluido_por, excluido_em, restaurado_por, restaurado_em",
      { count: "exact" },
    )
    .order("excluido_em", { ascending: false })
    .range(inicio, inicio + tamanho - 1);

  if (somenteAtivos) {
    consulta = consulta.is("restaurado_em", null);
  }
  if (tabela) consulta = consulta.eq("tabela", tabela);
  if (excluidoPor) consulta = consulta.eq("excluido_por", excluidoPor);
  // `excluido_em` é timestamptz: o dia do usuário começa 05:00 UTC (Rio Branco),
  // e o fim do período entra pelo início do dia seguinte para pegar o dia todo.
  if (de) consulta = consulta.gte("excluido_em", inicioDoDiaISO(de));
  if (ate) consulta = consulta.lt("excluido_em", inicioDoDiaISO(ate, 1));
  const padraoMotivo = motivo ? padraoContem(motivo) : null;
  if (padraoMotivo) consulta = consulta.ilike("motivo", padraoMotivo);

  const { data, count, error } = await consulta;
  if (error) {
    throw new Error("Não foi possível carregar a lixeira");
  }

  const linhas = data ?? [];

  const idsUsuarios = new Set<string>();
  for (const linha of linhas) {
    idsUsuarios.add(linha.excluido_por);
    if (linha.restaurado_por) idsUsuarios.add(linha.restaurado_por);
  }

  // RPC com security definer: nomes pra quem tem permissão de lixeira
  // mesmo sem administracao.usuarios ver (RLS da tabela).
  const nomes = new Map<string, string>();
  if (idsUsuarios.size > 0) {
    const { data: usuarios } = await supabase.rpc("nomes_usuarios_auditoria", {
      p_ids: [...idsUsuarios],
    });
    for (const usuario of usuarios ?? []) {
      nomes.set(usuario.id, usuario.nome);
    }
  }

  return {
    itens: linhas.map((linha) => ({
      id: linha.id,
      tabela: linha.tabela,
      registroId: linha.registro_id,
      motivo: linha.motivo,
      dados: linha.dados,
      excluidoPor: linha.excluido_por,
      excluidoPorNome: nomes.get(linha.excluido_por) ?? null,
      excluidoEm: linha.excluido_em,
      restauradoPor: linha.restaurado_por,
      restauradoPorNome: linha.restaurado_por
        ? (nomes.get(linha.restaurado_por) ?? null)
        : null,
      restauradoEm: linha.restaurado_em,
    })),
    total: count ?? 0,
  };
}

/** Teto de linhas lidas para montar as opções do filtro de tabela. */
const MAX_LINHAS_OPCOES = 1000;

/**
 * Tabelas de origem presentes na lixeira, em ordem alfabética, para as opções
 * do filtro. O distinct é feito aqui porque o PostgREST não tem distinct: a
 * lixeira só recebe exclusão com motivo (volume baixo), e a leitura é limitada
 * a `MAX_LINHAS_OPCOES` para não crescer sem teto. Se um dia a lixeira passar
 * disso, vira RPC com distinct no banco, como `tabelas_auditadas`.
 */
export async function listarTabelasLixeira(): Promise<string[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("lixeira")
    .select("tabela")
    .order("tabela", { ascending: true })
    .limit(MAX_LINHAS_OPCOES);

  if (error) {
    throw new Error("Não foi possível carregar as tabelas da lixeira");
  }

  return [...new Set((data ?? []).map((linha) => linha.tabela))];
}
