"use server";

import { revalidatePath } from "next/cache";

import { chaveNome } from "@/lib/chave-nome";
import { erroAcao } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  type ColunaImportacao,
  lerEValidarXlsx,
} from "@/lib/importacao";
import { traduzErroExclusao } from "@/modules/cadastros/_shared/exclusao";
import {
  SLUGS_GRUPO,
  type SlugGrupo,
} from "@/modules/cadastros/_shared/insumo-grupos";
import {
  insumoSchema,
  type InsumoInput,
} from "@/modules/cadastros/insumos/schemas";

const RECURSO = "cadastros.insumos" as const;
const ROTA = "/cadastros/insumos";

export type ResultadoAcao = { ok: true } | { erro: string };

/** Forma de cada linha lida da planilha de importação. */
interface LinhaImportInsumo {
  codigo: string | null;
  nome: string;
  grupo: string;
  categoria: string;
  unidade: string;
}

/** Colunas da planilha de importação de insumos, usadas só dentro deste módulo. */
const colunasImportInsumo: ColunaImportacao<LinhaImportInsumo>[] = [
  { chave: "codigo", rotulo: "Código", exemplo: "MAT-001" },
  {
    chave: "nome",
    rotulo: "Nome",
    obrigatoria: true,
    exemplo: "Brita 1",
    validar: (valor, linha) => {
      const nome = String(valor ?? "").trim();
      const codigo = String(linha.codigo ?? "").trim();
      if (/^\d+$/.test(nome) || (codigo !== "" && nome === codigo)) {
        return "Nome do insumo não pode ser igual ao código nem ser só números";
      }
      return null;
    },
  },
  {
    chave: "grupo",
    rotulo: "Grupo",
    obrigatoria: true,
    exemplo: "material",
  },
  {
    chave: "categoria",
    rotulo: "Categoria",
    obrigatoria: true,
    exemplo: "Cimento, agregados e concreto",
  },
  { chave: "unidade", rotulo: "Unidade", obrigatoria: true, exemplo: "m3" },
];

/**
 * Aceita o grupo pelo slug ou pelo rótulo, sem acento. Grupo é fixo: valor
 * desconhecido estoura e a importação recusa a linha inteira, em vez de criar
 * grupo novo por erro de digitação.
 */
function normalizarGrupoImport(valor: unknown): SlugGrupo {
  const texto = String(valor ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ /g, "_");
  const porSlug = SLUGS_GRUPO.find((slug) => slug === texto);
  if (porSlug) return porSlug;
  if (texto.startsWith("mao")) return "mao_de_obra";
  if (texto.startsWith("equip")) return "equipamentos";
  if (texto.startsWith("mater")) return "material";
  if (texto.startsWith("outro")) return "outros";
  throw new Error("grupo invalido");
}

/** Converte o payload do form no insert da tabela insumos. */
function montarRegistro(dados: InsumoInput) {
  const codigo = dados.codigo?.trim();
  const descricao = dados.descricao?.trim();
  return {
    codigo: codigo ? codigo : null,
    nome: dados.nome.trim(),
    categoria_id: dados.categoriaId,
    unidade_id: dados.unidadeId,
    descricao: descricao ? descricao : null,
    ativo: dados.ativo,
  };
}

/** Cria um insumo. */
export async function criar(dados: InsumoInput): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "criar");
  } catch {
    return { erro: "Sem permissão para criar insumos" };
  }

  const validado = insumoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("insumos")
    .insert(montarRegistro(validado.data));

  if (error) {
    return erroAcao(
      "cadastros.insumos.criar",
      error,
      "Não foi possível salvar o insumo. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Edita um insumo existente. */
export async function editar(
  id: string,
  dados: InsumoInput,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para editar insumos" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Insumo inválido" };

  const validado = insumoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("insumos")
    .update(montarRegistro(validado.data))
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "cadastros.insumos.editar",
      error,
      "Não foi possível salvar o insumo. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Ativa ou desativa um insumo (soft delete via update). */
export async function alternarAtivo(
  id: string,
  ativo: boolean,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para editar insumos" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Insumo inválido" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("insumos")
    .update({ ativo })
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "cadastros.insumos.alternarAtivo",
      error,
      "Não foi possível alterar o status do insumo. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Exclusão física: move o insumo para a lixeira via RPC. */
export async function excluir(
  id: string,
  motivo: string,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "excluir");
  } catch {
    return { erro: "Sem permissão para excluir insumos" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Insumo inválido" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_excluir_cadastro", {
    p_tabela: "insumos",
    p_id: idValido.data,
    p_motivo: motivo,
  });

  if (error) {
    const traduzido = traduzErroExclusao(error);
    if (traduzido) return erroAcao("cadastros.insumos.excluir", error, traduzido);
    return erroAcao(
      "cadastros.insumos.excluir",
      error,
      "Não foi possível excluir o insumo. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Lê o arquivo do formData e devolve o resumo de validação para a prévia. */
export async function validarImport(formData: FormData): Promise<{
  validas: number;
  invalidas: { linha: number; erros: string[] }[];
  totalLinhas: number;
}> {
  try {
    await exigirPermissao(RECURSO, "criar");
  } catch {
    throw new Error("Sem permissão para importar insumos");
  }

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File)) {
    throw new Error("Nenhum arquivo enviado");
  }

  const buffer = Buffer.from(await arquivo.arrayBuffer());
  const resultado = await lerEValidarXlsx(buffer, colunasImportInsumo);

  return {
    validas: resultado.validas.length,
    invalidas: resultado.invalidas.map((linha) => ({
      linha: linha.linha,
      erros: linha.erros,
    })),
    totalLinhas: resultado.totalLinhas,
  };
}

/**
 * Importa as linhas válidas do arquivo. Resolve categoria pelo nome e
 * unidade pela sigla, depois insere em massa (RLS cobre a permissão criar).
 */
export async function importar(
  formData: FormData,
): Promise<{ importadas: number } | { erro: string }> {
  try {
    await exigirPermissao(RECURSO, "criar");
  } catch {
    return { erro: "Sem permissão para importar insumos" };
  }

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File)) {
    return { erro: "Nenhum arquivo enviado" };
  }

  let validacao;
  try {
    const buffer = Buffer.from(await arquivo.arrayBuffer());
    validacao = await lerEValidarXlsx(buffer, colunasImportInsumo);
  } catch (erro) {
    return erroAcao(
      "cadastros.insumos.importar",
      erro,
      erro instanceof Error ? erro.message : "Não foi possível ler o arquivo",
    );
  }

  if (validacao.validas.length === 0) {
    return { erro: "Nenhuma linha válida para importar" };
  }

  const supabase = await createClient();

  const [categorias, unidades] = await Promise.all([
    supabase
      .from("categorias_insumo")
      .select("id, nome, insumo_grupos!inner(slug, nome)")
      .eq("ativo", true),
    supabase.from("unidades_medida").select("id, sigla").eq("ativo", true),
  ]);

  if (categorias.error || unidades.error) {
    return erroAcao(
      "cadastros.insumos.importar",
      categorias.error ?? unidades.error,
      "Não foi possível carregar categorias e unidades para casar",
    );
  }

  // A subcategoria é única por (nome, grupo), então a chave de casamento é o par
  // grupo + categoria. "A classificar" existe nos 4 grupos: sem o grupo na
  // planilha, seria impossível saber para qual delas o insumo vai.
  const categoriaPorGrupoNome = new Map<string, string>();
  for (const c of categorias.data ?? []) {
    const slug = c.insumo_grupos?.slug ?? "";
    // chaveNome, não toLowerCase: as subcategorias têm acento ("Peças e
    // componentes", "Óleos e lubrificantes") e a planilha vinda da obra
    // raramente tem. Sem dobrar acento, a linha era recusada.
    categoriaPorGrupoNome.set(`${slug}|${chaveNome(c.nome)}`, c.id);
  }
  const unidadePorSigla = new Map(
    (unidades.data ?? []).map((u) => [u.sigla.trim().toLowerCase(), u.id]),
  );

  const registros: {
    codigo: string | null;
    nome: string;
    categoria_id: string;
    unidade_id: string;
    ativo: boolean;
  }[] = [];

  for (const linha of validacao.validas) {
    const nome = String(linha.dados.nome ?? "").trim();
    const categoriaNome = chaveNome(String(linha.dados.categoria ?? ""));
    const unidadeSigla = String(linha.dados.unidade ?? "")
      .trim()
      .toLowerCase();

    let grupoSlug: SlugGrupo;
    try {
      grupoSlug = normalizarGrupoImport(linha.dados.grupo);
    } catch {
      return {
        erro: `Grupo "${linha.dados.grupo}" (linha ${linha.linha}) não existe. Use material, mao_de_obra, equipamentos ou outros.`,
      };
    }

    const categoriaId = categoriaPorGrupoNome.get(
      `${grupoSlug}|${categoriaNome}`,
    );
    if (!categoriaId) {
      // Criar subcategoria na importação só com confirmação explícita: sem isso,
      // um erro de digitação viraria subcategoria nova e ninguém veria.
      return {
        erro: `A subcategoria "${linha.dados.categoria}" não existe no grupo ${grupoSlug} (linha ${linha.linha}). Cadastre a subcategoria em Cadastros > Categorias antes de importar.`,
      };
    }

    const unidadeId = unidadePorSigla.get(unidadeSigla);
    if (!unidadeId) {
      return {
        erro: `Unidade "${linha.dados.unidade}" (linha ${linha.linha}) não encontrada. Cadastre a unidade antes de importar.`,
      };
    }

    const codigoBruto = linha.dados.codigo;
    const codigo =
      typeof codigoBruto === "string" && codigoBruto.trim()
        ? codigoBruto.trim()
        : null;

    registros.push({
      codigo,
      nome,
      categoria_id: categoriaId,
      unidade_id: unidadeId,
      ativo: true,
    });
  }

  const { error } = await supabase.from("insumos").insert(registros);
  if (error) {
    return erroAcao(
      "cadastros.insumos.importar",
      error,
      "Não foi possível importar os insumos. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { importadas: registros.length };
}

/**
 * Reclassificação em lote: move os insumos selecionados para outra
 * subcategoria. É a ferramenta que faz os 522 insumos em "A classificar"
 * virarem trabalho de uma tarde em vez de 522 cliques.
 *
 * Um UPDATE só com `in (ids)`; a RLS de insumos cobre a permissão de editar.
 */
export async function reclassificarEmLote(
  ids: string[],
  categoriaId: string,
): Promise<{ ok: true; alterados: number } | { erro: string }> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para editar insumos" };
  }

  const idsValidos = ids.filter((id) => idSchema.safeParse(id).success);
  if (idsValidos.length === 0) return { erro: "Selecione ao menos um insumo" };

  const categoriaValida = idSchema.safeParse(categoriaId);
  if (!categoriaValida.success) return { erro: "Escolha a subcategoria" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("insumos")
    .update({ categoria_id: categoriaValida.data })
    .in("id", idsValidos)
    .select("id");

  if (error) {
    return erroAcao(
      "cadastros.insumos.reclassificarEmLote",
      error,
      "Não foi possível reclassificar os insumos. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true, alterados: data?.length ?? 0 };
}
