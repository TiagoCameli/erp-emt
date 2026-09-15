import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { StatusLote } from "@/modules/rh/decimo-terceiro/schemas";

/** Lote de 13º na listagem. */
export interface LoteLista {
  id: string;
  ano: number;
  parcela: number;
  status: StatusLote;
  dataVencimento: string | null;
  valorBruto: number;
  valorDescontos: number;
  valorLiquido: number;
  quantidadePessoas: number;
}

/**
 * Uma linha do lote.
 *
 * `salarioBase`, `vinculo` e `dataAdmissao` são CONTEXTO: existem para quem
 * monta o lote decidir o valor olhando, e não entram em conta nenhuma. Os
 * números que valem são `valorBruto`, `valorInss` e `valorIrrf`, digitados, e
 * `valorLiquido`, que é a subtração dos três mantida por trigger no banco.
 */
export interface ItemDoLote {
  id: string;
  colaboradorId: string;
  colaboradorNome: string;
  vinculo: string;
  dataAdmissao: string | null;
  centroCustoId: string | null;
  centroCustoNome: string | null;
  centroCustoCodigo: string | null;
  salarioBase: number;
  valorBruto: number;
  valorInss: number;
  valorIrrf: number;
  valorLiquido: number;
  editadoManualmente: boolean;
  lancamentoId: string | null;
}

/** Lote com os itens, para a tela de detalhe. */
export interface LoteDetalhe extends LoteLista {
  motivoRejeicao: string | null;
  /** timestamptz, ou null enquanto não foi aprovado. */
  aprovadoEm: string | null;
  aprovadoPorNome: string | null;
  itens: ItemDoLote[];
}

/** Colaborador que pode ser acrescentado ao lote. */
export interface ColaboradorParaAdicionar {
  id: string;
  nome: string;
  vinculo: string;
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
      "id, ano, parcela, status, data_vencimento, valor_bruto, valor_descontos, valor_liquido, rh_decimo_terceiro_itens(count)",
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
 * Um lote com todos os itens. Devolve null quando não existe ou foi excluído,
 * e a página responde 404 a partir disso.
 */
export async function buscarLote(id: string): Promise<LoteDetalhe | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("rh_decimo_terceiro")
    .select(
      // O hint `!rh_decimo_terceiro_aprovado_por_fkey` NÃO é enfeite: esta
      // tabela tem TRÊS FKs para `usuarios` (aprovado_por, excluido_por e
      // created_by). Sem dizer qual, o PostgREST responde HTTP 300 por
      // ambiguidade e a tela inteira quebra — e isso passa no tsc, no lint e
      // no build, porque só falha em runtime contra o banco.
      `id, ano, parcela, status, data_vencimento,
       valor_bruto, valor_descontos, valor_liquido, motivo_rejeicao,
       aprovado_em,
       usuarios!rh_decimo_terceiro_aprovado_por_fkey(nome),
       rh_decimo_terceiro_itens(
         id, colaborador_id, centro_custo_id, salario_base,
         valor_bruto, valor_inss, valor_irrf, valor_liquido,
         editado_manualmente, lancamento_id,
         colaboradores(nome, vinculo, data_admissao),
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
      vinculo: item.colaboradores?.vinculo ?? "",
      dataAdmissao: item.colaboradores?.data_admissao ?? null,
      centroCustoId: item.centro_custo_id,
      centroCustoNome: item.centros_custo?.nome ?? null,
      centroCustoCodigo: item.centros_custo?.codigo ?? null,
      salarioBase: Number(item.salario_base),
      valorBruto: Number(item.valor_bruto),
      valorInss: Number(item.valor_inss),
      valorIrrf: Number(item.valor_irrf),
      valorLiquido: Number(item.valor_liquido),
      editadoManualmente: item.editado_manualmente,
      lancamentoId: item.lancamento_id,
    }))
    // A ordem vem do embed do PostgREST, que não a garante. Ordenar aqui,
    // porque a tela é preenchida linha a linha e lista que troca de ordem a
    // cada carregamento é impossível de conferir.
    .sort((a, b) => a.colaboradorNome.localeCompare(b.colaboradorNome, "pt-BR"));

  return {
    id: data.id,
    ano: data.ano,
    parcela: data.parcela,
    status: data.status as StatusLote,
    dataVencimento: data.data_vencimento,
    valorBruto: Number(data.valor_bruto),
    valorDescontos: Number(data.valor_descontos),
    valorLiquido: Number(data.valor_liquido),
    motivoRejeicao: data.motivo_rejeicao,
    aprovadoEm: data.aprovado_em,
    aprovadoPorNome: data.usuarios?.nome ?? null,
    quantidadePessoas: itens.length,
    itens,
  };
}

/**
 * Colaboradores ativos que NÃO estão neste lote, para o "Adicionar".
 *
 * A lista existe porque não há "regerar": regerar apagaria tudo que foi
 * digitado. Quem foi tirado do lote, e quem foi contratado depois de o lote
 * ter sido criado, voltam por aqui.
 */
export async function listarColaboradoresForaDoLote(
  loteId: string,
): Promise<ColaboradorParaAdicionar[]> {
  const supabase = await createClient();

  const [ativos, noLote] = await Promise.all([
    supabase
      .from("colaboradores")
      .select("id, nome, vinculo")
      .eq("ativo", true)
      .in("vinculo", ["clt", "terceiro", "diarista"])
      .order("nome"),
    supabase
      .from("rh_decimo_terceiro_itens")
      .select("colaborador_id")
      .eq("decimo_terceiro_id", loteId),
  ]);

  if (ativos.error || noLote.error) {
    throw new Error("Não foi possível carregar os colaboradores");
  }

  const dentro = new Set((noLote.data ?? []).map((i) => i.colaborador_id));

  return (ativos.data ?? [])
    .filter((c) => !dentro.has(c.id))
    .map((c) => ({ id: c.id, nome: c.nome, vinculo: c.vinculo }));
}

/**
 * Existe provisão de 13º ativa na folha?
 *
 * Se existir, a folha mensal já soma um percentual do salário ao custo, e
 * pagar o 13º aqui conta o custo uma segunda vez. O abatimento da provisão
 * está fora do escopo, então o que resta é avisar antes de aprovar.
 *
 * O casamento é por nome porque `folha_provisoes` é cadastro livre.
 */
export async function temProvisaoDe13Ativa(): Promise<boolean> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("folha_provisoes")
    .select("nome")
    .eq("ativo", true);

  if (error) {
    // Aviso que não carrega não pode derrubar a tela do lote.
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
