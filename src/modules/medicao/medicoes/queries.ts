import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  STATUS_MEDICAO,
  type ReajusteTipo,
  type StatusMedicao,
} from "@/modules/medicao/_shared/formato";

/** Tamanho padrão de página da listagem de medições. */
export const TAMANHO_PADRAO = 25;

/** Linha da listagem de medições, com os nomes da obra já resolvidos. */
export interface MedicaoLista {
  id: string;
  numero: string | null;
  obraNome: string;
  obraLote: string | null;
  competencia: string;
  status: StatusMedicao;
  /** Valor total fechado na aprovação. Null/0 para rascunho ou cancelada. */
  valorTotal: number;
}

/** Página da listagem: itens da página + total geral (count exact). */
export interface MedicoesPagina {
  itens: MedicaoLista[];
  total: number;
}

/**
 * Item da medição com a previsão do acumulado e do valor calculados. O atual é
 * a quantidade lançada nesta medição; o anterior soma as quantidades do mesmo
 * item em OUTRAS medições aprovadas. Tudo derivado, nunca persistido no item.
 */
export interface ItemMedido {
  id: string;
  planilhaItemId: string;
  codigo: string | null;
  descricao: string;
  unidadeSigla: string | null;
  quantidadeContratada: number;
  precoUnitario: number;
  memoriaCalculo: string | null;
  /** Soma do item em outras medições aprovadas. */
  acumuladoAnterior: number;
  /** Quantidade lançada nesta medição. */
  atual: number;
  /** acumuladoAnterior + atual. */
  acumuladoTotal: number;
  /** quantidade_contratada - acumuladoTotal. */
  saldo: number;
  /** atual * preco_unitario. */
  valor: number;
}

/**
 * Item da planilha ainda não medido nesta medição, oferecido no seletor de
 * "adicionar item". Traz o acumulado anterior e o saldo disponível para que o
 * formulário possa validar a quantidade antes de salvar.
 */
export interface ItemDisponivel {
  planilhaItemId: string;
  codigo: string | null;
  descricao: string;
  unidadeSigla: string | null;
  quantidadeContratada: number;
  precoUnitario: number;
  acumuladoAnterior: number;
  /** quantidade_contratada - acumuladoAnterior. */
  saldoDisponivel: number;
}

/** Medição completa para o detalhe: cabeçalho + itens medidos + disponíveis. */
export interface MedicaoDetalhe {
  id: string;
  numero: string | null;
  obraId: string;
  obraNome: string;
  obraLote: string | null;
  planilhaId: string;
  planilhaNome: string | null;
  competencia: string;
  descricao: string | null;
  status: StatusMedicao;
  reajusteTipo: ReajusteTipo;
  reajusteValor: number;
  valorBruto: number;
  valorReajuste: number;
  valorTotal: number;
  dataAprovacao: string | null;
  motivoCancelamento: string | null;
  /** Itens lançados nesta medição, com a previsão calculada. */
  itens: ItemMedido[];
  /** Itens da planilha ainda não medidos aqui (para o seletor de adicionar). */
  disponiveis: ItemDisponivel[];
}

/** Cabeçalho da planilha de uma obra e seus itens, para o create. */
export interface PlanilhaItemOpcao {
  id: string;
  codigo: string | null;
  descricao: string;
  unidadeSigla: string | null;
  quantidadeContratada: number;
  precoUnitario: number;
}

export interface PlanilhaDaObra {
  planilhaId: string;
  planilhaNome: string;
  itens: PlanilhaItemOpcao[];
}

/** Normaliza o status do banco (texto livre) para o domínio conhecido. */
function normalizarStatus(status: string): StatusMedicao {
  return status in STATUS_MEDICAO ? (status as StatusMedicao) : "rascunho";
}

/** Normaliza o tipo de reajuste do banco para o domínio conhecido. */
function normalizarReajuste(tipo: string): ReajusteTipo {
  if (tipo === "percentual" || tipo === "valor") return tipo;
  return "nenhum";
}

export interface ListarMedicoesParams {
  pagina: number;
  tamanho: number;
  status?: string;
  obraId?: string;
}

/**
 * Lista as medições com paginação server-side (range + count exact), nome e
 * lote da obra via embed. Ordena por competência (desc) e, dentro da mesma
 * competência, pela criação mais recente. Filtros opcionais por status e obra.
 */
export async function listarMedicoes(
  params: ListarMedicoesParams,
): Promise<MedicoesPagina> {
  const supabase = await createClient();

  const pagina = Math.max(0, params.pagina);
  const tamanho = Math.max(1, params.tamanho);
  const de = pagina * tamanho;
  const ate = de + tamanho - 1;

  let consulta = supabase
    .from("medicoes")
    .select(
      `id, numero, competencia, status, valor_total, obras(nome, lote)`,
      { count: "exact" },
    )
    .order("competencia", { ascending: false })
    .order("created_at", { ascending: false })
    .range(de, ate);

  if (params.status) consulta = consulta.eq("status", params.status);
  if (params.obraId) consulta = consulta.eq("obra_id", params.obraId);

  const { data, error, count } = await consulta;

  if (error) throw new Error("Não foi possível carregar as medições");

  const itens: MedicaoLista[] = (data ?? []).map((medicao) => ({
    id: medicao.id,
    numero: medicao.numero,
    obraNome: medicao.obras?.nome ?? "Obra removida",
    obraLote: medicao.obras?.lote ?? null,
    competencia: medicao.competencia,
    status: normalizarStatus(medicao.status),
    valorTotal: medicao.valor_total,
  }));

  return { itens, total: count ?? 0 };
}

interface ItemPlanilhaRow {
  id: string;
  codigo: string | null;
  descricao: string;
  quantidade_contratada: number;
  preco_unitario: number;
  unidades_medida: { sigla: string } | null;
}

/**
 * Soma, por planilha_item, as quantidades medidas em medições aprovadas,
 * opcionalmente excluindo uma medição (a atual). Uma busca só, agregada num
 * Map em memória, sem N+1.
 */
async function acumuladoAnteriorPorItem(
  supabase: Awaited<ReturnType<typeof createClient>>,
  idsItens: string[],
  excluirMedicaoId?: string,
): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  if (idsItens.length === 0) return mapa;

  const { data, error } = await supabase
    .from("medicao_itens")
    .select("planilha_item_id, quantidade, medicao_id, medicoes!inner(status)")
    .in("planilha_item_id", idsItens)
    .eq("medicoes.status", "aprovada");

  if (error) {
    throw new Error("Não foi possível calcular o acumulado anterior");
  }

  for (const linha of data ?? []) {
    if (excluirMedicaoId && linha.medicao_id === excluirMedicaoId) continue;
    mapa.set(
      linha.planilha_item_id,
      (mapa.get(linha.planilha_item_id) ?? 0) + linha.quantidade,
    );
  }

  return mapa;
}

/**
 * Medição completa para o detalhe. Cabeçalho com obra e planilha via embed; os
 * itens lançados com a previsão (anterior/atual/total/saldo/valor) calculada;
 * e os itens da planilha ainda não medidos aqui, para o seletor de adicionar.
 * O acumulado anterior vem de uma agregação por planilha_item, sem N+1.
 * Retorna null se não achar.
 */
export async function buscarMedicao(
  id: string,
): Promise<MedicaoDetalhe | null> {
  const supabase = await createClient();

  const { data: medicao, error } = await supabase
    .from("medicoes")
    .select(
      `id, numero, obra_id, planilha_id, competencia, descricao, status,
       reajuste_tipo, reajuste_valor, valor_bruto, valor_reajuste, valor_total,
       data_aprovacao, motivo_cancelamento,
       obras(nome, lote),
       planilhas_contratuais(nome)`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !medicao) return null;

  // Todos os itens da planilha da obra (base para medidos e disponíveis).
  const { data: itensPlanilhaRaw, error: erroItens } = await supabase
    .from("planilha_itens")
    .select(
      "id, codigo, descricao, quantidade_contratada, preco_unitario, ordem, unidades_medida(sigla)",
    )
    .eq("planilha_id", medicao.planilha_id)
    .order("ordem")
    .order("created_at");

  if (erroItens) {
    throw new Error("Não foi possível carregar os itens da planilha");
  }

  const itensPlanilha = (itensPlanilhaRaw ?? []) as ItemPlanilhaRow[];

  // Itens já lançados nesta medição (quantidade atual + memória).
  const { data: medidosRaw, error: erroMedidos } = await supabase
    .from("medicao_itens")
    .select("id, planilha_item_id, quantidade, memoria_calculo")
    .eq("medicao_id", id);

  if (erroMedidos) {
    throw new Error("Não foi possível carregar os itens da medição");
  }

  const medidosPorItem = new Map<
    string,
    { id: string; quantidade: number; memoria: string | null }
  >();
  for (const linha of medidosRaw ?? []) {
    medidosPorItem.set(linha.planilha_item_id, {
      id: linha.id,
      quantidade: linha.quantidade,
      memoria: linha.memoria_calculo,
    });
  }

  const acumulados = await acumuladoAnteriorPorItem(
    supabase,
    itensPlanilha.map((item) => item.id),
    id,
  );

  const itens: ItemMedido[] = [];
  const disponiveis: ItemDisponivel[] = [];

  for (const item of itensPlanilha) {
    const anterior = acumulados.get(item.id) ?? 0;
    const medido = medidosPorItem.get(item.id);

    if (medido) {
      const atual = medido.quantidade;
      const total = anterior + atual;
      itens.push({
        id: medido.id,
        planilhaItemId: item.id,
        codigo: item.codigo,
        descricao: item.descricao,
        unidadeSigla: item.unidades_medida?.sigla ?? null,
        quantidadeContratada: item.quantidade_contratada,
        precoUnitario: item.preco_unitario,
        memoriaCalculo: medido.memoria,
        acumuladoAnterior: anterior,
        atual,
        acumuladoTotal: total,
        saldo: item.quantidade_contratada - total,
        valor: atual * item.preco_unitario,
      });
    } else {
      disponiveis.push({
        planilhaItemId: item.id,
        codigo: item.codigo,
        descricao: item.descricao,
        unidadeSigla: item.unidades_medida?.sigla ?? null,
        quantidadeContratada: item.quantidade_contratada,
        precoUnitario: item.preco_unitario,
        acumuladoAnterior: anterior,
        saldoDisponivel: item.quantidade_contratada - anterior,
      });
    }
  }

  return {
    id: medicao.id,
    numero: medicao.numero,
    obraId: medicao.obra_id,
    obraNome: medicao.obras?.nome ?? "Obra removida",
    obraLote: medicao.obras?.lote ?? null,
    planilhaId: medicao.planilha_id,
    planilhaNome: medicao.planilhas_contratuais?.nome ?? null,
    competencia: medicao.competencia,
    descricao: medicao.descricao,
    status: normalizarStatus(medicao.status),
    reajusteTipo: normalizarReajuste(medicao.reajuste_tipo),
    reajusteValor: medicao.reajuste_valor,
    valorBruto: medicao.valor_bruto,
    valorReajuste: medicao.valor_reajuste,
    valorTotal: medicao.valor_total,
    dataAprovacao: medicao.data_aprovacao,
    motivoCancelamento: medicao.motivo_cancelamento,
    itens,
    disponiveis,
  };
}

/**
 * Planilha contratual de uma obra (uma por obra) e seus itens, para o
 * formulário de nova medição. Retorna null se a obra não tem planilha.
 */
export async function planilhaDaObra(
  obraId: string,
): Promise<PlanilhaDaObra | null> {
  const supabase = await createClient();

  const { data: planilha, error } = await supabase
    .from("planilhas_contratuais")
    .select("id, nome")
    .eq("obra_id", obraId)
    .maybeSingle();

  if (error) {
    throw new Error("Não foi possível carregar a planilha da obra");
  }
  if (!planilha) return null;

  const { data: itensRaw, error: erroItens } = await supabase
    .from("planilha_itens")
    .select(
      "id, codigo, descricao, quantidade_contratada, preco_unitario, ordem, unidades_medida(sigla)",
    )
    .eq("planilha_id", planilha.id)
    .order("ordem")
    .order("created_at");

  if (erroItens) {
    throw new Error("Não foi possível carregar os itens da planilha");
  }

  const itens: PlanilhaItemOpcao[] = ((itensRaw ?? []) as ItemPlanilhaRow[]).map(
    (item) => ({
      id: item.id,
      codigo: item.codigo,
      descricao: item.descricao,
      unidadeSigla: item.unidades_medida?.sigla ?? null,
      quantidadeContratada: item.quantidade_contratada,
      precoUnitario: item.preco_unitario,
    }),
  );

  return { planilhaId: planilha.id, planilhaNome: planilha.nome, itens };
}

/** Lê um uuid de filtro da query string (ignora valores inválidos). */
export function uuidParam(
  valor: string | string[] | undefined,
): string | undefined {
  if (typeof valor !== "string") return undefined;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    valor,
  )
    ? valor
    : undefined;
}

/** Lê um status de medição válido da query string (ignora fora do enum). */
export function statusParam(
  valor: string | string[] | undefined,
): StatusMedicao | undefined {
  if (typeof valor !== "string") return undefined;
  return valor in STATUS_MEDICAO ? (valor as StatusMedicao) : undefined;
}
