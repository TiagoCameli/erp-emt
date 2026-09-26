import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";

import type { LinhaAnterior } from "./casamento";

/**
 * Leitura da planilha contratual. A RLS já filtra pela lista do contrato (D3): versão fora da
 * lista volta null, e a tela responde 404.
 *
 * PRECISÃO: o PostgREST devolve `numeric` como NÚMERO de JSON, e o JSON.parse do cliente corta o
 * que passa do double. Preço unitário e quantidade prevista são lidos SEMPRE como texto
 * (`coluna::text` no select), para a casa escondida do xlsx chegar à tela e ao casamento do
 * aditivo exatamente como está no banco. Valor e total (2 casas, calculados no banco) podem vir
 * como número: só são exibidos pelo MoneyText, nenhuma conta sai deles.
 */

export interface VersaoLista {
  id: string;
  numero: number;
  status: string;
  vigenteDesde: string;
  aditivoId: string | null;
  aditivoNumero: number | null;
  arquivoNome: string | null;
  motivo: string | null;
  totalPrevisto: number | null;
  excluidoEm: string | null;
  motivoExclusao: string | null;
}

function numeroOuNulo(valor: number | string | null | undefined): number | null {
  return valor === null || valor === undefined ? null : Number(valor);
}

async function numerosDosAditivos(contratoId: string): Promise<Map<string, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("mc_aditivos").select("id, numero").eq("contrato_id", contratoId);
  if (error) throw error;
  return new Map((data ?? []).map((a) => [a.id, a.numero]));
}

export async function listarVersoes(contratoId: string, lixeira = false): Promise<VersaoLista[]> {
  const supabase = await createClient();
  let q = supabase
    .from("mc_planilha_versoes")
    .select("id, numero, status, vigente_desde, aditivo_id, arquivo_nome, motivo, excluido_em, motivo_exclusao")
    .eq("contrato_id", contratoId)
    .order("numero");
  q = lixeira ? q.not("excluido_em", "is", null) : q.is("excluido_em", null);
  const { data, error } = await q;
  if (error) throw error;
  const versoes = data ?? [];
  if (versoes.length === 0) return [];

  const [totais, aditivos] = await Promise.all([
    supabase.from("mc_v_versao_totais").select("versao_id, total_previsto").in("versao_id", versoes.map((v) => v.id)),
    numerosDosAditivos(contratoId),
  ]);
  if (totais.error) throw totais.error;
  const totalPorVersao = new Map((totais.data ?? []).map((t) => [t.versao_id, t.total_previsto]));

  return versoes.map((v) => ({
    id: v.id,
    numero: v.numero,
    status: v.status,
    vigenteDesde: v.vigente_desde,
    aditivoId: v.aditivo_id,
    aditivoNumero: v.aditivo_id ? (aditivos.get(v.aditivo_id) ?? null) : null,
    arquivoNome: v.arquivo_nome,
    motivo: v.motivo,
    totalPrevisto: numeroOuNulo(totalPorVersao.get(v.id)),
    excluidoEm: v.excluido_em,
    motivoExclusao: v.motivo_exclusao,
  }));
}

/** Aditivos do contrato que mudam a planilha e ainda não têm versão (os que a RPC aceita). */
export async function aditivosSemVersao(contratoId: string): Promise<{ id: string; numero: number; motivo: string }[]> {
  const supabase = await createClient();
  const [aditivos, versoes] = await Promise.all([
    supabase
      .from("mc_aditivos")
      .select("id, numero, motivo, tipos")
      .eq("contrato_id", contratoId)
      .is("excluido_em", null)
      .order("numero"),
    supabase.from("mc_planilha_versoes").select("aditivo_id").eq("contrato_id", contratoId).is("excluido_em", null),
  ]);
  if (aditivos.error) throw aditivos.error;
  if (versoes.error) throw versoes.error;
  const usados = new Set((versoes.data ?? []).map((v) => v.aditivo_id).filter((id): id is string => id !== null));
  const mudamPlanilha = ["quantidade", "valor", "inclusao_item"];
  return (aditivos.data ?? [])
    .filter((a) => !usados.has(a.id) && a.tipos.some((t) => mudamPlanilha.includes(t)))
    .map((a) => ({ id: a.id, numero: a.numero, motivo: a.motivo }));
}

export interface LinhaDaVersao {
  id: string;
  ordem: number;
  codigo: string;
  paiId: string | null;
  nivel: number;
  descricao: string;
  unidade: string | null;
  tipo: "titulo" | "servico";
  /** Texto do numeric COMPLETO, como está no banco. */
  precoUnitario: string | null;
  /** Texto do numeric COMPLETO, como está no banco. */
  quantidadePrevista: string | null;
  /** Serviço: o valor da linha. Título: o total da subárvore. Null sem regra de arredondamento. */
  valorPrevisto: number | null;
}

export async function carregarVersao(versaoId: string) {
  const supabase = await createClient();
  const { data: versao, error } = await supabase
    .from("mc_planilha_versoes")
    .select(
      "id, contrato_id, numero, status, vigente_desde, aditivo_id, arquivo_nome, arquivo_hash, motivo, motivo_desaprovacao, aprovada_em, excluido_em, motivo_exclusao",
    )
    .eq("id", versaoId)
    .maybeSingle();
  if (error) throw error;
  if (!versao) return null;

  const [contrato, linhas, totais, totalVersao, aditivos] = await Promise.all([
    supabase.from("mc_contratos").select("id, codigo, nome_obra, regra_arredondamento").eq("id", versao.contrato_id).maybeSingle(),
    todasAsLinhas((de, ate) =>
      supabase
        .from("mc_v_planilha_linhas")
        .select(
          "id, ordem, codigo, pai_id, nivel, descricao, unidade, tipo, valor_previsto, preco_unitario:preco_unitario::text, quantidade_prevista:quantidade_prevista::text",
        )
        .eq("versao_id", versaoId)
        .order("ordem")
        .range(de, ate),
    ),
    todasAsLinhas((de, ate) =>
      supabase.from("mc_v_planilha_totais").select("id, total_previsto").eq("versao_id", versaoId).order("id").range(de, ate),
    ),
    supabase.from("mc_v_versao_totais").select("total_previsto").eq("versao_id", versaoId).maybeSingle(),
    versao.aditivo_id ? numerosDosAditivos(versao.contrato_id) : Promise.resolve(new Map<string, number>()),
  ]);
  if (contrato.error) throw contrato.error;
  if (!contrato.data) return null;
  if (linhas.erro) throw new Error(linhas.erro);
  if (totais.erro) throw new Error(totais.erro);
  if (totalVersao.error) throw totalVersao.error;

  const totalPorLinha = new Map(totais.linhas.map((t) => [t.id, t.total_previsto]));
  const linhasDaVersao: LinhaDaVersao[] = linhas.linhas.map((l) => ({
    id: l.id ?? "",
    ordem: l.ordem ?? 0,
    codigo: l.codigo ?? "",
    paiId: l.pai_id,
    nivel: l.nivel ?? 1,
    descricao: l.descricao ?? "",
    unidade: l.unidade,
    tipo: l.tipo === "titulo" ? "titulo" : "servico",
    precoUnitario: l.preco_unitario,
    quantidadePrevista: l.quantidade_prevista,
    valorPrevisto: numeroOuNulo(l.tipo === "titulo" ? totalPorLinha.get(l.id ?? "") : l.valor_previsto),
  }));

  return {
    versao: {
      id: versao.id,
      contratoId: versao.contrato_id,
      numero: versao.numero,
      status: versao.status,
      vigenteDesde: versao.vigente_desde,
      aditivoNumero: versao.aditivo_id ? (aditivos.get(versao.aditivo_id) ?? null) : null,
      arquivoNome: versao.arquivo_nome,
      arquivoHash: versao.arquivo_hash,
      motivo: versao.motivo,
      motivoDesaprovacao: versao.motivo_desaprovacao,
      aprovadaEm: versao.aprovada_em,
      excluidoEm: versao.excluido_em,
      motivoExclusao: versao.motivo_exclusao,
    },
    contrato: {
      id: contrato.data.id,
      codigo: contrato.data.codigo,
      nomeObra: contrato.data.nome_obra,
      regraArredondamento: contrato.data.regra_arredondamento,
    },
    linhas: linhasDaVersao,
    totalPrevisto: numeroOuNulo(totalVersao.data?.total_previsto),
  };
}

export type VersaoCarregada = NonNullable<Awaited<ReturnType<typeof carregarVersao>>>;

export async function carregarVersaoParaImportar(
  versaoId: string,
): Promise<{ id: string; contratoId: string; numero: number; status: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mc_planilha_versoes")
    .select("id, contrato_id, numero, status")
    .eq("id", versaoId)
    .is("excluido_em", null)
    .maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, contratoId: data.contrato_id, numero: data.numero, status: data.status } : null;
}

export function ehXlsx(nome: string): boolean {
  return nome.trim().toLowerCase().endsWith(".xlsx");
}

/**
 * O xlsx MAIS RECENTE anexado à versão. Remover anexo pede `editar`, que a planilha não tem;
 * por isso vale sempre o último enviado (os anteriores ficam como histórico).
 */
export async function arquivoDaVersao(versaoId: string): Promise<{ path: string; nome: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("anexo_vinculos")
    .select("id, created_at, arquivos(path_storage, nome_original)")
    .eq("entidade_tipo", "mc_planilha_versao")
    .eq("entidade_id", versaoId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw error;
  for (const v of data ?? []) {
    const arquivo = v.arquivos as { path_storage: string; nome_original: string } | null;
    if (arquivo && ehXlsx(arquivo.nome_original)) return { path: arquivo.path_storage, nome: arquivo.nome_original };
  }
  return null;
}

/**
 * Linhas da versão `numero - 1` do contrato, para casar os itens do aditivo. Preço e quantidade
 * em TEXTO (ver o comentário do topo): o casamento compara decimal exato, e um double cortado
 * transformaria "igual" em "mudou o preço". Null quando a versão anterior não existe.
 */
export async function linhasDaVersaoAnterior(contratoId: string, numero: number): Promise<LinhaAnterior[] | null> {
  const supabase = await createClient();
  const { data: anterior, error } = await supabase
    .from("mc_planilha_versoes")
    .select("id")
    .eq("contrato_id", contratoId)
    .eq("numero", numero - 1)
    .is("excluido_em", null)
    .maybeSingle();
  if (error) throw error;
  // Sem a versão anterior não há com o que casar: quem chama recusa (nunca vira "tudo novo").
  if (!anterior) return null;

  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("mc_planilha_itens")
      .select("item_id, codigo, descricao, unidade, tipo, preco_unitario:preco_unitario::text, quantidade_prevista:quantidade_prevista::text")
      .eq("versao_id", anterior.id)
      .order("ordem")
      .range(de, ate),
  );
  if (erro) throw new Error(erro);
  return linhas.map((l) => ({
    itemId: l.item_id,
    codigo: l.codigo,
    descricao: l.descricao,
    unidade: l.unidade,
    tipo: l.tipo === "titulo" ? "titulo" : "servico",
    precoUnitario: l.preco_unitario,
    quantidadePrevista: l.quantidade_prevista,
  }));
}
