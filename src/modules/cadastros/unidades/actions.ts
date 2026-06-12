"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  type ColunaImportacao,
  lerEValidarXlsx,
} from "@/lib/importacao";
import { traduzErroExclusao } from "@/modules/cadastros/_shared/exclusao";
import {
  TIPOS_UNIDADE,
  type TipoUnidade,
  unidadeSchema,
  type UnidadeInput,
} from "@/modules/cadastros/unidades/schemas";

const RECURSO = "cadastros.unidades" as const;
const ROTA = "/cadastros/unidades";
const TABELA = "unidades_medida" as const;

export type ResultadoAcao = { ok: true } | { erro: string };

const uuidSchema = z.uuid();
const motivoSchema = z.string().trim().min(1);

/** Cria uma unidade de medida. */
export async function criar(dados: UnidadeInput): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "criar");
  } catch {
    return { erro: "Sem permissão para criar unidades de medida" };
  }

  const validado = unidadeSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from(TABELA).insert({
    sigla: validado.data.sigla,
    nome: validado.data.nome,
    tipo: validado.data.tipo,
    ativo: validado.data.ativo,
  });

  if (error) {
    if (error.code === "23505") {
      return { erro: "Já existe uma unidade com esta sigla" };
    }
    return { erro: "Não foi possível salvar a unidade. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Edita uma unidade de medida existente. */
export async function editar(
  id: string,
  dados: UnidadeInput,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para editar unidades de medida" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Unidade inválida" };

  const validado = unidadeSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from(TABELA)
    .update({
      sigla: validado.data.sigla,
      nome: validado.data.nome,
      tipo: validado.data.tipo,
      ativo: validado.data.ativo,
    })
    .eq("id", idValido.data);

  if (error) {
    if (error.code === "23505") {
      return { erro: "Já existe uma unidade com esta sigla" };
    }
    return { erro: "Não foi possível salvar a unidade. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Ativa ou desativa uma unidade de medida (soft delete via update). */
export async function alternarAtivo(
  id: string,
  ativo: boolean,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para editar unidades de medida" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Unidade inválida" };

  const supabase = await createClient();
  const { error } = await supabase
    .from(TABELA)
    .update({ ativo })
    .eq("id", idValido.data);

  if (error) {
    return { erro: "Não foi possível alterar o status. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Exclusão física: move a unidade para a lixeira via RPC, com motivo. */
export async function excluir(
  id: string,
  motivo: string,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "excluir");
  } catch {
    return { erro: "Sem permissão para excluir unidades de medida" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Unidade inválida" };

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
    if (traduzido) return { erro: traduzido };
    return { erro: "Não foi possível excluir a unidade. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Linha tipada da planilha de importação de unidades. */
interface LinhaImportUnidade {
  sigla: string;
  nome: string;
  tipo: TipoUnidade;
}

const TIPOS_VALIDOS = TIPOS_UNIDADE.join(", ");

/** Colunas esperadas na planilha de importação de unidades de medida. */
const COLUNAS_IMPORT: ColunaImportacao<LinhaImportUnidade>[] = [
  { chave: "sigla", rotulo: "Sigla", obrigatoria: true, exemplo: "t" },
  { chave: "nome", rotulo: "Nome", obrigatoria: true, exemplo: "Tonelada" },
  {
    chave: "tipo",
    rotulo: "Tipo",
    obrigatoria: true,
    exemplo: "massa",
    transformar: (valor) => String(valor).trim().toLowerCase(),
    validar: (valor) =>
      TIPOS_UNIDADE.includes(valor as TipoUnidade)
        ? null
        : `Tipo inválido. Use um destes: ${TIPOS_VALIDOS}`,
  },
];

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
  const resultado = await lerEValidarXlsx<LinhaImportUnidade>(
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

/** Importa em massa as linhas válidas do arquivo enviado. RLS cobre a permissão. */
export async function importar(
  formData: FormData,
): Promise<{ importadas: number } | { erro: string }> {
  try {
    await exigirPermissao(RECURSO, "criar");
  } catch {
    return { erro: "Sem permissão para importar unidades de medida" };
  }

  let buffer: Buffer;
  try {
    buffer = await lerArquivo(formData);
  } catch {
    return { erro: "Nenhum arquivo enviado" };
  }

  let resultado;
  try {
    resultado = await lerEValidarXlsx<LinhaImportUnidade>(
      buffer,
      COLUNAS_IMPORT,
    );
  } catch (erro) {
    return {
      erro:
        erro instanceof Error
          ? erro.message
          : "Não foi possível ler a planilha",
    };
  }

  if (resultado.validas.length === 0) {
    return { erro: "Nenhuma linha válida para importar" };
  }

  const linhas = resultado.validas.map((linha) => ({
    sigla: String(linha.dados.sigla),
    nome: String(linha.dados.nome),
    tipo: linha.dados.tipo as TipoUnidade,
  }));

  const supabase = await createClient();
  const { error } = await supabase.from(TABELA).insert(linhas);

  if (error) {
    if (error.code === "23505") {
      return {
        erro: "Há siglas repetidas no arquivo ou já cadastradas. Corrija e tente de novo",
      };
    }
    return { erro: "Não foi possível importar as unidades. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { importadas: linhas.length };
}
