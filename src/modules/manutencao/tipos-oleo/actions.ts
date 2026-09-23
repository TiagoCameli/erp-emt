"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { erroAcao, logErroServidor } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import { type ColunaImportacao, lerEValidarXlsx } from "@/lib/importacao";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { traduzErroExclusao } from "@/modules/cadastros/_shared/exclusao";
import type { AplicacaoOleo } from "@/modules/manutencao/_shared/rotulos";
import {
  APLICACOES_ACEITAS,
  aplicacaoDaPlanilha,
  COLUNAS_MODELO,
  INTERVALO_MESES_MAXIMO,
  intervaloMesesParaNumero,
  tipoOleoSchema,
  type TipoOleoInput,
} from "@/modules/manutencao/tipos-oleo/schemas";

const RECURSO = "manutencao.tipos-oleo" as const;
const ROTA = "/manutencao/tipos-oleo";
const TABELA = "tipos_oleo" as const;
const ERRO_NOME_REPETIDO = "Já existe um tipo de óleo com este nome";

export type ResultadoAcao = { ok: true } | { erro: string };

const motivoSchema = z.string().trim().min(1);

function paraLinha(dados: TipoOleoInput) {
  return {
    nome: dados.nome,
    aplicacao: dados.aplicacao,
    intervalo_meses: dados.intervaloMeses,
    ativo: dados.ativo,
  };
}

/** Cria um tipo de óleo. RLS confere `criar` de novo no banco. */
export async function criar(dados: TipoOleoInput): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "criar");
  } catch {
    return { erro: "Sem permissão para criar tipos de óleo" };
  }

  const validado = tipoOleoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.from(TABELA).insert(paraLinha(validado.data));
    if (error) {
      if (error.code === "23505") return { erro: ERRO_NOME_REPETIDO };
      return erroAcao("manutencao.tipos-oleo.criar", error, "Não foi possível salvar o tipo de óleo. Tente novamente");
    }
  } catch (erro) {
    return erroAcao("manutencao.tipos-oleo.criar", erro, "Não foi possível salvar o tipo de óleo. Tente novamente");
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Edita um tipo de óleo. */
export async function editar(id: string, dados: TipoOleoInput): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para editar tipos de óleo" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Tipo de óleo inválido" };

  const validado = tipoOleoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from(TABELA)
      .update(paraLinha(validado.data))
      .eq("id", idValido.data)
      .select("id");
    if (error) {
      if (error.code === "23505") return { erro: ERRO_NOME_REPETIDO };
      return erroAcao("manutencao.tipos-oleo.editar", error, "Não foi possível salvar o tipo de óleo. Tente novamente");
    }
    // RLS que recusa o update não dá erro: volta zero linhas.
    if (!data || data.length === 0) return { erro: "Tipo de óleo não encontrado ou sem permissão para editar" };
  } catch (erro) {
    return erroAcao("manutencao.tipos-oleo.editar", erro, "Não foi possível salvar o tipo de óleo. Tente novamente");
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Ativa ou desativa um tipo de óleo. */
export async function alternarAtivo(id: string, ativo: boolean): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para editar tipos de óleo" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Tipo de óleo inválido" };
  if (typeof ativo !== "boolean") return { erro: "Status inválido" };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from(TABELA)
      .update({ ativo })
      .eq("id", idValido.data)
      .select("id");
    if (error) {
      return erroAcao("manutencao.tipos-oleo.alternarAtivo", error, "Não foi possível alterar o status. Tente novamente");
    }
    if (!data || data.length === 0) return { erro: "Tipo de óleo não encontrado ou sem permissão para editar" };
  } catch (erro) {
    return erroAcao("manutencao.tipos-oleo.alternarAtivo", erro, "Não foi possível alterar o status. Tente novamente");
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Exclusão: move para a lixeira pela RPC, com motivo. Em uso (FK) vira aviso de desativar. */
export async function excluir(id: string, motivo: string): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "excluir");
  } catch {
    return { erro: "Sem permissão para excluir tipos de óleo" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Tipo de óleo inválido" };

  const motivoValido = motivoSchema.safeParse(motivo);
  if (!motivoValido.success) return { erro: "Informe o motivo da exclusão" };

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_excluir_cadastro", {
      p_tabela: TABELA,
      p_id: idValido.data,
      p_motivo: motivoValido.data,
    });
    if (error) {
      const traduzido = traduzErroExclusao(error);
      return erroAcao(
        "manutencao.tipos-oleo.excluir",
        error,
        traduzido ?? "Não foi possível excluir o tipo de óleo. Tente novamente",
      );
    }
  } catch (erro) {
    return erroAcao("manutencao.tipos-oleo.excluir", erro, "Não foi possível excluir o tipo de óleo. Tente novamente");
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Linha tipada da planilha de importação. */
interface LinhaImportTipoOleo {
  nome: string;
  aplicacao: AplicacaoOleo;
  intervaloMeses: number | null;
}

/** Célula da planilha em texto: número vira "12", nulo vira "". */
function textoDaCelula(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  return String(valor).trim();
}

/** Colunas da planilha. Rótulos e exemplos são os do modelo (COLUNAS_MODELO). */
const COLUNAS_IMPORT: ColunaImportacao<LinhaImportTipoOleo>[] = [
  {
    chave: "nome",
    rotulo: COLUNAS_MODELO[0].rotulo,
    obrigatoria: true,
    exemplo: COLUNAS_MODELO[0].exemplo,
    transformar: (valor) => textoDaCelula(valor),
    validar: (valor) =>
      typeof valor === "string" && valor.length >= 2 && valor.length <= 120
        ? null
        : "Coluna Nome: de 2 a 120 caracteres",
  },
  {
    chave: "aplicacao",
    rotulo: COLUNAS_MODELO[1].rotulo,
    obrigatoria: false,
    exemplo: COLUNAS_MODELO[1].exemplo,
    transformar: (valor) => {
      const aplicacao = aplicacaoDaPlanilha(textoDaCelula(valor));
      if (aplicacao === null) throw new Error(`use uma destas: ${APLICACOES_ACEITAS}`);
      return aplicacao;
    },
  },
  {
    chave: "intervaloMeses",
    rotulo: COLUNAS_MODELO[2].rotulo,
    obrigatoria: false,
    exemplo: COLUNAS_MODELO[2].exemplo,
    transformar: (valor) => {
      const numero = intervaloMesesParaNumero(textoDaCelula(valor));
      if (numero === undefined) throw new Error(`um número inteiro de 1 a ${INTERVALO_MESES_MAXIMO}`);
      return numero;
    },
  },
];

async function lerArquivo(formData: FormData): Promise<Buffer> {
  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File)) {
    throw new Error("Nenhum arquivo enviado");
  }
  return Buffer.from(await arquivo.arrayBuffer());
}

export interface ResumoImportacao {
  validas: number;
  invalidas: { linha: number; erros: string[] }[];
  totalLinhas: number;
}

/**
 * Prévia da importação. Não lança: falha de leitura (sem permissão, planilha sem
 * a coluna Nome) volta como uma linha recusada, para a mensagem chegar à tela.
 */
export async function validarImport(formData: FormData): Promise<ResumoImportacao> {
  try {
    await exigirPermissao(RECURSO, "criar");
    const resultado = await lerEValidarXlsx<LinhaImportTipoOleo>(await lerArquivo(formData), COLUNAS_IMPORT);
    return {
      validas: resultado.validas.length,
      invalidas: resultado.invalidas.map((linha) => ({ linha: linha.linha, erros: linha.erros })),
      totalLinhas: resultado.totalLinhas,
    };
  } catch (erro) {
    logErroServidor("manutencao.tipos-oleo.validarImport", erro);
    const mensagem = erro instanceof Error && erro.message ? erro.message : "Não foi possível ler a planilha";
    return { validas: 0, invalidas: [{ linha: 1, erros: [mensagem] }], totalLinhas: 0 };
  }
}

/** Importa as linhas válidas. Nome repetido (no arquivo ou no cadastro) recusa o lote inteiro. */
export async function importar(formData: FormData): Promise<{ importadas: number } | { erro: string }> {
  try {
    await exigirPermissao(RECURSO, "criar");
  } catch {
    return { erro: "Sem permissão para importar tipos de óleo" };
  }

  let importadas: number;
  try {
    const resultado = await lerEValidarXlsx<LinhaImportTipoOleo>(await lerArquivo(formData), COLUNAS_IMPORT);
    if (resultado.validas.length === 0) {
      return { erro: "Nenhuma linha válida para importar" };
    }

    const linhas = resultado.validas.map((linha) => ({
      nome: String(linha.dados.nome ?? "").trim(),
      aplicacao: linha.dados.aplicacao ?? "outro",
      intervalo_meses: linha.dados.intervaloMeses ?? null,
    }));

    const supabase = await createClient();
    const { error } = await supabase.from(TABELA).insert(linhas);
    if (error) {
      if (error.code === "23505") {
        return { erro: "Há nomes repetidos no arquivo ou já cadastrados. Corrija e tente de novo" };
      }
      return erroAcao("manutencao.tipos-oleo.importar", error, "Não foi possível importar os tipos de óleo. Tente novamente");
    }
    importadas = linhas.length;
  } catch (erro) {
    return erroAcao(
      "manutencao.tipos-oleo.importar",
      erro,
      erro instanceof Error && erro.message ? erro.message : "Não foi possível ler a planilha",
    );
  }

  // Fora do try: depois do insert gravado, nada pode virar falha na tela.
  revalidatePath(ROTA);
  return { importadas };
}
