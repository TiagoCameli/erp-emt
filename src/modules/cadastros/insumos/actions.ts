"use server";

import { revalidatePath } from "next/cache";

import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  type ColunaImportacao,
  lerEValidarXlsx,
} from "@/lib/importacao";
import { traduzErroExclusao } from "@/modules/cadastros/_shared/exclusao";
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
  categoria: string;
  unidade: string;
}

/** Colunas da planilha de importação de insumos, usadas só dentro deste módulo. */
const colunasImportInsumo: ColunaImportacao<LinhaImportInsumo>[] = [
  { chave: "codigo", rotulo: "Codigo", exemplo: "MAT-001" },
  { chave: "nome", rotulo: "Nome", obrigatoria: true, exemplo: "Brita 1" },
  {
    chave: "categoria",
    rotulo: "Categoria",
    obrigatoria: true,
    exemplo: "Materiais de construcao",
  },
  { chave: "unidade", rotulo: "Unidade", obrigatoria: true, exemplo: "m3" },
];

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
    return { erro: "Não foi possível salvar o insumo. Tente novamente" };
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

  const validado = insumoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("insumos")
    .update(montarRegistro(validado.data))
    .eq("id", id);

  if (error) {
    return { erro: "Não foi possível salvar o insumo. Tente novamente" };
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

  const supabase = await createClient();
  const { error } = await supabase
    .from("insumos")
    .update({ ativo })
    .eq("id", id);

  if (error) {
    return { erro: "Não foi possível alterar o status do insumo. Tente novamente" };
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

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_excluir_cadastro", {
    p_tabela: "insumos",
    p_id: id,
    p_motivo: motivo,
  });

  if (error) {
    const traduzido = traduzErroExclusao(error);
    if (traduzido) return { erro: traduzido };
    return { erro: "Não foi possível excluir o insumo. Tente novamente" };
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
    return {
      erro: erro instanceof Error ? erro.message : "Não foi possível ler o arquivo",
    };
  }

  if (validacao.validas.length === 0) {
    return { erro: "Nenhuma linha válida para importar" };
  }

  const supabase = await createClient();

  const [categorias, unidades] = await Promise.all([
    supabase.from("categorias_insumo").select("id, nome").eq("ativo", true),
    supabase.from("unidades_medida").select("id, sigla").eq("ativo", true),
  ]);

  if (categorias.error || unidades.error) {
    return { erro: "Não foi possível carregar categorias e unidades para casar" };
  }

  const categoriaPorNome = new Map(
    (categorias.data ?? []).map((c) => [c.nome.trim().toLowerCase(), c.id]),
  );
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
    const categoriaNome = String(linha.dados.categoria ?? "")
      .trim()
      .toLowerCase();
    const unidadeSigla = String(linha.dados.unidade ?? "")
      .trim()
      .toLowerCase();

    const categoriaId = categoriaPorNome.get(categoriaNome);
    if (!categoriaId) {
      return {
        erro: `Categoria "${linha.dados.categoria}" (linha ${linha.linha}) não encontrada. Cadastre a categoria antes de importar.`,
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
    return { erro: "Não foi possível importar os insumos. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { importadas: registros.length };
}
