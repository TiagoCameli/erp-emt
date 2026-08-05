"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { erroAcao } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import { lerEValidarXlsx } from "@/lib/importacao";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { traduzErroExclusao } from "@/modules/cadastros/_shared/exclusao";
import {
  COLUNAS_ENCARGO,
  type EncargoImportacao,
} from "@/modules/rh/encargos/importacao";
import {
  encargoSchema,
  type EncargoInput,
} from "@/modules/rh/encargos/schemas";

const RECURSO = "rh.encargos" as const;
const ROTA = "/rh/encargos";
const TABELA = "folha_encargos" as const;

export type ResultadoAcao = { ok: true } | { erro: string };

const motivoSchema = z.string().trim().min(1);

/** Cria ou edita um encargo da folha (nome + alíquota). A presença de `id` decide a operação. */
export async function salvarEncargo(
  dados: EncargoInput,
  id?: string,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, id ? "editar" : "criar");
  } catch {
    return { erro: `Sem permissão para ${id ? "editar" : "criar"} encargos` };
  }

  const validado = encargoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const linha = {
    nome: validado.data.nome,
    percentual: validado.data.percentual,
    ativo: validado.data.ativo,
  };

  const supabase = await createClient();

  if (id) {
    const idValido = idSchema.safeParse(id);
    if (!idValido.success) return { erro: "Encargo inválido" };

    const { error } = await supabase
      .from(TABELA)
      .update(linha)
      .eq("id", idValido.data);

    if (error) {
      if (error.code === "23505") {
        return { erro: "Já existe um encargo com este nome" };
      }
      return erroAcao(
        "rh.encargos.editar",
        error,
        "Não foi possível salvar o encargo. Tente novamente",
      );
    }
  } else {
    const { error } = await supabase.from(TABELA).insert(linha);

    if (error) {
      if (error.code === "23505") {
        return { erro: "Já existe um encargo com este nome" };
      }
      return erroAcao(
        "rh.encargos.criar",
        error,
        "Não foi possível salvar o encargo. Tente novamente",
      );
    }
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Exclusão física: move o encargo para a lixeira via RPC, com motivo. */
export async function removerEncargo(
  id: string,
  motivo: string,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "excluir");
  } catch {
    return { erro: "Sem permissão para excluir encargos" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Encargo inválido" };

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
    if (traduzido) return erroAcao("rh.encargos.excluir", error, traduzido);
    return erroAcao(
      "rh.encargos.excluir",
      error,
      "Não foi possível excluir o encargo. Tente novamente",
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
  const resultado = await lerEValidarXlsx<EncargoImportacao>(
    buffer,
    COLUNAS_ENCARGO,
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
    return { erro: "Sem permissão para importar encargos" };
  }

  let buffer: Buffer;
  try {
    buffer = await lerArquivo(formData);
  } catch (e) {
    return erroAcao("rh.encargos.importar", e, "Nenhum arquivo enviado");
  }

  let resultado;
  try {
    resultado = await lerEValidarXlsx<EncargoImportacao>(
      buffer,
      COLUNAS_ENCARGO,
    );
  } catch (erro) {
    return erroAcao(
      "rh.encargos.importar",
      erro,
      erro instanceof Error ? erro.message : "Não foi possível ler a planilha",
    );
  }

  if (resultado.validas.length === 0) {
    return { erro: "Nenhuma linha válida para importar" };
  }

  const linhas = resultado.validas.map((linha) => ({
    nome: String(linha.dados.nome),
    percentual: linha.dados.percentual ?? 0,
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
      "rh.encargos.importar",
      error,
      "Não foi possível importar os encargos. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { importadas: linhas.length };
}
