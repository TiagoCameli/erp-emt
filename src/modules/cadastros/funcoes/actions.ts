"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { erroAcao } from "@/lib/erros";
import { lerEValidarXlsx } from "@/lib/importacao";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { traduzErroExclusao } from "@/modules/cadastros/_shared/exclusao";
import {
  COLUNAS_FUNCAO,
  type FuncaoImportacao,
} from "@/modules/cadastros/funcoes/importacao";
import { funcaoSchema, type FuncaoInput } from "@/modules/cadastros/funcoes/schemas";

const RECURSO = "cadastros.funcoes" as const;
const ROTA = "/cadastros/funcoes";
const TABELA = "funcoes" as const;

export type ResultadoAcao = { ok: true } | { erro: string };

const uuidSchema = z.uuid();
const motivoSchema = z.string().trim().min(1);

/** Cria ou edita uma função (cargo). A presença de `id` decide a operação. */
export async function salvarFuncao(
  dados: FuncaoInput,
  id?: string,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, id ? "editar" : "criar");
  } catch {
    return { erro: `Sem permissão para ${id ? "editar" : "criar"} funções` };
  }

  const validado = funcaoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const linha = {
    nome: validado.data.nome,
    salario_base: validado.data.salarioBase,
    cbo: validado.data.cbo,
    ativo: validado.data.ativo,
  };

  const supabase = await createClient();

  if (id) {
    const idValido = uuidSchema.safeParse(id);
    if (!idValido.success) return { erro: "Função inválida" };

    const { error } = await supabase
      .from(TABELA)
      .update(linha)
      .eq("id", idValido.data);

    if (error) {
      if (error.code === "23505") {
        return { erro: "Já existe uma função com este nome" };
      }
      return erroAcao(
        "cadastros.funcoes.editar",
        error,
        "Não foi possível salvar a função. Tente novamente",
      );
    }
  } else {
    const { error } = await supabase.from(TABELA).insert(linha);

    if (error) {
      if (error.code === "23505") {
        return { erro: "Já existe uma função com este nome" };
      }
      return erroAcao(
        "cadastros.funcoes.criar",
        error,
        "Não foi possível salvar a função. Tente novamente",
      );
    }
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Exclusão física: move a função para a lixeira via RPC, com motivo. */
export async function removerFuncao(
  id: string,
  motivo: string,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "excluir");
  } catch {
    return { erro: "Sem permissão para excluir funções" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Função inválida" };

  const motivoValido = motivoSchema.safeParse(motivo);
  if (!motivoValido.success) return { erro: "Informe o motivo da exclusão" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_excluir_cadastro", {
    p_tabela: TABELA,
    p_id: idValido.data,
    p_motivo: motivoValido.data,
  });

  if (error) {
    const traduzido = traduzErroExclusao(error);
    if (traduzido) return erroAcao("cadastros.funcoes.excluir", error, traduzido);
    return erroAcao(
      "cadastros.funcoes.excluir",
      error,
      "Não foi possível excluir a função. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Lê o arquivo enviado do formData (campo "arquivo") como Buffer. */
async function lerArquivo(formData: FormData): Promise<Buffer> {
  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File)) {
    throw new Error("Nenhum arquivo enviado");
  }
  const bytes = await arquivo.arrayBuffer();
  return Buffer.from(bytes);
}

export interface ResumoImportacao {
  validas: number;
  invalidas: { linha: number; erros: string[] }[];
  totalLinhas: number;
}

/** Lê o arquivo enviado e devolve o resumo da validação para a prévia. */
export async function validarImport(
  formData: FormData,
): Promise<ResumoImportacao> {
  await exigirPermissao(RECURSO, "criar");

  const buffer = await lerArquivo(formData);
  const resultado = await lerEValidarXlsx<FuncaoImportacao>(
    buffer,
    COLUNAS_FUNCAO,
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

/** Importa em massa as linhas válidas do arquivo enviado. RLS cobre a permissão. */
export async function importar(
  formData: FormData,
): Promise<{ importadas: number } | { erro: string }> {
  try {
    await exigirPermissao(RECURSO, "criar");
  } catch {
    return { erro: "Sem permissão para importar funções" };
  }

  let buffer: Buffer;
  try {
    buffer = await lerArquivo(formData);
  } catch (e) {
    return erroAcao("cadastros.funcoes.importar", e, "Nenhum arquivo enviado");
  }

  let resultado;
  try {
    resultado = await lerEValidarXlsx<FuncaoImportacao>(buffer, COLUNAS_FUNCAO);
  } catch (erro) {
    return erroAcao(
      "cadastros.funcoes.importar",
      erro,
      erro instanceof Error ? erro.message : "Não foi possível ler a planilha",
    );
  }

  if (resultado.validas.length === 0) {
    return { erro: "Nenhuma linha válida para importar" };
  }

  const linhas = resultado.validas.map((linha) => ({
    nome: String(linha.dados.nome),
    salario_base: linha.dados.salarioBase ?? null,
    cbo: linha.dados.cbo ?? null,
    ativo: linha.dados.ativo ?? true,
  }));

  const supabase = await createClient();
  const { error } = await supabase.from(TABELA).insert(linhas);

  if (error) {
    if (error.code === "23505") {
      return {
        erro: "Há nomes repetidos no arquivo ou já cadastrados. Corrija e tente de novo",
      };
    }
    return erroAcao(
      "cadastros.funcoes.importar",
      error,
      "Não foi possível importar as funções. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { importadas: linhas.length };
}
