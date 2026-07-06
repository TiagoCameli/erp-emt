"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { erroAcao } from "@/lib/erros";
import {
  lerEValidarXlsx,
  type ColunaImportacao,
} from "@/lib/importacao";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { traduzErroExclusao } from "@/modules/cadastros/_shared/exclusao";
import {
  categoriaSchema,
  ROTULO_TIPO_CATEGORIA,
  TIPOS_CATEGORIA,
  type CategoriaInput,
  type TipoCategoria,
} from "@/modules/cadastros/categorias/schemas";

const RECURSO = "cadastros.categorias" as const;
const ROTA = "/cadastros/categorias";
const TABELA = "categorias_insumo" as const;

export type ResultadoAcao = { ok: true } | { erro: string };

const uuidSchema = z.uuid();

/** Linha esperada na planilha de importação de categorias. */
interface LinhaImportCategoria {
  nome: string;
  tipo: TipoCategoria;
}

/** Aceita o tipo pelo valor canônico ou pelo rótulo em pt-BR. */
function normalizarTipo(valor: unknown): TipoCategoria {
  const texto = String(valor).trim().toLowerCase();
  const porValor = TIPOS_CATEGORIA.find((tipo) => tipo === texto);
  if (porValor) return porValor;
  const porRotulo = TIPOS_CATEGORIA.find(
    (tipo) => ROTULO_TIPO_CATEGORIA[tipo].toLowerCase() === texto,
  );
  if (porRotulo) return porRotulo;
  throw new Error(
    `tipo deve ser um de ${TIPOS_CATEGORIA.join(", ")}`,
  );
}

/** Colunas da planilha de categorias (usadas na validação da importação). */
const COLUNAS_IMPORT: ColunaImportacao<LinhaImportCategoria>[] = [
  {
    chave: "nome",
    rotulo: "Nome",
    obrigatoria: true,
    exemplo: "Materiais de construcao",
    transformar: (valor) => String(valor).trim(),
  },
  {
    chave: "tipo",
    rotulo: "Tipo",
    obrigatoria: true,
    exemplo: "material",
    transformar: normalizarTipo,
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
    tipo: validado.data.tipo,
    ativo: validado.data.ativo,
  });

  if (error) {
    if (error.code === "23505") {
      return erroAcao(
        "cadastros.categorias.criar",
        error,
        "Já existe uma categoria com este nome e tipo",
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

  const idValido = uuidSchema.safeParse(id);
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
      tipo: validado.data.tipo,
      ativo: validado.data.ativo,
    })
    .eq("id", idValido.data);

  if (error) {
    if (error.code === "23505") {
      return erroAcao(
        "cadastros.categorias.editar",
        error,
        "Já existe uma categoria com este nome e tipo",
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

  const idValido = uuidSchema.safeParse(id);
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

  const idValido = uuidSchema.safeParse(id);
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

  const linhas = resultado.validas.map((linha) => ({
    nome: linha.dados.nome as string,
    tipo: linha.dados.tipo as TipoCategoria,
    ativo: true,
  }));

  const supabase = await createClient();
  const { error } = await supabase.from(TABELA).insert(linhas);

  if (error) {
    if (error.code === "23505") {
      return erroAcao(
        "cadastros.categorias.importar",
        error,
        "A planilha tem categorias repetidas ou já cadastradas (nome e tipo)",
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
