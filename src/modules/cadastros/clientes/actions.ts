"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { erroAcao } from "@/lib/erros";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { lerEValidarXlsx, type ColunaImportacao } from "@/lib/importacao";
import { traduzErroExclusao } from "@/modules/cadastros/_shared/exclusao";
import {
  clienteSchema,
  paraNuloSeVazio,
  TIPOS_CLIENTE,
  type ClienteInput,
} from "@/modules/cadastros/clientes/schemas";

const RECURSO = "cadastros.clientes" as const;
const ROTA = "/cadastros/clientes";

export type ResultadoAcao = { ok: true } | { erro: string };
export type ResultadoImport = { importadas: number } | { erro: string };

const uuidSchema = z.uuid();

/** Linha lida da planilha de importação de clientes. */
interface LinhaImportCliente {
  tipo: string;
  nome: string;
  cpf_cnpj: string | null;
  cidade: string | null;
  uf: string | null;
}

/** Normaliza o tipo aceitando "pf"/"pj" em qualquer caixa, padrão pj. */
function normalizarTipo(valor: unknown): string {
  const texto = String(valor ?? "").trim().toLowerCase();
  return texto === "pf" ? "pf" : "pj";
}

/** Colunas da planilha de importação de clientes, usadas só dentro deste módulo. */
const COLUNAS_IMPORT_CLIENTES: ColunaImportacao<LinhaImportCliente>[] = [
  {
    chave: "tipo",
    rotulo: "Tipo",
    exemplo: "pj",
    transformar: normalizarTipo,
    validar: (valor) =>
      TIPOS_CLIENTE.includes(valor as (typeof TIPOS_CLIENTE)[number])
        ? null
        : "Tipo deve ser pf ou pj",
  },
  {
    chave: "nome",
    rotulo: "Nome",
    obrigatoria: true,
    exemplo: "DNIT",
    transformar: (valor) => String(valor ?? "").trim(),
  },
  {
    chave: "cpf_cnpj",
    rotulo: "CPF/CNPJ",
    exemplo: "00.000.000/0001-00",
    transformar: (valor) => String(valor ?? "").trim() || null,
  },
  {
    chave: "cidade",
    rotulo: "Cidade",
    exemplo: "Rio Branco",
    transformar: (valor) => String(valor ?? "").trim() || null,
  },
  {
    chave: "uf",
    rotulo: "UF",
    exemplo: "AC",
    transformar: (valor) => {
      const texto = String(valor ?? "").trim().toUpperCase();
      return texto || null;
    },
    validar: (valor) =>
      valor === null || String(valor).length === 2
        ? null
        : "UF deve ter 2 letras",
  },
];

/** Monta a linha de insert a partir do input validado, vazio vira null. */
function paraInsert(dados: ClienteInput) {
  return {
    tipo: dados.tipo,
    nome: dados.nome.trim(),
    nome_fantasia: paraNuloSeVazio(dados.nome_fantasia),
    cpf_cnpj: paraNuloSeVazio(dados.cpf_cnpj),
    inscricao_estadual: paraNuloSeVazio(dados.inscricao_estadual),
    email: paraNuloSeVazio(dados.email),
    telefone: paraNuloSeVazio(dados.telefone),
    cidade: paraNuloSeVazio(dados.cidade),
    uf: paraNuloSeVazio(dados.uf),
    endereco: paraNuloSeVazio(dados.endereco),
    observacoes: paraNuloSeVazio(dados.observacoes),
    ativo: dados.ativo,
  };
}

/** Cria um cliente. RLS cobre a permissão de criar. */
export async function criar(dados: ClienteInput): Promise<ResultadoAcao> {
  await exigirPermissao(RECURSO, "criar");

  const validado = clienteSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("clientes").insert(paraInsert(validado.data));

  if (error) {
    return erroAcao(
      "cadastros.clientes.criar",
      error,
      "Não foi possível salvar o cliente. Tente novamente.",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Edita um cliente existente. */
export async function editar(
  id: string,
  dados: ClienteInput,
): Promise<ResultadoAcao> {
  await exigirPermissao(RECURSO, "editar");

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Cliente inválido" };

  const validado = clienteSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("clientes")
    .update(paraInsert(validado.data))
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "cadastros.clientes.editar",
      error,
      "Não foi possível salvar o cliente. Tente novamente.",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Ativa ou desativa um cliente (soft delete reversível). */
export async function alternarAtivo(
  id: string,
  ativo: boolean,
): Promise<ResultadoAcao> {
  await exigirPermissao(RECURSO, "editar");

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Cliente inválido" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("clientes")
    .update({ ativo })
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "cadastros.clientes.alternarAtivo",
      error,
      "Não foi possível atualizar o status. Tente novamente.",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Exclui fisicamente um cliente (move para a lixeira) com motivo. */
export async function excluir(
  id: string,
  motivo: string,
): Promise<ResultadoAcao> {
  await exigirPermissao(RECURSO, "excluir");

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Cliente inválido" };

  const motivoLimpo = motivo.trim();
  if (motivoLimpo.length === 0) return { erro: "Informe o motivo da exclusão" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_excluir_cadastro", {
    p_tabela: "clientes",
    p_id: idValido.data,
    p_motivo: motivoLimpo,
  });

  if (error) {
    const amigavel = traduzErroExclusao(error);
    return erroAcao(
      "cadastros.clientes.excluir",
      error,
      amigavel ?? "Não foi possível excluir o cliente. Tente novamente.",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Lê e valida a planilha de clientes enviada, sem gravar nada. */
export async function validarImport(formData: FormData): Promise<{
  validas: number;
  invalidas: { linha: number; erros: string[] }[];
  totalLinhas: number;
}> {
  await exigirPermissao(RECURSO, "criar");

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File)) {
    return { validas: 0, invalidas: [], totalLinhas: 0 };
  }

  const buffer = Buffer.from(await arquivo.arrayBuffer());
  const resultado = await lerEValidarXlsx(buffer, COLUNAS_IMPORT_CLIENTES);

  return {
    validas: resultado.validas.length,
    invalidas: resultado.invalidas.map((linha) => ({
      linha: linha.linha,
      erros: linha.erros,
    })),
    totalLinhas: resultado.totalLinhas,
  };
}

/** Importa as linhas válidas da planilha de clientes em massa. */
export async function importar(formData: FormData): Promise<ResultadoImport> {
  await exigirPermissao(RECURSO, "criar");

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File)) {
    return { erro: "Nenhum arquivo enviado." };
  }

  const buffer = Buffer.from(await arquivo.arrayBuffer());
  const resultado = await lerEValidarXlsx(buffer, COLUNAS_IMPORT_CLIENTES);

  if (resultado.validas.length === 0) {
    return { erro: "Nenhuma linha válida para importar." };
  }

  const linhas = resultado.validas.map((linha) => ({
    tipo: linha.dados.tipo ?? "pj",
    nome: linha.dados.nome ?? "",
    cpf_cnpj: linha.dados.cpf_cnpj ?? null,
    cidade: linha.dados.cidade ?? null,
    uf: linha.dados.uf ?? null,
    ativo: true,
  }));

  const supabase = await createClient();
  const { error } = await supabase.from("clientes").insert(linhas);

  if (error) {
    return erroAcao(
      "cadastros.clientes.importar",
      error,
      "Não foi possível importar os clientes. Tente novamente.",
    );
  }

  revalidatePath(ROTA);
  return { importadas: linhas.length };
}
