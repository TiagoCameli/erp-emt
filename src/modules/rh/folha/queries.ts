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
       folha_itens(count)`,
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
       horas_extras, valor_extras, encargos, adiantamentos, custo_total,
       valor_liquido,
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

/**
 * Custo total da folha agrupado por centro de custo, somando o custo_total dos
 * itens. Itens sem centro de custo entram num grupo "Sem centro de custo".
 * Derivado em memória dos itens já carregados, ordenado por custo decrescente.
 */
export async function resumoPorCentroCusto(
  folhaId: string,
): Promise<CustoCentroCusto[]> {
  const folha = await buscarFolha(folhaId);
  if (!folha) return [];

  const grupos = new Map<string, CustoCentroCusto>();

  for (const item of folha.itens) {
    const chave = item.centroCustoId ?? "__sem_centro__";
    const atual = grupos.get(chave);
    if (atual) {
      atual.custoTotal += item.custoTotal;
    } else {
      grupos.set(chave, {
        centroCustoId: item.centroCustoId,
        centroCustoNome: item.centroCustoNome,
        centroCustoCodigo: item.centroCustoCodigo,
        custoTotal: item.custoTotal,
      });
    }
  }

  return [...grupos.values()].sort((a, b) => b.custoTotal - a.custoTotal);
}

/**
 * Total por tipo de encargo, somando as linhas de `folha_item_encargos` de
 * todos os itens da folha. Ordenado por nome. Folhas antigas, sem quebra
 * gravada (todo item com `encargosDetalhe: []`), retornam lista vazia — a UI
 * então omite esta seção e mostra só o total consolidado.
 */
export async function resumoPorEncargo(
  folhaId: string,
): Promise<ResumoEncargo[]> {
  const folha = await buscarFolha(folhaId);
  if (!folha) return [];

  const totais = new Map<string, number>();

  for (const item of folha.itens) {
    for (const encargo of item.encargosDetalhe) {
      totais.set(encargo.nome, (totais.get(encargo.nome) ?? 0) + encargo.valor);
    }
  }

  return [...totais.entries()]
    .map(([nome, total]) => ({ nome, total }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
