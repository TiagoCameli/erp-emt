"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { lerEValidarXlsx } from "@/lib/importacao";
import { exigirPermissao, getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { traduzErroExclusao } from "@/modules/cadastros/_shared/exclusao";
import {
  colunasImportacao,
  type LinhaImportacao,
} from "@/modules/cadastros/colaboradores/importacao";
import {
  colaboradorSchema,
  type ColaboradorInput,
} from "@/modules/cadastros/colaboradores/schemas";

const RECURSO = "cadastros.colaboradores" as const;
const ROTA = "/cadastros/colaboradores";

export type ResultadoAcao = { ok: true } | { erro: string };

const uuidSchema = z.uuid();

/** Converte o ColaboradorInput validado nas colunas da tabela colaboradores. */
function paraLinhaBanco(dados: ColaboradorInput) {
  return {
    nome: dados.nome,
    cpf: dados.cpf,
    funcao: dados.funcao,
    vinculo: dados.vinculo,
    obra_id: dados.obraId,
    centro_custo_id: dados.centroCustoId,
    data_admissao: dados.dataAdmissao,
    telefone: dados.telefone,
    ativo: dados.ativo,
  };
}

/** Cria um colaborador. Marca o created_by com o usuário logado. */
export async function criar(dados: ColaboradorInput): Promise<ResultadoAcao> {
  const usuario = await exigirPermissao(RECURSO, "criar");

  const validado = colaboradorSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("colaboradores")
    .insert({ ...paraLinhaBanco(validado.data), created_by: usuario.id });

  if (error) {
    return { erro: "Não foi possível salvar o colaborador. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Edita um colaborador existente. */
export async function editar(
  id: string,
  dados: ColaboradorInput,
): Promise<ResultadoAcao> {
  await exigirPermissao(RECURSO, "editar");

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Colaborador inválido" };

  const validado = colaboradorSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("colaboradores")
    .update(paraLinhaBanco(validado.data))
    .eq("id", idValido.data);

  if (error) {
    return { erro: "Não foi possível salvar o colaborador. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Ativa ou desativa o colaborador (soft delete por status). */
export async function alternarAtivo(
  id: string,
  ativo: boolean,
): Promise<ResultadoAcao> {
  await exigirPermissao(RECURSO, "editar");

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Colaborador inválido" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("colaboradores")
    .update({ ativo })
    .eq("id", idValido.data);

  if (error) {
    return { erro: "Não foi possível atualizar o status. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Exclusão física: move o colaborador para a lixeira com motivo. */
export async function excluir(
  id: string,
  motivo: string,
): Promise<ResultadoAcao> {
  await exigirPermissao(RECURSO, "excluir");

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Colaborador inválido" };

  const motivoLimpo = motivo.trim();
  if (motivoLimpo.length === 0) {
    return { erro: "Informe o motivo da exclusão" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_excluir_cadastro", {
    p_tabela: "colaboradores",
    p_id: idValido.data,
    p_motivo: motivoLimpo,
  });

  if (error) {
    const traduzido = traduzErroExclusao(error);
    return { erro: traduzido ?? "Não foi possível excluir o colaborador. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Lê o File do FormData e devolve o Buffer, ou null se não houver arquivo. */
async function bufferDoFormData(formData: FormData): Promise<Buffer | null> {
  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return null;
  const arrayBuffer = await arquivo.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export interface ResumoImportacao {
  validas: number;
  invalidas: { linha: number; erros: string[] }[];
  totalLinhas: number;
}

/** Valida a planilha enviada e devolve o resumo da prévia. */
export async function validarImport(
  formData: FormData,
): Promise<ResumoImportacao> {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "criar")) {
    throw new Error("Sem permissão para importar colaboradores");
  }

  const buffer = await bufferDoFormData(formData);
  if (!buffer) {
    throw new Error("Nenhum arquivo enviado. Escolha um arquivo .xlsx");
  }

  const resultado = await lerEValidarXlsx<LinhaImportacao>(
    buffer,
    colunasImportacao,
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

/**
 * Importa as linhas válidas da planilha. Resolve a obra pelo nome (ativa)
 * e insere em massa. RLS cobre a permissão de criar.
 */
export async function importar(
  formData: FormData,
): Promise<{ importadas: number } | { erro: string }> {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "criar")) {
    return { erro: "Sem permissão para importar colaboradores" };
  }

  const buffer = await bufferDoFormData(formData);
  if (!buffer) {
    return { erro: "Nenhum arquivo enviado. Escolha um arquivo .xlsx" };
  }

  let resultado;
  try {
    resultado = await lerEValidarXlsx<LinhaImportacao>(
      buffer,
      colunasImportacao,
    );
  } catch (erro) {
    return {
      erro:
        erro instanceof Error && erro.message
          ? erro.message
          : "Não foi possível ler a planilha",
    };
  }

  if (resultado.validas.length === 0) {
    return { erro: "Nenhuma linha válida para importar" };
  }

  const supabase = await createClient();

  // Mapa nome da obra (minúsculo) para id, resolvendo as FKs por nome.
  const { data: obras, error: erroObras } = await supabase
    .from("obras")
    .select("id, nome")
    .eq("ativo", true);
  if (erroObras) {
    return { erro: "Não foi possível carregar as obras para a importação" };
  }
  const obraPorNome = new Map(
    (obras ?? []).map((obra) => [obra.nome.trim().toLowerCase(), obra.id]),
  );

  const linhasValidas = [];
  for (const { dados } of resultado.validas) {
    let obraId: string | null = null;
    if (dados.obra) {
      const encontrada = obraPorNome.get(dados.obra.trim().toLowerCase());
      if (!encontrada) {
        return {
          erro: `Obra "${dados.obra}" não encontrada. Cadastre a obra antes ou ajuste a planilha`,
        };
      }
      obraId = encontrada;
    }
    linhasValidas.push({
      nome: dados.nome ?? "",
      cpf: dados.cpf ?? null,
      funcao: dados.funcao ?? null,
      vinculo: dados.vinculo ?? "clt",
      obra_id: obraId,
      created_by: usuario.id,
    });
  }

  const { error } = await supabase.from("colaboradores").insert(linhasValidas);
  if (error) {
    return { erro: "Não foi possível importar os colaboradores. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { importadas: linhasValidas.length };
}
