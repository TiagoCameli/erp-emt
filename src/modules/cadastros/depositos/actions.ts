"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  lerEValidarXlsx,
  type ColunaImportacao,
} from "@/lib/importacao";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { traduzErroExclusao } from "@/modules/cadastros/_shared/exclusao";
import {
  depositoSchema,
  ehTanque,
  TIPOS_DEPOSITO,
  type DepositoInput,
  type TipoDeposito,
} from "@/modules/cadastros/depositos/schemas";

const RECURSO = "cadastros.depositos" as const;
const ROTA = "/cadastros/depositos";
const TABELA = "depositos";

export type ResultadoAcao = { ok: true } | { erro: string };

const uuidSchema = z.uuid();

/** Cria um depósito. Tanque exige insumo; demais tipos não podem ter insumo. */
export async function criar(dados: DepositoInput): Promise<ResultadoAcao> {
  await exigirPermissao(RECURSO, "criar");

  const validado = depositoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const { nome, tipo, obraId, insumoId, ativo } = validado.data;
  const supabase = await createClient();
  const { error } = await supabase.from("depositos").insert({
    nome,
    tipo,
    obra_id: obraId,
    insumo_id: insumoId,
    ativo,
  });

  if (error) {
    return { erro: "Não foi possível criar o depósito. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Edita um depósito existente. */
export async function editar(
  id: string,
  dados: DepositoInput,
): Promise<ResultadoAcao> {
  await exigirPermissao(RECURSO, "editar");

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Depósito inválido" };

  const validado = depositoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const { nome, tipo, obraId, insumoId, ativo } = validado.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("depositos")
    .update({
      nome,
      tipo,
      obra_id: obraId,
      insumo_id: insumoId,
      ativo,
    })
    .eq("id", idValido.data);

  if (error) {
    return { erro: "Não foi possível salvar o depósito. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Desativa ou reativa um depósito (soft delete via campo ativo). */
export async function alternarAtivo(
  id: string,
  ativo: boolean,
): Promise<ResultadoAcao> {
  await exigirPermissao(RECURSO, "editar");

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Depósito inválido" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("depositos")
    .update({ ativo })
    .eq("id", idValido.data);

  if (error) {
    return { erro: "Não foi possível alterar o status. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Exclusão física: move o depósito para a lixeira com motivo. */
export async function excluir(
  id: string,
  motivo: string,
): Promise<ResultadoAcao> {
  await exigirPermissao(RECURSO, "excluir");

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Depósito inválido" };

  const motivoLimpo = motivo.trim();
  if (motivoLimpo.length === 0) {
    return { erro: "Informe o motivo da exclusão" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_excluir_cadastro", {
    p_tabela: TABELA,
    p_id: idValido.data,
    p_motivo: motivoLimpo,
  });

  if (error) {
    const traduzido = traduzErroExclusao(error);
    if (traduzido) return { erro: traduzido };
    return { erro: "Não foi possível excluir o depósito. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

// --- Importação por planilha ---

/** Linha lida da planilha de importação de depósitos. */
interface LinhaDeposito {
  nome: string;
  tipo: string;
  obra: string | null;
  insumo: string | null;
}

const TIPOS_VALIDOS = new Set<string>(TIPOS_DEPOSITO);

/** Colunas esperadas na planilha. O tipo é validado contra a lista canônica. */
const COLUNAS: ColunaImportacao<LinhaDeposito>[] = [
  { chave: "nome", rotulo: "Nome", obrigatoria: true },
  {
    chave: "tipo",
    rotulo: "Tipo",
    obrigatoria: true,
    transformar: (valor) => String(valor).trim().toLowerCase(),
    validar: (valor) =>
      TIPOS_VALIDOS.has(String(valor))
        ? null
        : `Tipo inválido. Use: ${TIPOS_DEPOSITO.join(", ")}`,
  },
  { chave: "obra", rotulo: "Obra" },
  { chave: "insumo", rotulo: "Insumo" },
];

/** Converte o throw de exigirPermissao no contrato { erro } das actions. */
async function checarPermissao(
  acao: "ver" | "criar" | "editar" | "excluir",
): Promise<boolean> {
  try {
    await exigirPermissao(RECURSO, acao);
    return true;
  } catch {
    return false;
  }
}

/**
 * Valida o arquivo enviado: aplica as regras de coluna mais a regra de
 * tanque (tanque exige insumo, demais tipos não podem ter insumo).
 */
export async function validarImport(formData: FormData): Promise<{
  validas: number;
  invalidas: { linha: number; erros: string[] }[];
  totalLinhas: number;
}> {
  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File)) {
    throw new Error("Nenhum arquivo enviado");
  }

  const buffer = Buffer.from(await arquivo.arrayBuffer());
  const resultado = await lerEValidarXlsx<LinhaDeposito>(buffer, COLUNAS);

  const validas: { linha: number; erros: string[] }[] = [];
  const invalidas = resultado.invalidas.map((linha) => ({
    linha: linha.linha,
    erros: linha.erros,
  }));

  for (const linha of resultado.validas) {
    const erros = errosDeTanque(linha.dados.tipo, linha.dados.insumo);
    if (erros.length > 0) {
      invalidas.push({ linha: linha.linha, erros });
    } else {
      validas.push({ linha: linha.linha, erros: [] });
    }
  }

  invalidas.sort((a, b) => a.linha - b.linha);

  return {
    validas: validas.length,
    invalidas,
    totalLinhas: resultado.totalLinhas,
  };
}

/** Regras de tanque na importação, espelhando o refine do Zod. */
function errosDeTanque(
  tipo: string | undefined,
  insumo: string | null | undefined,
): string[] {
  const erros: string[] = [];
  if (!tipo) return erros;
  if (ehTanque(tipo)) {
    if (!insumo) {
      erros.push("Tanque exige um insumo. Preencha a coluna Insumo");
    }
  } else if (insumo) {
    erros.push("Só tanque pode ter insumo. Deixe a coluna Insumo em branco");
  }
  return erros;
}

/**
 * Importa as linhas válidas: resolve obra pelo nome e insumo pelo nome,
 * aplica a regra de tanque e insere em massa (RLS cobre a permissão criar).
 */
export async function importar(
  formData: FormData,
): Promise<{ importadas: number } | { erro: string }> {
  if (!(await checarPermissao("criar"))) {
    return { erro: "Sem permissão para importar depósitos" };
  }

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File)) {
    return { erro: "Nenhum arquivo enviado" };
  }

  const buffer = Buffer.from(await arquivo.arrayBuffer());
  const resultado = await lerEValidarXlsx<LinhaDeposito>(buffer, COLUNAS);

  const supabase = await createClient();

  const [obrasResposta, insumosResposta] = await Promise.all([
    supabase.from("obras").select("id, nome"),
    supabase.from("insumos").select("id, nome"),
  ]);

  if (obrasResposta.error || insumosResposta.error) {
    return { erro: "Não foi possível carregar obras e insumos para o vínculo" };
  }

  const obraPorNome = new Map(
    (obrasResposta.data ?? []).map((obra) => [
      obra.nome.trim().toLowerCase(),
      obra.id,
    ]),
  );
  const insumoPorNome = new Map(
    (insumosResposta.data ?? []).map((insumo) => [
      insumo.nome.trim().toLowerCase(),
      insumo.id,
    ]),
  );

  const linhasValidas: {
    nome: string;
    tipo: TipoDeposito;
    obra_id: string | null;
    insumo_id: string | null;
    ativo: boolean;
  }[] = [];

  for (const linha of resultado.validas) {
    const { nome, tipo, obra, insumo } = linha.dados;
    if (!nome || !tipo) continue;

    if (errosDeTanque(tipo, insumo).length > 0) continue;

    const obraId = obra ? (obraPorNome.get(obra.toLowerCase()) ?? null) : null;
    if (obra && !obraId) {
      return {
        erro: `Obra "${obra}" não encontrada (linha ${linha.linha}). Cadastre a obra antes ou corrija o nome`,
      };
    }

    const insumoId = insumo
      ? (insumoPorNome.get(insumo.toLowerCase()) ?? null)
      : null;
    if (insumo && !insumoId) {
      return {
        erro: `Insumo "${insumo}" não encontrado (linha ${linha.linha}). Cadastre o insumo antes ou corrija o nome`,
      };
    }

    linhasValidas.push({
      nome,
      tipo: tipo as TipoDeposito,
      obra_id: obraId,
      insumo_id: insumoId,
      ativo: true,
    });
  }

  if (linhasValidas.length === 0) {
    return { erro: "Nenhuma linha válida para importar" };
  }

  const { error } = await supabase.from("depositos").insert(linhasValidas);
  if (error) {
    return { erro: "Não foi possível importar os depósitos. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { importadas: linhasValidas.length };
}
