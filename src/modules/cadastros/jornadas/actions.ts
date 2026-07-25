"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { erroAcao } from "@/lib/erros";
import { lerEValidarXlsx } from "@/lib/importacao";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { traduzErroExclusao } from "@/modules/cadastros/_shared/exclusao";
import {
  COLUNAS_JORNADA,
  type JornadaImportacao,
} from "@/modules/cadastros/jornadas/importacao";
import { jornadaSchema, type JornadaInput } from "@/modules/cadastros/jornadas/schemas";

const RECURSO = "cadastros.jornadas" as const;
const ROTA = "/cadastros/jornadas";
const TABELA = "jornadas" as const;

export type ResultadoAcao = { ok: true } | { erro: string };

const uuidSchema = z.uuid();
const motivoSchema = z.string().trim().min(1);

/** Cria ou edita uma jornada (horas por dia da semana). A presença de `id` decide a operação. */
export async function salvarJornada(
  dados: JornadaInput,
  id?: string,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, id ? "editar" : "criar");
  } catch {
    return { erro: `Sem permissão para ${id ? "editar" : "criar"} jornadas` };
  }

  const validado = jornadaSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const linha = {
    nome: validado.data.nome,
    horas_segunda: validado.data.horasSegunda,
    horas_terca: validado.data.horasTerca,
    horas_quarta: validado.data.horasQuarta,
    horas_quinta: validado.data.horasQuinta,
    horas_sexta: validado.data.horasSexta,
    horas_sabado: validado.data.horasSabado,
    horas_domingo: validado.data.horasDomingo,
    ativo: validado.data.ativo,
  };

  const supabase = await createClient();

  if (id) {
    const idValido = uuidSchema.safeParse(id);
    if (!idValido.success) return { erro: "Jornada inválida" };

    const { error } = await supabase
      .from(TABELA)
      .update(linha)
      .eq("id", idValido.data);

    if (error) {
      if (error.code === "23505") {
        return { erro: "Já existe uma jornada com este nome" };
      }
      return erroAcao(
        "cadastros.jornadas.editar",
        error,
        "Não foi possível salvar a jornada. Tente novamente",
      );
    }
  } else {
    const { error } = await supabase.from(TABELA).insert(linha);

    if (error) {
      if (error.code === "23505") {
        return { erro: "Já existe uma jornada com este nome" };
      }
      return erroAcao(
        "cadastros.jornadas.criar",
        error,
        "Não foi possível salvar a jornada. Tente novamente",
      );
    }
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Exclusão física: move a jornada para a lixeira via RPC, com motivo. */
export async function removerJornada(
  id: string,
  motivo: string,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "excluir");
  } catch {
    return { erro: "Sem permissão para excluir jornadas" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Jornada inválida" };

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
    if (traduzido) return erroAcao("cadastros.jornadas.excluir", error, traduzido);
    return erroAcao(
      "cadastros.jornadas.excluir",
      error,
      "Não foi possível excluir a jornada. Tente novamente",
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
  const resultado = await lerEValidarXlsx<JornadaImportacao>(
    buffer,
    COLUNAS_JORNADA,
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
    return { erro: "Sem permissão para importar jornadas" };
  }

  let buffer: Buffer;
  try {
    buffer = await lerArquivo(formData);
  } catch (e) {
    return erroAcao("cadastros.jornadas.importar", e, "Nenhum arquivo enviado");
  }

  let resultado;
  try {
    resultado = await lerEValidarXlsx<JornadaImportacao>(buffer, COLUNAS_JORNADA);
  } catch (erro) {
    return erroAcao(
      "cadastros.jornadas.importar",
      erro,
      erro instanceof Error ? erro.message : "Não foi possível ler a planilha",
    );
  }

  if (resultado.validas.length === 0) {
    return { erro: "Nenhuma linha válida para importar" };
  }

  const linhas = resultado.validas.map((linha) => ({
    nome: String(linha.dados.nome),
    horas_segunda: linha.dados.horasSegunda ?? 0,
    horas_terca: linha.dados.horasTerca ?? 0,
    horas_quarta: linha.dados.horasQuarta ?? 0,
    horas_quinta: linha.dados.horasQuinta ?? 0,
    horas_sexta: linha.dados.horasSexta ?? 0,
    horas_sabado: linha.dados.horasSabado ?? 0,
    horas_domingo: linha.dados.horasDomingo ?? 0,
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
      "cadastros.jornadas.importar",
      error,
      "Não foi possível importar as jornadas. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { importadas: linhas.length };
}
