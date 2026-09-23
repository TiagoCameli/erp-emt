"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { erroAcao, logErroServidor, semLancar } from "@/lib/erros";
import { mensagemDeNegocio } from "@/lib/erros-banco";
import { idSchema } from "@/lib/id";
import { type ColunaImportacao, lerEValidarXlsx } from "@/lib/importacao";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import { traduzErroExclusao } from "@/modules/cadastros/_shared/exclusao";
import {
  capacidadeDaPlanilha,
  casarDono,
  COLUNAS_MODELO,
  tanqueSchema,
  type FornecedorParaCasar,
  type TanqueInput,
} from "@/modules/combustivel/tanques/schemas";

/**
 * Mutações do cadastro de tanques (`combustivel.tanques`).
 *
 * Cadastro com RLS: grava direto na tabela, só nas colunas que o grant libera
 * (nome, apelido, capacidade, externo, dono, observações, ativo). Exclusão pela
 * lixeira (`fn_excluir_cadastro`); tanque com movimento é FK e não sai (vira
 * aviso de desativar). Nenhuma action lança: tudo volta `{ erro }`.
 */

const RECURSO = "combustivel.tanques" as const;
const ROTA = "/combustivel/tanques";
const TABELA = "tanques" as const;
const ERRO_NOME_REPETIDO = "Já existe um tanque com este nome";

export type ResultadoAcao = { ok: true } | { erro: string };

const motivoSchema = z.string().trim().min(1);

async function temAcao(acao: "criar" | "editar" | "excluir"): Promise<boolean> {
  try {
    await exigirPermissao(RECURSO, acao);
    return true;
  } catch {
    return false;
  }
}

/** Depois do commit nada vira falha. */
function revalidar(...extras: string[]) {
  for (const rota of [ROTA, "/combustivel", ...extras]) {
    try {
      revalidatePath(rota);
    } catch {
      // O sucesso já aconteceu.
    }
  }
}

function ehRepetido(erro: { code?: string; message?: string }): boolean {
  return erro.code === "23505" || (erro.message ?? "").toLowerCase().includes("duplicate key");
}

function paraLinha(dados: TanqueInput) {
  return {
    nome: dados.nome,
    apelido: dados.apelido === "" ? null : dados.apelido,
    capacidade_litros: dados.capacidade,
    eh_externo: dados.ehExterno,
    proprietario_id: dados.ehExterno ? dados.proprietarioId : null,
    observacoes: dados.observacoes === "" ? null : dados.observacoes,
    ativo: dados.ativo,
  };
}

/** Cria um tanque. A RLS confere `criar` de novo no banco. */
export async function criarTanque(dados: TanqueInput): Promise<ResultadoAcao> {
  return semLancar("combustivel.tanques.criar", async () => {
    if (!(await temAcao("criar"))) return { erro: "Sem permissão para criar tanques" };

    const validado = tanqueSchema.safeParse(dados);
    if (!validado.success) return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };

    const supabase = await createClient();
    const { error } = await supabase.from(TABELA).insert(paraLinha(validado.data));
    if (error) {
      if (ehRepetido(error)) return { erro: ERRO_NOME_REPETIDO };
      return erroAcao("combustivel.tanques.criar", error, "Não foi possível salvar o tanque. Tente novamente");
    }

    revalidar();
    return { ok: true };
  });
}

/** Edita um tanque. RLS que recusa o update não dá erro: volta zero linhas. */
export async function editarTanque(id: string, dados: TanqueInput): Promise<ResultadoAcao> {
  return semLancar("combustivel.tanques.editar", async () => {
    if (!(await temAcao("editar"))) return { erro: "Sem permissão para editar tanques" };

    const idValido = idSchema.safeParse(id);
    if (!idValido.success) return { erro: "Tanque inválido" };

    const validado = tanqueSchema.safeParse(dados);
    if (!validado.success) return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from(TABELA)
      .update(paraLinha(validado.data))
      .eq("id", idValido.data)
      .select("id");
    if (error) {
      if (ehRepetido(error)) return { erro: ERRO_NOME_REPETIDO };
      return erroAcao("combustivel.tanques.editar", error, "Não foi possível salvar o tanque. Tente novamente");
    }
    if (!data || data.length === 0) return { erro: "Tanque não encontrado ou sem permissão para editar" };

    revalidar(`${ROTA}/${idValido.data}`);
    return { ok: true };
  });
}

/** Ativa ou desativa um tanque. */
export async function alternarAtivoTanque(id: string, ativo: boolean): Promise<ResultadoAcao> {
  return semLancar("combustivel.tanques.alternarAtivo", async () => {
    if (!(await temAcao("editar"))) return { erro: "Sem permissão para editar tanques" };

    const idValido = idSchema.safeParse(id);
    if (!idValido.success) return { erro: "Tanque inválido" };
    if (typeof ativo !== "boolean") return { erro: "Status inválido" };

    const supabase = await createClient();
    const { data, error } = await supabase.from(TABELA).update({ ativo }).eq("id", idValido.data).select("id");
    if (error) {
      return erroAcao("combustivel.tanques.alternarAtivo", error, "Não foi possível alterar o status. Tente novamente");
    }
    if (!data || data.length === 0) return { erro: "Tanque não encontrado ou sem permissão para editar" };

    revalidar(`${ROTA}/${idValido.data}`);
    return { ok: true };
  });
}

/** Move o tanque para a lixeira, com motivo. Com movimento (FK) não sai: desative. */
export async function excluirTanque(id: string, motivo: string): Promise<ResultadoAcao> {
  return semLancar("combustivel.tanques.excluir", async () => {
    if (!(await temAcao("excluir"))) return { erro: "Sem permissão para excluir tanques" };

    const idValido = idSchema.safeParse(id);
    if (!idValido.success) return { erro: "Tanque inválido" };

    const motivoValido = motivoSchema.safeParse(motivo);
    if (!motivoValido.success) return { erro: "Informe o motivo da exclusão" };

    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_excluir_cadastro", {
      p_tabela: TABELA,
      p_id: idValido.data,
      p_motivo: motivoValido.data,
    });

    if (error) {
      const emUso = traduzErroExclusao(error.code === "23503" ? { message: "foreign key" } : error);
      return erroAcao(
        "combustivel.tanques.excluir",
        error,
        emUso ?? mensagemDeNegocio(error, "Não foi possível excluir o tanque. Tente novamente"),
      );
    }

    revalidar();
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Importação por planilha
// ---------------------------------------------------------------------------

interface LinhaImportTanque {
  nome: string;
  apelido: string | null;
  capacidade: number;
  dono: string | null;
  observacoes: string | null;
}

/** Linha pronta para o insert, com o dono já casado. */
interface TanqueImportado {
  nome: string;
  apelido: string | null;
  capacidade_litros: number;
  eh_externo: boolean;
  proprietario_id: string | null;
  observacoes: string | null;
}

function textoDaCelula(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  return String(valor).trim();
}

function textoOpcional(maximo: number, rotulo: string) {
  return (valor: unknown) => {
    const texto = textoDaCelula(valor);
    if (texto.length > maximo) throw new Error(`${rotulo}: no máximo ${maximo} caracteres`);
    return texto === "" ? null : texto;
  };
}

const COLUNAS_IMPORT: ColunaImportacao<LinhaImportTanque>[] = [
  {
    chave: "nome",
    rotulo: COLUNAS_MODELO[0].rotulo,
    obrigatoria: true,
    exemplo: COLUNAS_MODELO[0].exemplo,
    transformar: (valor) => textoDaCelula(valor),
    validar: (valor) =>
      typeof valor === "string" && valor.length >= 2 && valor.length <= 120 ? null : "Coluna Nome: de 2 a 120 caracteres",
  },
  {
    chave: "apelido",
    rotulo: COLUNAS_MODELO[1].rotulo,
    exemplo: COLUNAS_MODELO[1].exemplo,
    transformar: textoOpcional(60, "apelido"),
  },
  {
    chave: "capacidade",
    rotulo: COLUNAS_MODELO[2].rotulo,
    exemplo: COLUNAS_MODELO[2].exemplo,
    transformar: capacidadeDaPlanilha,
  },
  {
    chave: "dono",
    rotulo: COLUNAS_MODELO[3].rotulo,
    exemplo: COLUNAS_MODELO[3].exemplo,
    transformar: (valor) => {
      const texto = textoDaCelula(valor);
      return texto === "" ? null : texto;
    },
  },
  {
    chave: "observacoes",
    rotulo: COLUNAS_MODELO[4].rotulo,
    exemplo: COLUNAS_MODELO[4].exemplo,
    transformar: textoOpcional(1000, "observações"),
  },
];

async function lerArquivo(formData: FormData): Promise<Buffer> {
  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File)) throw new Error("Nenhum arquivo enviado");
  return Buffer.from(await arquivo.arrayBuffer());
}

async function carregarFornecedores(): Promise<FornecedorParaCasar[]> {
  const supabase = await createClient();
  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("fornecedores")
      .select("id, razao_social, nome_fantasia, cnpj_cpf")
      .eq("ativo", true)
      .order("id")
      .range(de, ate),
  );
  if (erro) throw new Error("Não foi possível carregar os fornecedores para casar o dono");
  return linhas.map((f) => ({
    id: f.id,
    razaoSocial: f.razao_social,
    nomeFantasia: f.nome_fantasia,
    cnpjCpf: f.cnpj_cpf,
  }));
}

interface PlanilhaLida {
  prontas: TanqueImportado[];
  invalidas: { linha: number; erros: string[] }[];
  totalLinhas: number;
}

/**
 * Lê e valida a planilha, e casa o dono de cada linha com o cadastro. A prévia
 * e a importação passam por aqui, então a linha que a prévia aceitou é a mesma
 * que a importação grava.
 */
async function lerPlanilha(formData: FormData): Promise<PlanilhaLida> {
  const resultado = await lerEValidarXlsx<LinhaImportTanque>(await lerArquivo(formData), COLUNAS_IMPORT);
  const invalidas = resultado.invalidas.map((linha) => ({ linha: linha.linha, erros: linha.erros }));
  const precisaDono = resultado.validas.some((linha) => linha.dados.dono);
  const fornecedores = precisaDono ? await carregarFornecedores() : [];

  const prontas: TanqueImportado[] = [];
  for (const linha of resultado.validas) {
    const dono = linha.dados.dono ?? null;
    let proprietarioId: string | null = null;
    if (dono) {
      const casado = casarDono(dono, fornecedores);
      if ("erro" in casado) {
        invalidas.push({ linha: linha.linha, erros: [`Coluna ${COLUNAS_MODELO[3].rotulo}: ${casado.erro}`] });
        continue;
      }
      proprietarioId = casado.id;
    }
    prontas.push({
      nome: String(linha.dados.nome ?? "").trim(),
      apelido: linha.dados.apelido ?? null,
      capacidade_litros: linha.dados.capacidade ?? 0,
      eh_externo: proprietarioId !== null,
      proprietario_id: proprietarioId,
      observacoes: linha.dados.observacoes ?? null,
    });
  }

  invalidas.sort((a, b) => a.linha - b.linha);
  return { prontas, invalidas, totalLinhas: resultado.totalLinhas };
}

export interface ResumoImportacao {
  validas: number;
  invalidas: { linha: number; erros: string[] }[];
  totalLinhas: number;
}

/** Prévia da importação. Não lança: falha de leitura volta como linha recusada. */
export async function validarImport(formData: FormData): Promise<ResumoImportacao> {
  try {
    await exigirPermissao(RECURSO, "criar");
    const lida = await lerPlanilha(formData);
    return { validas: lida.prontas.length, invalidas: lida.invalidas, totalLinhas: lida.totalLinhas };
  } catch (erro) {
    logErroServidor("combustivel.tanques.validarImport", erro);
    const mensagem = erro instanceof Error && erro.message ? erro.message : "Não foi possível ler a planilha";
    return { validas: 0, invalidas: [{ linha: 1, erros: [mensagem] }], totalLinhas: 0 };
  }
}

/** Importa as linhas válidas. Nome repetido (no arquivo ou no cadastro) recusa o lote. */
export async function importar(formData: FormData): Promise<{ importadas: number } | { erro: string }> {
  try {
    await exigirPermissao(RECURSO, "criar");
  } catch {
    return { erro: "Sem permissão para importar tanques" };
  }

  let importadas: number;
  try {
    const lida = await lerPlanilha(formData);
    if (lida.prontas.length === 0) return { erro: "Nenhuma linha válida para importar" };

    const supabase = await createClient();
    const { error } = await supabase.from(TABELA).insert(lida.prontas);
    if (error) {
      if (ehRepetido(error)) {
        return { erro: "Há nomes repetidos no arquivo ou já cadastrados. Corrija e tente de novo" };
      }
      return erroAcao("combustivel.tanques.importar", error, "Não foi possível importar os tanques. Tente novamente");
    }
    importadas = lida.prontas.length;
  } catch (erro) {
    return erroAcao(
      "combustivel.tanques.importar",
      erro,
      erro instanceof Error && erro.message ? erro.message : "Não foi possível ler a planilha",
    );
  }

  // Fora do try: depois do insert gravado, nada vira falha na tela.
  revalidar();
  return { importadas };
}
