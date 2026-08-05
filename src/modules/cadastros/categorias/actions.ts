"use server";

import { revalidatePath } from "next/cache";

import { erroAcao } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import {
  lerEValidarXlsx,
  type ColunaImportacao,
} from "@/lib/importacao";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { traduzErroExclusao } from "@/modules/cadastros/_shared/exclusao";
import {
  SLUGS_GRUPO,
  type SlugGrupo,
} from "@/modules/cadastros/_shared/insumo-grupos";
import {
  categoriaSchema,
  type CategoriaInput,
} from "@/modules/cadastros/categorias/schemas";

const RECURSO = "cadastros.categorias" as const;
const ROTA = "/cadastros/categorias";
const TABELA = "categorias_insumo" as const;

export type ResultadoAcao = { ok: true } | { erro: string };

/** Linha esperada na planilha de importação de categorias. */
interface LinhaImportCategoria {
  nome: string;
  grupo: SlugGrupo;
}

/**
 * Aceita o grupo pelo slug ("material") ou pelo rótulo ("Material", "Mão de
 * obra"). Grupo é fixo: planilha com grupo desconhecido é recusada, nunca cria.
 */
function normalizarGrupo(valor: unknown): SlugGrupo {
  const texto = String(valor)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const porSlug = SLUGS_GRUPO.find((slug) => slug === texto.replace(/ /g, "_"));
  if (porSlug) return porSlug;
  if (texto.startsWith("mao")) return "mao_de_obra";
  if (texto.startsWith("equip")) return "equipamentos";
  if (texto.startsWith("mater")) return "material";
  if (texto.startsWith("outro")) return "outros";
  throw new Error(
    "grupo deve ser um de: material, mao_de_obra, equipamentos, outros",
  );
}

/** Colunas da planilha de categorias (usadas na validação da importação). */
const COLUNAS_IMPORT: ColunaImportacao<LinhaImportCategoria>[] = [
  {
    chave: "nome",
    rotulo: "Nome",
    obrigatoria: true,
    exemplo: "Cimento, agregados e concreto",
    transformar: (valor) => String(valor).trim(),
  },
  {
    chave: "grupo",
    rotulo: "Grupo",
    obrigatoria: true,
    exemplo: "material",
    transformar: normalizarGrupo,
  },
];

/** Cria uma categoria de insumo. */
export async function criar(dados: CategoriaInput): Promise<ResultadoAcao> {
  await exigirPermissao(RECURSO, "criar");

  const validado = categoriaSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from(TABELA).insert({
    nome: validado.data.nome,
    grupo_id: validado.data.grupoId,
    ativo: validado.data.ativo,
  });

  if (error) {
    if (error.code === "23505") {
      return erroAcao(
        "cadastros.categorias.criar",
        error,
        "Já existe uma subcategoria com este nome neste grupo",
      );
    }
    return erroAcao(
      "cadastros.categorias.criar",
      error,
      "Não foi possível salvar a categoria. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Edita uma categoria de insumo. */
export async function editar(
  id: string,
  dados: CategoriaInput,
): Promise<ResultadoAcao> {
  await exigirPermissao(RECURSO, "editar");

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Categoria inválida" };

  const validado = categoriaSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from(TABELA)
    .update({
      nome: validado.data.nome,
      grupo_id: validado.data.grupoId,
      ativo: validado.data.ativo,
    })
    .eq("id", idValido.data);

  if (error) {
    if (error.code === "23505") {
      return erroAcao(
        "cadastros.categorias.editar",
        error,
        "Já existe uma subcategoria com este nome neste grupo",
      );
    }
    return erroAcao(
      "cadastros.categorias.editar",
      error,
      "Não foi possível salvar a categoria. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Ativa ou desativa uma categoria (soft delete). */
export async function alternarAtivo(
  id: string,
  ativo: boolean,
): Promise<ResultadoAcao> {
  await exigirPermissao(RECURSO, "editar");

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Categoria inválida" };

  const supabase = await createClient();
  const { error } = await supabase
    .from(TABELA)
    .update({ ativo })
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "cadastros.categorias.alternarAtivo",
      error,
      "Não foi possível alterar o status. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Exclusão física: move a categoria para a lixeira via RPC. */
export async function excluir(
  id: string,
  motivo: string,
): Promise<ResultadoAcao> {
  await exigirPermissao(RECURSO, "excluir");

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Categoria inválida" };

  const motivoLimpo = motivo.trim();
  if (motivoLimpo.length === 0) {
    return { erro: "Informe o motivo da exclusão" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_excluir_cadastro", {
    p_tabela: TABELA,
    p_id: idValido.data,
    p_motivo: motivoLimpo,
  });

  if (error) {
    const emUso = traduzErroExclusao(error);
    if (emUso) return erroAcao("cadastros.categorias.excluir", error, emUso);
    return erroAcao(
      "cadastros.categorias.excluir",
      error,
      "Não foi possível excluir a categoria. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Lê o arquivo do formData. Lança se não houver arquivo. */
async function lerArquivo(formData: FormData): Promise<ArrayBuffer> {
  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File)) {
    throw new Error("Nenhum arquivo enviado");
  }
  return arquivo.arrayBuffer();
}

/** Valida a planilha de importação de categorias e devolve o resumo da prévia. */
export async function validarImport(formData: FormData): Promise<{
  validas: number;
  invalidas: { linha: number; erros: string[] }[];
  totalLinhas: number;
}> {
  await exigirPermissao(RECURSO, "criar");

  const buffer = await lerArquivo(formData);
  const resultado = await lerEValidarXlsx<LinhaImportCategoria>(
    buffer,
    COLUNAS_IMPORT,
  );

  return {
    validas: resultado.validas.length,
    invalidas: resultado.invalidas.map((linha) => ({
      linha: linha.linha,
      erros: linha.erros,
    })),
    totalLinhas: resultado.totalLinhas,
  };
}

/** Importa as linhas válidas da planilha de categorias em massa. */
export async function importar(
  formData: FormData,
): Promise<{ importadas: number } | { erro: string }> {
  await exigirPermissao(RECURSO, "criar");

  let buffer: ArrayBuffer;
  try {
    buffer = await lerArquivo(formData);
  } catch (e) {
    return erroAcao("cadastros.categorias.importar", e, "Nenhum arquivo enviado");
  }

  const resultado = await lerEValidarXlsx<LinhaImportCategoria>(
    buffer,
    COLUNAS_IMPORT,
  );

  if (resultado.validas.length === 0) {
    return { erro: "Nenhuma linha válida para importar" };
  }

  const supabase = await createClient();

  // Grupo é fixo: a planilha traz o slug e aqui ele vira id. Slug desconhecido
  // já foi recusado na validação da coluna, então aqui só resolve.
  const { data: grupos } = await supabase
    .from("insumo_grupos")
    .select("id, slug");
  const idPorSlug = new Map((grupos ?? []).map((g) => [g.slug, g.id]));

  const linhas = resultado.validas.flatMap((linha) => {
    const grupoId = idPorSlug.get(linha.dados.grupo as string);
    if (!grupoId) return [];
    return [
      {
        nome: linha.dados.nome as string,
        grupo_id: grupoId,
        ativo: true,
      },
    ];
  });

  if (linhas.length === 0) {
    return { erro: "Nenhuma linha válida para importar" };
  }

  const { error } = await supabase.from(TABELA).insert(linhas);

  if (error) {
    if (error.code === "23505") {
      return erroAcao(
        "cadastros.categorias.importar",
        error,
        "A planilha tem subcategorias repetidas ou já cadastradas neste grupo",
      );
    }
    return erroAcao(
      "cadastros.categorias.importar",
      error,
      "Não foi possível importar as categorias. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { importadas: linhas.length };
}
