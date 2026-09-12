import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { StatusLote } from "@/modules/rh/decimo-terceiro/schemas";

/** Lote de 13º na listagem. */
export interface LoteLista {
  id: string;
  ano: number;
  parcela: number;
  /** Fração (0,5), como o banco guarda. A tela multiplica por 100 para exibir. */
  percentual: number;
  comDesconto: boolean;
  status: StatusLote;
  dataVencimento: string | null;
  valorBruto: number;
  valorDescontos: number;
  valorLiquido: number;
  quantidadePessoas: number;
}

/** Uma linha do lote: o 13º de um colaborador. */
export interface ItemDoLote {
  id: string;
  colaboradorId: string;
  colaboradorNome: string;
  centroCustoId: string | null;
  centroCustoNome: string | null;
  centroCustoCodigo: string | null;
  salarioBase: number;
  avos: number;
  valorBruto: number;
  /** O BRUTO já pago na 1ª parcela. Zero na 1ª. */
  valorJaPago: number;
  valorInss: number;
  valorIrrf: number;
  valorLiquido: number;
  editadoManualmente: boolean;
  lancamentoId: string | null;
}

/** Lote com os itens, para a tela de detalhe. */
export interface LoteDetalhe extends LoteLista {
  motivoRejeicao: string | null;
  itens: ItemDoLote[];
}

/** CLT ativo que NÃO entra no lote, com o motivo. */
export interface ForaDoLote {
  colaboradorId: string;
  colaboradorNome: string;
  motivo: string;
}

/**
 * Lotes de 13º, do mais recente para o mais antigo. Lote excluído não aparece.
 * São poucas linhas por ano (duas parcelas), então não há paginação.
 */
export async function listarLotes(): Promise<LoteLista[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("rh_decimo_terceiro")
    .select(
      "id, ano, parcela, percentual, com_desconto, status, data_vencimento, valor_bruto, valor_descontos, valor_liquido, rh_decimo_terceiro_itens(count)",
    )
    .is("excluido_em", null)
    .order("ano", { ascending: false })
    .order("parcela", { ascending: false });

  if (error) {
    throw new Error("Não foi possível carregar os lotes de 13º");
  }

  return (data ?? []).map((linha) => ({
    id: linha.id,
    ano: linha.ano,
    parcela: linha.parcela,
    percentual: Number(linha.percentual),
    comDesconto: linha.com_desconto,
    status: linha.status as StatusLote,
    dataVencimento: linha.data_vencimento,
    valorBruto: Number(linha.valor_bruto),
    valorDescontos: Number(linha.valor_descontos),
    valorLiquido: Number(linha.valor_liquido),
    // O embed de `count` volta como [{ count: n }]; lote sem item volta [].
    quantidadePessoas: linha.rh_decimo_terceiro_itens?.[0]?.count ?? 0,
  }));
}

/**
 * Um lote com todos os itens, para a tela de detalhe. Devolve null quando não
 * existe ou foi excluído, e a página responde 404 a partir disso.
 */
export async function buscarLote(id: string): Promise<LoteDetalhe | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("rh_decimo_terceiro")
    .select(
      `id, ano, parcela, percentual, com_desconto, status, data_vencimento,
       valor_bruto, valor_descontos, valor_liquido, motivo_rejeicao,
       rh_decimo_terceiro_itens(
         id, colaborador_id, centro_custo_id, salario_base, avos,
         valor_bruto, valor_ja_pago, valor_inss, valor_irrf, valor_liquido,
         editado_manualmente, lancamento_id,
         colaboradores(nome),
         centros_custo(nome, codigo)
       )`,
    )
    .eq("id", id)
    .is("excluido_em", null)
    .maybeSingle();

  if (error) {
    throw new Error("Não foi possível carregar o lote de 13º");
  }
  if (!data) return null;

  const itens: ItemDoLote[] = (data.rh_decimo_terceiro_itens ?? [])
    .map((item) => ({
      id: item.id,
      colaboradorId: item.colaborador_id,
      colaboradorNome: item.colaboradores?.nome ?? "",
      centroCustoId: item.centro_custo_id,
      centroCustoNome: item.centros_custo?.nome ?? null,
      centroCustoCodigo: item.centros_custo?.codigo ?? null,
      salarioBase: Number(item.salario_base),
      avos: item.avos,
      valorBruto: Number(item.valor_bruto),
      valorJaPago: Number(item.valor_ja_pago),
      valorInss: Number(item.valor_inss),
      valorIrrf: Number(item.valor_irrf),
      valorLiquido: Number(item.valor_liquido),
      editadoManualmente: item.editado_manualmente,
      lancamentoId: item.lancamento_id,
    }))
    // A ordem vem do embed do PostgREST, que não a garante. Ordenar aqui,
    // porque a tela é conferida linha a linha e lista que troca de ordem a
    // cada carregamento é inconferível.
    .sort((a, b) => a.colaboradorNome.localeCompare(b.colaboradorNome, "pt-BR"));

  return {
    id: data.id,
    ano: data.ano,
    parcela: data.parcela,
    percentual: Number(data.percentual),
    comDesconto: data.com_desconto,
    status: data.status as StatusLote,
    dataVencimento: data.data_vencimento,
    valorBruto: Number(data.valor_bruto),
    valorDescontos: Number(data.valor_descontos),
    valorLiquido: Number(data.valor_liquido),
    motivoRejeicao: data.motivo_rejeicao,
    quantidadePessoas: itens.length,
    itens,
  };
}

/**
 * CLT ativo que a geração do lote deixa de fora, com o motivo.
 *
 * Hoje o motivo é um só: sem `data_admissao` não há como contar avos, e
 * `fn_rescisao_avos_13` devolveria 0. A tela mostra esta lista para o furo ser
 * visível: pagar R$ 0,00 calado é pior do que não pagar.
 */
export async function listarForaDoLote(): Promise<ForaDoLote[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("colaboradores")
    .select("id, nome")
    .eq("ativo", true)
    .eq("vinculo", "clt")
    .is("data_admissao", null)
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar quem ficou fora do lote");
  }

  return (data ?? []).map((linha) => ({
    colaboradorId: linha.id,
    colaboradorNome: linha.nome,
    motivo: "Sem data de admissão no cadastro",
  }));
}

/**
 * Existe provisão de 13º ativa na folha?
 *
 * Se existir, a folha mensal já soma um percentual do salário ao custo, e
 * pagar o 13º aqui conta o custo uma segunda vez. O abatimento da provisão
 * está fora do escopo deste bloco (ver a spec), então o que resta é avisar
 * antes de aprovar.
 *
 * O casamento é por nome porque `folha_provisoes` é cadastro livre: o Tiago
 * digita o nome da provisão. Pega "13º", "13o", "13" e "décimo terceiro".
 */
export async function temProvisaoDe13Ativa(): Promise<boolean> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("folha_provisoes")
    .select("nome")
    .eq("ativo", true);

  if (error) {
    // Aviso que não carrega não pode derrubar a tela de gerar o lote.
    return false;
  }

  return (data ?? []).some((linha) => {
    const nome = linha.nome
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
    return nome.includes("13") || nome.includes("decimo terceiro");
  });
}
