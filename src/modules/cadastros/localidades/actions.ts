"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { erroAcao } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import {
  type ColunaImportacao,
  lerEValidarXlsx,
} from "@/lib/importacao";
import { traduzErroExclusao } from "@/modules/cadastros/_shared/exclusao";
import {
  localidadeSchema,
  type LocalidadeInput,
} from "@/modules/cadastros/localidades/schemas";

const RECURSO = "cadastros.localidades" as const;
const ROTA = "/cadastros/localidades";
const TABELA = "localidades" as const;
const ERRO_NOME_REPETIDO = "Já existe uma localidade com este nome";
/** Rótulo da coluna da pedreira no modelo e na leitura (tem de ser o mesmo). */
const COLUNA_PEDREIRA = "Pedreira (fornecedor)";

export type ResultadoAcao = { ok: true } | { erro: string };

const motivoSchema = z.string().trim().min(1);

/**
 * Endereço vazio vira null: a coluna é opcional e texto vazio não é endereço. A
 * pedreira (fornecedor) vazia também: a localidade não é pedreira.
 */
function paraLinha(dados: LocalidadeInput) {
  return {
    nome: dados.nome,
    endereco: dados.endereco === "" ? null : dados.endereco,
    fornecedor_id: dados.fornecedorId ? dados.fornecedorId : null,
    ativo: dados.ativo,
  };
}

/** Cria uma localidade. */
export async function criar(dados: LocalidadeInput): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "criar");
  } catch {
    return { erro: "Sem permissão para criar localidades" };
  }

  const validado = localidadeSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from(TABELA).insert(paraLinha(validado.data));

  if (error) {
    if (error.code === "23505") return { erro: ERRO_NOME_REPETIDO };
    return erroAcao(
      "cadastros.localidades.criar",
      error,
      "Não foi possível salvar a localidade. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Edita uma localidade existente. */
export async function editar(
  id: string,
  dados: LocalidadeInput,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para editar localidades" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Localidade inválida" };

  const validado = localidadeSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from(TABELA)
    .update(paraLinha(validado.data))
    .eq("id", idValido.data);

  if (error) {
    if (error.code === "23505") return { erro: ERRO_NOME_REPETIDO };
    return erroAcao(
      "cadastros.localidades.editar",
      error,
      "Não foi possível salvar a localidade. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Ativa ou desativa uma localidade. */
export async function alternarAtivo(
  id: string,
  ativo: boolean,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para editar localidades" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Localidade inválida" };

  const supabase = await createClient();
  const { error } = await supabase
    .from(TABELA)
    .update({ ativo })
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "cadastros.localidades.alternarAtivo",
      error,
      "Não foi possível alterar o status. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Exclusão: move a localidade para a lixeira via RPC, com motivo. */
export async function excluir(
  id: string,
  motivo: string,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "excluir");
  } catch {
    return { erro: "Sem permissão para excluir localidades" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Localidade inválida" };

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
    if (traduzido) return erroAcao("cadastros.localidades.excluir", error, traduzido);
    return erroAcao(
      "cadastros.localidades.excluir",
      error,
      "Não foi possível excluir a localidade. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Linha tipada da planilha de importação de localidades. */
interface LinhaImportLocalidade {
  nome: string;
  endereco: string;
  pedreira: string;
}

/**
 * Colunas esperadas na planilha de importação de localidades. A pedreira casa pelo
 * nome do fornecedor ativo (razão social ou nome fantasia, sem diferenciar maiúscula);
 * nome que não casa é erro da linha, para o vínculo não sumir calado.
 */
function colunasImport(fornecedores: Map<string, string>): ColunaImportacao<LinhaImportLocalidade>[] {
  return [
    { chave: "nome", rotulo: "Nome", obrigatoria: true, exemplo: "Pedreira Vale do Abunã" },
    { chave: "endereco", rotulo: "Endereço", obrigatoria: false, exemplo: "BR-364, km 120" },
    {
      chave: "pedreira",
      rotulo: COLUNA_PEDREIRA,
      obrigatoria: false,
      exemplo: "",
      validar: (valor) => {
        const nome = String(valor ?? "").trim();
        if (!nome) return null;
        return fornecedores.has(nome.toLowerCase()) ? null : `Pedreira "${nome}" não encontrada entre os fornecedores ativos`;
      },
    },
  ];
}

/** Índice nome minúsculo -> id, pela razão social e pelo nome fantasia. */
async function indiceDeFornecedores(): Promise<Map<string, string>> {
  const supabase = await createClient();
  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("fornecedores")
      .select("id, razao_social, nome_fantasia")
      .eq("ativo", true)
      .order("razao_social")
      .order("id")
      .range(de, ate),
  );
  if (erro) throw new Error("Não foi possível carregar os fornecedores");
  const mapa = new Map<string, string>();
  for (const f of linhas) {
    for (const nome of [f.razao_social, f.nome_fantasia]) {
      const chave = (nome ?? "").trim().toLowerCase();
      if (chave && !mapa.has(chave)) mapa.set(chave, f.id);
    }
  }
  return mapa;
}

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
  const fornecedores = await indiceDeFornecedores();
  const resultado = await lerEValidarXlsx<LinhaImportLocalidade>(
    buffer,
    colunasImport(fornecedores),
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
    return { erro: "Sem permissão para importar localidades" };
  }

  let buffer: Buffer;
  try {
    buffer = await lerArquivo(formData);
  } catch (e) {
    return erroAcao("cadastros.localidades.importar", e, "Nenhum arquivo enviado");
  }

  let resultado;
  let fornecedores: Map<string, string>;
  try {
    fornecedores = await indiceDeFornecedores();
    resultado = await lerEValidarXlsx<LinhaImportLocalidade>(
      buffer,
      colunasImport(fornecedores),
    );
  } catch (erro) {
    return erroAcao(
      "cadastros.localidades.importar",
      erro,
      erro instanceof Error
        ? erro.message
        : "Não foi possível ler a planilha",
    );
  }

  if (resultado.validas.length === 0) {
    return { erro: "Nenhuma linha válida para importar" };
  }

  const linhas = resultado.validas.map((linha) => {
    const endereco = String(linha.dados.endereco ?? "").trim();
    const pedreira = String(linha.dados.pedreira ?? "").trim().toLowerCase();
    return {
      nome: String(linha.dados.nome).trim(),
      endereco: endereco === "" ? null : endereco,
      fornecedor_id: pedreira ? (fornecedores.get(pedreira) ?? null) : null,
    };
  });

  const supabase = await createClient();
  const { error } = await supabase.from(TABELA).insert(linhas);

  if (error) {
    if (error.code === "23505") {
      return {
        erro: "Há nomes repetidos no arquivo ou já cadastrados. Corrija e tente de novo",
      };
    }
    return erroAcao(
      "cadastros.localidades.importar",
      error,
      "Não foi possível importar as localidades. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { importadas: linhas.length };
}
