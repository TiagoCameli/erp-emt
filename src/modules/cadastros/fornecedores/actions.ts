"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { erroAcao } from "@/lib/erros";
import { lerEValidarXlsx } from "@/lib/importacao";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { traduzErroExclusao } from "@/modules/cadastros/_shared/exclusao";
import {
  COLUNAS_FORNECEDOR,
  type FornecedorImportacao,
} from "@/modules/cadastros/fornecedores/importacao";
import { fornecedorSchema } from "@/modules/cadastros/fornecedores/schemas";

const RECURSO = "cadastros.fornecedores" as const;
const ROTA = "/cadastros/fornecedores";

export type ResultadoAcao = { ok: true } | { erro: string };

const uuidSchema = z.uuid();

/** String vazia ou só espaços vira null; o resto vem com trim. */
function ouNull(valor: string): string | null {
  const limpo = valor.trim();
  return limpo.length > 0 ? limpo : null;
}

/** Converte os dados validados do form na linha do banco (snake_case). */
function paraLinha(dados: z.output<typeof fornecedorSchema>) {
  const uf = ouNull(dados.uf);
  return {
    tipo: dados.tipo,
    razao_social: dados.razaoSocial,
    nome_fantasia: ouNull(dados.nomeFantasia),
    cnpj_cpf: ouNull(dados.cnpjCpf),
    inscricao_estadual: ouNull(dados.inscricaoEstadual),
    email: ouNull(dados.email),
    telefone: ouNull(dados.telefone),
    cidade: ouNull(dados.cidade),
    uf: uf ? uf.toUpperCase() : null,
    endereco: ouNull(dados.endereco),
    observacoes: ouNull(dados.observacoes),
    ativo: dados.ativo,
  };
}

/** Cria um fornecedor. RLS cobre a permissão de criar. */
export async function criar(dados: unknown): Promise<ResultadoAcao> {
  await exigirPermissao(RECURSO, "criar");

  const validado = fornecedorSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("fornecedores")
    .insert(paraLinha(validado.data));

  if (error) {
    return erroAcao(
      "cadastros.fornecedores.criar",
      error,
      "Não foi possível salvar o fornecedor. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Edita um fornecedor existente. */
export async function editar(
  id: string,
  dados: unknown,
): Promise<ResultadoAcao> {
  await exigirPermissao(RECURSO, "editar");

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Fornecedor inválido" };

  const validado = fornecedorSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("fornecedores")
    .update(paraLinha(validado.data))
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "cadastros.fornecedores.editar",
      error,
      "Não foi possível salvar o fornecedor. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Desativa ou reativa um fornecedor (soft delete via campo ativo). */
export async function alternarAtivo(
  id: string,
  ativo: boolean,
): Promise<ResultadoAcao> {
  await exigirPermissao(RECURSO, "editar");

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Fornecedor inválido" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("fornecedores")
    .update({ ativo })
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "cadastros.fornecedores.alternarAtivo",
      error,
      "Não foi possível alterar o status. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Exclui um fornecedor fisicamente (move para a lixeira) com motivo. */
export async function excluir(
  id: string,
  motivo: string,
): Promise<ResultadoAcao> {
  await exigirPermissao(RECURSO, "excluir");

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Fornecedor inválido" };

  const motivoLimpo = motivo.trim();
  if (motivoLimpo.length === 0) {
    return { erro: "Informe o motivo da exclusão" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_excluir_cadastro", {
    p_tabela: "fornecedores",
    p_id: idValido.data,
    p_motivo: motivoLimpo,
  });

  if (error) {
    const traduzido = traduzErroExclusao(error);
    if (traduzido) return erroAcao("cadastros.fornecedores.excluir", error, traduzido);
    return erroAcao(
      "cadastros.fornecedores.excluir",
      error,
      "Não foi possível excluir o fornecedor. Tente novamente",
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
  return Buffer.from(await arquivo.arrayBuffer());
}

export interface ResumoValidacaoImport {
  validas: number;
  invalidas: { linha: number; erros: string[] }[];
  totalLinhas: number;
}

/** Valida o arquivo de importação sem gravar nada. */
export async function validarImport(
  formData: FormData,
): Promise<ResumoValidacaoImport> {
  await exigirPermissao(RECURSO, "criar");

  const buffer = await lerArquivo(formData);
  const resultado = await lerEValidarXlsx<FornecedorImportacao>(
    buffer,
    COLUNAS_FORNECEDOR,
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

/** Importa as linhas válidas do arquivo em massa. */
export async function importar(
  formData: FormData,
): Promise<{ importadas: number } | { erro: string }> {
  await exigirPermissao(RECURSO, "criar");

  const buffer = await lerArquivo(formData);
  const resultado = await lerEValidarXlsx<FornecedorImportacao>(
    buffer,
    COLUNAS_FORNECEDOR,
  );

  if (resultado.validas.length === 0) {
    return { erro: "Nenhuma linha válida para importar" };
  }

  const linhas = resultado.validas.map((linha) => {
    const dados = linha.dados;
    const tipo = dados.tipo === "pf" ? "pf" : "pj";
    return {
      tipo,
      razao_social: dados.razaoSocial ?? "",
      cnpj_cpf: dados.cnpjCpf ?? null,
      cidade: dados.cidade ?? null,
      uf: dados.uf ?? null,
      ativo: true,
    };
  });

  const supabase = await createClient();
  const { error } = await supabase.from("fornecedores").insert(linhas);

  if (error) {
    return erroAcao(
      "cadastros.fornecedores.importar",
      error,
      "Não foi possível importar os fornecedores. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { importadas: linhas.length };
}
