"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  criarGrupoSchema,
  criarItemSchema,
  editarGrupoSchema,
  editarItemSchema,
  type CriarGrupoInput,
  type CriarItemInput,
  type EditarGrupoInput,
  type EditarItemInput,
} from "@/modules/cadastros/orcamentos/schemas";

const RECURSO = "cadastros.orcamentos" as const;
const ROTA = "/cadastros/orcamentos";
const TABELA = "orcamento_itens" as const;

export type ResultadoAcao = { ok: true } | { erro: string };

const uuidSchema = z.uuid();

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Texto opcional já aparado; "" vira null pra não gravar string vazia. */
function ouNulo(valor: string | undefined): string | null {
  const limpo = valor?.trim();
  return limpo ? limpo : null;
}

/**
 * Próximo índice e ordem para um novo filho de `parentId` (ou raiz, quando
 * null) no orçamento. Índice segue o pai: "1.3" vira "1.3.{n+1}"; na raiz é só
 * "{n+1}". Ordem é o máximo do orçamento + 1, pra cair no fim do grupo.
 */
async function proximoIndiceEOrdem(
  supabase: Supabase,
  orcamentoId: string,
  parentId: string | null,
): Promise<{ indice: string; ordem: number }> {
  let prefixo = "";
  if (parentId) {
    const { data: pai } = await supabase
      .from(TABELA)
      .select("indice")
      .eq("id", parentId)
      .maybeSingle();
    prefixo = pai?.indice ? `${pai.indice}.` : "";
  }

  // Conta os irmãos (mesmo pai, ou raízes quando sem pai) pra numerar o índice.
  const consultaIrmaos = supabase
    .from(TABELA)
    .select("id", { count: "exact", head: true })
    .eq("orcamento_id", orcamentoId);
  const { count } = parentId
    ? await consultaIrmaos.eq("parent_id", parentId)
    : await consultaIrmaos.is("parent_id", null);
  const contagem = count ?? 0;

  const { data: maxOrdem } = await supabase
    .from(TABELA)
    .select("ordem")
    .eq("orcamento_id", orcamentoId)
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    indice: `${prefixo}${contagem + 1}`,
    ordem: (maxOrdem?.ordem ?? 0) + 1,
  };
}

/** Lê id, orcamento_id e parent_id de um item. Null quando não existe. */
async function carregarItem(
  supabase: Supabase,
  id: string,
): Promise<{ id: string; orcamento_id: string; parent_id: string | null } | null> {
  const { data } = await supabase
    .from(TABELA)
    .select("id, orcamento_id, parent_id")
    .eq("id", id)
    .maybeSingle();
  return data;
}

/**
 * Cria um grupo (etapa na raiz, subetapa sob um pai). Sem valores: o total
 * do grupo é a soma dos filhos, calculada pela trigger do banco.
 */
export async function criarGrupo(dados: CriarGrupoInput): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "criar");
  } catch {
    return { erro: "Sem permissão para editar orçamentos" };
  }

  const validado = criarGrupoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }
  const { orcamentoId, parentId, tipo, descricao, indice, codigo } =
    validado.data;

  if (tipo === "etapa" && parentId !== null) {
    return { erro: "Etapas ficam na raiz do orçamento" };
  }
  if (tipo === "subetapa" && parentId === null) {
    return { erro: "Subetapas precisam de uma etapa acima" };
  }

  const supabase = await createClient();

  if (parentId) {
    const pai = await carregarItem(supabase, parentId);
    if (!pai || pai.orcamento_id !== orcamentoId) {
      return { erro: "Item pai não encontrado" };
    }
  }

  const auto = await proximoIndiceEOrdem(supabase, orcamentoId, parentId);

  const { error } = await supabase.from(TABELA).insert({
    orcamento_id: orcamentoId,
    parent_id: parentId,
    tipo,
    descricao: descricao.trim(),
    indice: ouNulo(indice) ?? auto.indice,
    codigo: ouNulo(codigo),
    ordem: auto.ordem,
  });

  if (error) {
    return { erro: "Não foi possível criar. Tente novamente" };
  }

  revalidatePath(`${ROTA}/${orcamentoId}`);
  return { ok: true };
}

/** Cria um item folha sob um pai, com quantidade, custo unitário e BDI. */
export async function criarItem(dados: CriarItemInput): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "criar");
  } catch {
    return { erro: "Sem permissão para editar orçamentos" };
  }

  const validado = criarItemSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }
  const {
    orcamentoId,
    parentId,
    descricao,
    unidade,
    quantidade,
    custoUnitario,
    bdi,
    indice,
    codigo,
  } = validado.data;

  const supabase = await createClient();

  const pai = await carregarItem(supabase, parentId);
  if (!pai || pai.orcamento_id !== orcamentoId) {
    return { erro: "Item pai não encontrado" };
  }

  const auto = await proximoIndiceEOrdem(supabase, orcamentoId, parentId);

  const { error } = await supabase.from(TABELA).insert({
    orcamento_id: orcamentoId,
    parent_id: parentId,
    tipo: "item",
    descricao: descricao.trim(),
    unidade: ouNulo(unidade),
    quantidade: quantidade ?? null,
    custo_unitario: custoUnitario ?? null,
    bdi: bdi ?? null,
    indice: ouNulo(indice) ?? auto.indice,
    codigo: ouNulo(codigo),
    ordem: auto.ordem,
    // preco_unitario, custo_total e preco_total são calculados pela trigger.
  });

  if (error) {
    return { erro: "Não foi possível criar o item. Tente novamente" };
  }

  revalidatePath(`${ROTA}/${orcamentoId}`);
  return { ok: true };
}

/** Edita um grupo (etapa/subetapa): só descrição, índice e código. */
export async function editarGrupo(
  id: string,
  dados: EditarGrupoInput,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para editar orçamentos" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Item inválido" };

  const validado = editarGrupoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const item = await carregarItem(supabase, idValido.data);
  if (!item) return { erro: "Item não encontrado" };

  const { error } = await supabase
    .from(TABELA)
    .update({
      descricao: validado.data.descricao.trim(),
      indice: ouNulo(validado.data.indice),
      codigo: ouNulo(validado.data.codigo),
    })
    .eq("id", idValido.data);

  if (error) {
    return { erro: "Não foi possível salvar. Tente novamente" };
  }

  revalidatePath(`${ROTA}/${item.orcamento_id}`);
  return { ok: true };
}

/** Edita um item folha: descrição + os campos do cálculo (a trigger recalcula). */
export async function editarItem(
  id: string,
  dados: EditarItemInput,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para editar orçamentos" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Item inválido" };

  const validado = editarItemSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const item = await carregarItem(supabase, idValido.data);
  if (!item) return { erro: "Item não encontrado" };

  const { error } = await supabase
    .from(TABELA)
    .update({
      descricao: validado.data.descricao.trim(),
      unidade: ouNulo(validado.data.unidade),
      quantidade: validado.data.quantidade ?? null,
      custo_unitario: validado.data.custoUnitario ?? null,
      bdi: validado.data.bdi ?? null,
      indice: ouNulo(validado.data.indice),
      codigo: ouNulo(validado.data.codigo),
    })
    .eq("id", idValido.data);

  if (error) {
    return { erro: "Não foi possível salvar. Tente novamente" };
  }

  revalidatePath(`${ROTA}/${item.orcamento_id}`);
  return { ok: true };
}

/** Exclui um item da árvore. Os filhos caem em cascata (FK). */
export async function excluirItem(id: string): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "excluir");
  } catch {
    return { erro: "Sem permissão para excluir itens" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Item inválido" };

  const supabase = await createClient();
  const item = await carregarItem(supabase, idValido.data);
  if (!item) return { erro: "Item não encontrado" };

  const { error } = await supabase
    .from(TABELA)
    .delete()
    .eq("id", idValido.data);

  if (error) {
    return { erro: "Não foi possível excluir. Tente novamente" };
  }

  revalidatePath(`${ROTA}/${item.orcamento_id}`);
  return { ok: true };
}

/** Exclui um orçamento (os itens caem em cascata pela FK). */
export async function excluir(id: string): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "excluir");
  } catch {
    return { erro: "Sem permissão para excluir orçamentos" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Orçamento inválido" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("orcamentos")
    .delete()
    .eq("id", idValido.data);

  if (error) {
    return { erro: "Não foi possível excluir o orçamento. Tente novamente" };
  }

  revalidatePath(ROTA);
  return { ok: true };
}
