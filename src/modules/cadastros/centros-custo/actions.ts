"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  lerEValidarXlsx,
  type ColunaImportacao,
} from "@/lib/importacao";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  criarEtapaSchema,
  criarItemSchema,
  editarNoSchema,
  type CriarEtapaInput,
  type CriarItemInput,
  type EditarNoInput,
} from "@/modules/cadastros/centros-custo/schemas";

const RECURSO = "cadastros.centros-custo" as const;
const ROTA = "/cadastros/centros-custo";
const TABELA = "centros_custo" as const;

export type ResultadoAcao = { ok: true } | { erro: string };

const uuidSchema = z.uuid();

/** Campos que governam as travas: sistema, equipamento e obra são geridos pelo banco. */
interface NoTravas {
  nivel: number;
  sistema: boolean;
  equipamento_id: string | null;
  obra_id: string | null;
  pai_id: string | null;
}

/** Lê o nó e os campos de trava. Null quando não existe. */
async function carregarNo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
): Promise<NoTravas | null> {
  const { data } = await supabase
    .from(TABELA)
    .select("nivel, sistema, equipamento_id, obra_id, pai_id")
    .eq("id", id)
    .maybeSingle();
  return data;
}

/**
 * True quando o nó é gerido pelo sistema: de sistema, gerado por equipamento ou
 * raiz de obra (criada pela trigger da obra, espelha o nome da obra).
 */
function noGerido(no: NoTravas): boolean {
  return no.sistema || no.equipamento_id !== null || no.obra_id !== null;
}

/**
 * Cria uma etapa (nível 2) sob um centro (nível 1). O pai precisa existir e
 * ser de nível 1. A etapa nasce manual: sistema=false, sem equipamento.
 */
export async function criarEtapa(dados: CriarEtapaInput): Promise<ResultadoAcao> {
  await exigirPermissao(RECURSO, "criar");

  const validado = criarEtapaSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const pai = await carregarNo(supabase, validado.data.pai_id);
  if (!pai) return { erro: "Centro não encontrado" };
  if (pai.nivel !== 1) {
    return { erro: "Etapas só podem ser criadas sob um centro" };
  }

  const { error } = await supabase.from(TABELA).insert({
    nome: validado.data.nome,
    pai_id: validado.data.pai_id,
    nivel: 2,
    tipo: null,
    sistema: false,
    orcamento: validado.data.orcamento ?? null,
    ativo: true,
  });

  if (error) {
    return { erro: "Não foi possível criar a etapa. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * Cria um item (nível 3) sob uma etapa (nível 2). O pai precisa existir e ser
 * de nível 2. O item nasce manual: sistema=false, sem equipamento.
 */
export async function criarItem(dados: CriarItemInput): Promise<ResultadoAcao> {
  await exigirPermissao(RECURSO, "criar");

  const validado = criarItemSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const pai = await carregarNo(supabase, validado.data.pai_id);
  if (!pai) return { erro: "Etapa não encontrada" };
  if (pai.nivel !== 2) {
    return { erro: "Itens só podem ser criados sob uma etapa" };
  }

  const { error } = await supabase.from(TABELA).insert({
    nome: validado.data.nome,
    pai_id: validado.data.pai_id,
    nivel: 3,
    tipo: null,
    sistema: false,
    orcamento: validado.data.orcamento ?? null,
    ativo: true,
  });

  if (error) {
    return { erro: "Não foi possível criar o item. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * Edita um nó. Em nó gerido (sistema ou equipamento) só o orçamento muda:
 * nome e código ficam travados. Em nó manual edita nome, código e orçamento.
 */
export async function editarNo(
  id: string,
  dados: EditarNoInput,
): Promise<ResultadoAcao> {
  await exigirPermissao(RECURSO, "editar");

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Centro de custo inválido" };

  const validado = editarNoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const no = await carregarNo(supabase, idValido.data);
  if (!no) return { erro: "Centro de custo não encontrado" };

  const orcamento = validado.data.orcamento ?? null;

  // Nó gerido (sistema, equipamento, raiz de obra) ou de nível 1: só orçamento.
  // Nó manual (etapa/item criado à mão): nome, código e orçamento.
  const atualizacao = no.nivel === 1 || noGerido(no)
    ? { orcamento }
    : {
        nome: validado.data.nome,
        codigo: validado.data.codigo?.trim() ? validado.data.codigo.trim() : null,
        orcamento,
      };

  const { error } = await supabase
    .from(TABELA)
    .update(atualizacao)
    .eq("id", idValido.data);

  if (error) {
    return { erro: "Não foi possível salvar. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * Ativa ou desativa um nó manual (etapa ou item criado à mão). Centro de obra,
 * de sistema ou gerado por equipamento não pode ser desativado. Sem exclusão
 * física: a baixa é sempre soft (campo ativo).
 */
export async function alternarAtivo(
  id: string,
  ativo: boolean,
): Promise<ResultadoAcao> {
  await exigirPermissao(RECURSO, "editar");

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Centro de custo inválido" };

  const supabase = await createClient();
  const no = await carregarNo(supabase, idValido.data);
  if (!no) return { erro: "Centro de custo não encontrado" };

  if (no.nivel === 1) {
    return { erro: "Centros não podem ser desativados aqui. São geridos pelo sistema" };
  }
  if (noGerido(no)) {
    return { erro: "Este nó é gerido pelo sistema e não pode ser desativado" };
  }

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

// ---------------------------------------------------------------------------
// Importação por planilha
// ---------------------------------------------------------------------------
//
// REGRA DA PLANILHA (pragmática): cada linha tem Centro, Etapa, Item (opcional)
// e Orcamento (opcional). O Centro deve ser o NOME de um centro de nível 1 que
// já existe (obra, escritório ou manutenção, criados pelo sistema). A linha:
//   - cria a Etapa (nível 2) sob esse centro, se ainda não existir pelo nome;
//   - se houver Item, cria o Item (nível 3) sob essa etapa, se ainda não
//     existir pelo nome. O Orcamento, quando informado, vai no nó mais
//     profundo da linha (Item se houver, senão Etapa).
// Nomes repetidos na própria planilha são reaproveitados (não duplicam). O
// Centro NÃO é criado pela importação: centros nascem de Obras ou são de
// sistema.

/** Linha esperada na planilha de importação de centros de custo. */
interface LinhaImportCentroCusto {
  centro: string;
  etapa: string;
  item?: string | null;
  orcamento?: number | null;
}

/** Converte o valor da célula em número (aceita vírgula decimal pt-BR). */
function normalizarOrcamento(valor: unknown): number {
  if (typeof valor === "number") return valor;
  const texto = String(valor).trim().replace(/\./g, "").replace(",", ".");
  const numero = Number(texto);
  if (Number.isNaN(numero)) {
    throw new Error("informe um valor numérico");
  }
  if (numero < 0) {
    throw new Error("o orçamento não pode ser negativo");
  }
  return numero;
}

/** Colunas da planilha de centros de custo. */
const COLUNAS_IMPORT: ColunaImportacao<LinhaImportCentroCusto>[] = [
  {
    chave: "centro",
    rotulo: "Centro",
    obrigatoria: true,
    exemplo: "Escritorio Central",
    transformar: (valor) => String(valor).trim(),
  },
  {
    chave: "etapa",
    rotulo: "Etapa",
    obrigatoria: true,
    exemplo: "Administrativo",
    transformar: (valor) => String(valor).trim(),
  },
  {
    chave: "item",
    rotulo: "Item",
    obrigatoria: false,
    exemplo: "Material de escritorio",
    transformar: (valor) => String(valor).trim(),
  },
  {
    chave: "orcamento",
    rotulo: "Orcamento",
    obrigatoria: false,
    exemplo: "15000,00",
    transformar: normalizarOrcamento,
  },
];

/** Lê o arquivo do formData. Lança se não houver arquivo. */
async function lerArquivo(formData: FormData): Promise<ArrayBuffer> {
  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File)) {
    throw new Error("Nenhum arquivo enviado");
  }
  return arquivo.arrayBuffer();
}

/** Valida a planilha de centros de custo e devolve o resumo da prévia. */
export async function validarImport(formData: FormData): Promise<{
  validas: number;
  invalidas: { linha: number; erros: string[] }[];
  totalLinhas: number;
}> {
  await exigirPermissao(RECURSO, "criar");

  const buffer = await lerArquivo(formData);
  const resultado = await lerEValidarXlsx<LinhaImportCentroCusto>(
    buffer,
    COLUNAS_IMPORT,
  );

  // Erro de negócio só checado na validação leve aqui (centro existente) é
  // resolvido na importação, que tem o estado do banco. Mantemos a prévia
  // estrutural (campos) e a verificação de centro acontece ao importar.
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
 * Importa as linhas válidas: cria etapas sob o centro nomeado e itens sob a
 * etapa. Resolve o centro pelo nome (nível 1 existente) e reaproveita etapas
 * e itens já existentes pelo nome.
 */
export async function importar(
  formData: FormData,
): Promise<{ importadas: number } | { erro: string }> {
  await exigirPermissao(RECURSO, "criar");

  let buffer: ArrayBuffer;
  try {
    buffer = await lerArquivo(formData);
  } catch {
    return { erro: "Nenhum arquivo enviado" };
  }

  const resultado = await lerEValidarXlsx<LinhaImportCentroCusto>(
    buffer,
    COLUNAS_IMPORT,
  );

  if (resultado.validas.length === 0) {
    return { erro: "Nenhuma linha válida para importar" };
  }

  const supabase = await createClient();

  // Índice dos centros de nível 1 existentes, por nome em minúsculas.
  const { data: centros, error: erroCentros } = await supabase
    .from(TABELA)
    .select("id, nome")
    .eq("nivel", 1);

  if (erroCentros) {
    return { erro: "Não foi possível ler os centros de custo. Tente novamente" };
  }

  const centroPorNome = new Map<string, string>();
  for (const centro of centros ?? []) {
    centroPorNome.set(centro.nome.trim().toLowerCase(), centro.id);
  }

  // Resolve TODOS os centros antes de inserir qualquer coisa. Como o supabase-js
  // não abre transação, validar o centro de cada linha primeiro evita abortar no
  // meio deixando parte da hierarquia gravada (importação não atômica).
  for (const linha of resultado.validas) {
    const nomeCentro = String(linha.dados.centro ?? "").trim();
    if (!centroPorNome.has(nomeCentro.toLowerCase())) {
      return {
        erro: `O centro "${nomeCentro}" não existe (linha ${linha.linha}). Centros nascem de Obras ou são de sistema; a planilha só cria etapas e itens.`,
      };
    }
  }

  // Caches de etapas e itens já existentes ou criados nesta importação.
  // Chave da etapa: `${centroId}::${nomeEtapaMinusculo}`.
  // Chave do item: `${etapaId}::${nomeItemMinusculo}`.
  // Os existentes no banco são carregados uma vez por pai e casados por nome
  // normalizado em memória (sem ILIKE, que trataria % e _ como curinga).
  const etapaPorChave = new Map<string, string>();
  const itemPorChave = new Map<string, string>();
  const paisCarregados = new Set<string>();

  /**
   * Carrega os filhos de um pai (nível 2 ou 3) uma única vez e indexa por nome
   * normalizado no cache. Propaga erro de leitura. Em irmãos homônimos mantém o
   * primeiro (a importação não cria duplicata; reaproveita um nó existente).
   */
  async function carregarFilhos(
    paiId: string,
    nivel: 2 | 3,
    cache: Map<string, string>,
  ): Promise<string | null> {
    if (paisCarregados.has(paiId)) return null;
    const { data, error } = await supabase
      .from(TABELA)
      .select("id, nome")
      .eq("pai_id", paiId)
      .eq("nivel", nivel);
    if (error) {
      return nivel === 2
        ? "Não foi possível ler as etapas existentes. Tente novamente"
        : "Não foi possível ler os itens existentes. Tente novamente";
    }
    for (const filho of data ?? []) {
      const chave = `${paiId}::${filho.nome.trim().toLowerCase()}`;
      if (!cache.has(chave)) cache.set(chave, filho.id);
    }
    paisCarregados.add(paiId);
    return null;
  }

  let importadas = 0;

  for (const linha of resultado.validas) {
    const dados = linha.dados;
    const nomeCentro = String(dados.centro ?? "").trim();
    const nomeEtapa = String(dados.etapa ?? "").trim();
    const nomeItem = dados.item ? String(dados.item).trim() : "";
    const orcamento =
      typeof dados.orcamento === "number" ? dados.orcamento : null;

    // centroId garantido pela pré-validação acima.
    const centroId = centroPorNome.get(nomeCentro.toLowerCase())!;

    // Resolve a etapa: cache (existentes + criados nesta rodada) ou cria.
    const erroEtapas = await carregarFilhos(centroId, 2, etapaPorChave);
    if (erroEtapas) return { erro: erroEtapas };

    const chaveEtapa = `${centroId}::${nomeEtapa.toLowerCase()}`;
    let etapaId = etapaPorChave.get(chaveEtapa);

    if (!etapaId) {
      const { data: etapaCriada, error: erroEtapa } = await supabase
        .from(TABELA)
        .insert({
          nome: nomeEtapa,
          pai_id: centroId,
          nivel: 2,
          tipo: null,
          sistema: false,
          orcamento: nomeItem ? null : orcamento,
          ativo: true,
        })
        .select("id")
        .single();

      if (erroEtapa || !etapaCriada) {
        return {
          erro: "Não foi possível importar as etapas. Tente novamente",
        };
      }
      etapaId = etapaCriada.id;
      etapaPorChave.set(chaveEtapa, etapaId);
      importadas += 1;
    }

    if (!nomeItem) continue;

    // Resolve o item: cache (existentes + criados nesta rodada) ou cria.
    const erroItens = await carregarFilhos(etapaId, 3, itemPorChave);
    if (erroItens) return { erro: erroItens };

    const chaveItem = `${etapaId}::${nomeItem.toLowerCase()}`;
    if (itemPorChave.has(chaveItem)) continue;

    const { data: itemCriado, error: erroItem } = await supabase
      .from(TABELA)
      .insert({
        nome: nomeItem,
        pai_id: etapaId,
        nivel: 3,
        tipo: null,
        sistema: false,
        orcamento,
        ativo: true,
      })
      .select("id")
      .single();

    if (erroItem || !itemCriado) {
      return { erro: "Não foi possível importar os itens. Tente novamente" };
    }
    itemPorChave.set(chaveItem, itemCriado.id);
    importadas += 1;
  }

  if (importadas === 0) {
    return { erro: "Nada novo para importar: etapas e itens já existem" };
  }

  revalidatePath(ROTA);
  return { importadas };
}
