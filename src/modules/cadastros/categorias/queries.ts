import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  corGrupo,
  type CorGrupo,
  type SlugGrupo,
} from "@/modules/cadastros/_shared/insumo-grupos";

/** Um dos 4 grupos fixos, com as subcategorias dele. */
export interface GrupoComCategorias {
  id: string;
  slug: SlugGrupo;
  nome: string;
  ordem: number;
  cor: CorGrupo;
  categorias: CategoriaLista[];
  /** Soma dos insumos das subcategorias, para o cabeçalho da seção. */
  insumos: number;
}

/** Linha da listagem de subcategorias de insumo. */
export interface CategoriaLista {
  id: string;
  nome: string;
  grupoId: string;
  grupoNome: string;
  grupoCor: CorGrupo;
  ativo: boolean;
  criadoEm: string;
  /** Quantos insumos usam esta subcategoria (bloqueia exclusão). */
  insumos: number;
}

/** Opção de grupo para os selects. */
export interface GrupoOpcao {
  id: string;
  slug: SlugGrupo;
  nome: string;
  cor: CorGrupo;
  ordem: number;
}

/** Os 4 grupos, na ordem de exibição. */
export async function listarGrupos(): Promise<GrupoOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("insumo_grupos")
    .select("id, slug, nome, cor, ordem")
    .order("ordem");

  if (error) throw new Error("Não foi possível carregar os grupos de insumo");

  return (data ?? []).map((grupo) => ({
    id: grupo.id,
    slug: grupo.slug as SlugGrupo,
    nome: grupo.nome,
    cor: corGrupo(grupo.cor),
    ordem: grupo.ordem,
  }));
}

/**
 * Subcategorias agrupadas pelos 4 grupos, com a contagem de insumos de cada
 * uma. A contagem vem no mesmo select (embed com count), sem consulta por linha.
 */
export async function listarPorGrupo(): Promise<GrupoComCategorias[]> {
  const supabase = await createClient();

  const [grupos, categorias] = await Promise.all([
    listarGrupos(),
    supabase
      .from("categorias_insumo")
      .select("id, nome, grupo_id, ativo, created_at, insumos(count)")
      .order("nome"),
  ]);

  if (categorias.error) {
    throw new Error("Não foi possível carregar as categorias");
  }

  const porGrupo = new Map<string, CategoriaLista[]>();
  for (const categoria of categorias.data ?? []) {
    const grupo = grupos.find((g) => g.id === categoria.grupo_id);
    if (!grupo) continue;
    const contagem = categoria.insumos as { count: number }[] | null;
    const linha: CategoriaLista = {
      id: categoria.id,
      nome: categoria.nome,
      grupoId: categoria.grupo_id,
      grupoNome: grupo.nome,
      grupoCor: grupo.cor,
      ativo: categoria.ativo,
      criadoEm: categoria.created_at,
      insumos: contagem?.[0]?.count ?? 0,
    };
    porGrupo.set(categoria.grupo_id, [
      ...(porGrupo.get(categoria.grupo_id) ?? []),
      linha,
    ]);
  }

  return grupos.map((grupo) => {
    const lista = porGrupo.get(grupo.id) ?? [];
    return {
      ...grupo,
      categorias: lista,
      insumos: lista.reduce((soma, categoria) => soma + categoria.insumos, 0),
    };
  });
}
