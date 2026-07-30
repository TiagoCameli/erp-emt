import "server-only";

import { createClient } from "@/lib/supabase/server";
import { type StatusFolha, STATUS_FOLHA } from "@/modules/rh/_shared/formato";

/** Linha da listagem de folhas, com a contagem de itens. */
export interface FolhaLista {
  id: string;
  competencia: string;
  status: StatusFolha;
  encargosPercentual: number;
  valorBruto: number;
  valorEncargos: number;
  valorAdiantamentos: number;
  valorLiquido: number;
  custoTotal: number;
  /** Data de fechamento (yyyy-MM-dd) ou null se ainda em rascunho. */
  dataFechamento: string | null;
  /** Quantidade de colaboradores na folha. */
  totalItens: number;
}

/** Uma linha de encargo aplicada a um item da folha (nome + valor em R$). */
export interface EncargoDetalhe {
  nome: string;
  valor: number;
}

/** Item da folha por colaborador, com nome/função e centro de custo resolvidos. */
export interface FolhaItem {
  id: string;
  colaboradorId: string;
  colaboradorNome: string;
  /** Nome da função, vindo do join com `funcoes` (Bloco 3, Task 3). */
  colaboradorFuncao: string | null;
  centroCustoId: string | null;
  centroCustoNome: string | null;
  centroCustoCodigo: string | null;
  salarioBase: number;
  horasNormais: number;
  horasExtras: number;
  valorExtras: number;
  /** Desconto de INSS do colaborador (Bloco 6/7), usado no holerite. */
  inss: number;
  /** Desconto de IRRF do colaborador (Bloco 6/7), usado no holerite. */
  irrf: number;
  encargos: number;
  /**
   * Quebra do total de `encargos` por tipo (Bloco 6, Task 3/4), vinda de
   * `folha_item_encargos`. Folhas geradas antes da Task 3 não têm essas
   * linhas: nesse caso vem `[]` e a UI mostra só o total.
   */
  encargosDetalhe: EncargoDetalhe[];
  adiantamentos: number;
  custoTotal: number;
  valorLiquido: number;
}

/** Folha completa para o detalhe: cabeçalho + itens por colaborador. */
export interface FolhaDetalhe {
  id: string;
  competencia: string;
  status: StatusFolha;
  encargosPercentual: number;
  valorBruto: number;
  valorEncargos: number;
  valorAdiantamentos: number;
  valorLiquido: number;
  custoTotal: number;
  dataFechamento: string | null;
  itens: FolhaItem[];
}

/** Custo total alocado por centro de custo, derivado dos itens. */
export interface CustoCentroCusto {
  centroCustoId: string | null;
  centroCustoNome: string | null;
  centroCustoCodigo: string | null;
  custoTotal: number;
}

/** Total por tipo de encargo, somado entre todos os colaboradores da folha. */
export interface ResumoEncargo {
  nome: string;
  total: number;
}

/** Normaliza o status do banco (texto livre) para o domínio conhecido. */
function normalizarStatus(status: string): StatusFolha {
  return status in STATUS_FOLHA ? (status as StatusFolha) : "rascunho";
}

/**
 * Lista as folhas com a contagem de colaboradores (folha_itens) de cada uma,
 * em ordem de competência decrescente. A contagem vem do embed com count, sem
 * trazer as linhas. SELECT direto (RLS de ver).
 */
export async function listarFolhas(): Promise<FolhaLista[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("folhas")
    .select(
      `id, competencia, status, encargos_percentual, valor_bruto,
       valor_encargos, valor_adiantamentos, valor_liquido, custo_total,
       data_fechamento, folha_itens(count)`,
    )
    .order("competencia", { ascending: false });

  if (error) throw new Error("Não foi possível carregar as folhas");

  return (data ?? []).map((folha) => ({
    id: folha.id,
    competencia: folha.competencia,
    status: normalizarStatus(folha.status),
    encargosPercentual: folha.encargos_percentual,
    valorBruto: folha.valor_bruto,
    valorEncargos: folha.valor_encargos,
    valorAdiantamentos: folha.valor_adiantamentos,
    valorLiquido: folha.valor_liquido,
    custoTotal: folha.custo_total,
    dataFechamento: folha.data_fechamento,
    totalItens: folha.folha_itens?.[0]?.count ?? 0,
  }));
}

/**
 * Folha completa para o detalhe: cabeçalho com os valores consolidados e os
 * itens por colaborador, com nome/função e o centro de custo (nome/código) via
 * embed. Itens em ordem alfabética de colaborador. Retorna null se não achar.
 */
export async function buscarFolha(id: string): Promise<FolhaDetalhe | null> {
  const supabase = await createClient();

  const { data: folha, error } = await supabase
    .from("folhas")
    .select(
      `id, competencia, status, encargos_percentual, valor_bruto,
       valor_encargos, valor_adiantamentos, valor_liquido, custo_total,
       data_fechamento`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !folha) return null;

  const { data: itensRaw, error: erroItens } = await supabase
    .from("folha_itens")
    .select(
      `id, colaborador_id, centro_custo_id, salario_base, horas_normais,
       horas_extras, valor_extras, inss, irrf, encargos, adiantamentos,
       custo_total, valor_liquido,
       colaboradores(nome, funcoes(nome)),
       centros_custo(nome, codigo),
       folha_item_encargos(nome, valor)`,
    )
    .eq("folha_id", id);

  if (erroItens) {
    throw new Error("Não foi possível carregar os itens da folha");
  }

  const itens: FolhaItem[] = (itensRaw ?? [])
    .map((item) => ({
      id: item.id,
      colaboradorId: item.colaborador_id,
      colaboradorNome: item.colaboradores?.nome ?? "Colaborador removido",
      colaboradorFuncao: item.colaboradores?.funcoes?.nome ?? null,
      centroCustoId: item.centro_custo_id,
      centroCustoNome: item.centros_custo?.nome ?? null,
      centroCustoCodigo: item.centros_custo?.codigo ?? null,
      salarioBase: item.salario_base,
      horasNormais: item.horas_normais,
      horasExtras: item.horas_extras,
      valorExtras: item.valor_extras,
      inss: item.inss,
      irrf: item.irrf,
      encargos: item.encargos,
      // Folhas geradas antes da Task 3 (Bloco 6) não têm linhas aqui: [].
      encargosDetalhe: (item.folha_item_encargos ?? [])
        .map((encargo) => ({ nome: encargo.nome, valor: encargo.valor }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
      adiantamentos: item.adiantamentos,
      custoTotal: item.custo_total,
      valorLiquido: item.valor_liquido,
    }))
    .sort((a, b) =>
      a.colaboradorNome.localeCompare(b.colaboradorNome, "pt-BR"),
    );

  return {
    id: folha.id,
    competencia: folha.competencia,
    status: normalizarStatus(folha.status),
    encargosPercentual: folha.encargos_percentual,
    valorBruto: folha.valor_bruto,
    valorEncargos: folha.valor_encargos,
    valorAdiantamentos: folha.valor_adiantamentos,
    valorLiquido: folha.valor_liquido,
    custoTotal: folha.custo_total,
    dataFechamento: folha.data_fechamento,
    itens,
  };
}

// `resumoPorCentroCusto` e `resumoPorEncargo` foram movidos para
// `./calculo.ts`: são derivações puras dos itens já carregados aqui por
// `buscarFolha`, sem precisar de uma 2ª/3ª leitura da folha no banco.
