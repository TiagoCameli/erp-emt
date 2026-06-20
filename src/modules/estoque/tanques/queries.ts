import "server-only";

import { createClient } from "@/lib/supabase/server";
import { TIPOS_TANQUE } from "@/modules/cadastros/depositos/schemas";
import { listarSaldos } from "@/modules/estoque/_shared/queries";

/** Linha da listagem de abastecimentos, com nomes resolvidos. */
export interface AbastecimentoLista {
  id: string;
  dataAbastecimento: string;
  tanqueNome: string;
  insumoNome: string;
  unidadeSigla: string;
  equipamentoDescricao: string;
  equipamentoPlaca: string | null;
  quantidade: number;
  custoTotal: number | null;
  horimetro: number | null;
  km: number | null;
  operadorNome: string | null;
  observacao: string | null;
}

/** Resultado paginado de abastecimentos. */
export interface AbastecimentosPagina {
  itens: AbastecimentoLista[];
  total: number;
}

/** Filtros e paginação da listagem de abastecimentos. */
export interface ListarAbastecimentosParams {
  pagina: number;
  tamanho: number;
  tanqueId?: string;
  equipamentoId?: string;
}

/**
 * Lista abastecimentos de equipamentos com paginação server-side (count
 * exato) e os nomes de tanque, insumo, unidade, equipamento e operador já
 * resolvidos. Mais recentes primeiro.
 */
export async function listarAbastecimentos(
  params: ListarAbastecimentosParams,
): Promise<AbastecimentosPagina> {
  const supabase = await createClient();

  const pagina = Math.max(0, params.pagina);
  const tamanho = Math.max(1, params.tamanho);
  const de = pagina * tamanho;
  const ate = de + tamanho - 1;

  let consulta = supabase
    .from("abastecimentos")
    .select(
      `id, data_abastecimento, quantidade, custo_total, horimetro, km, observacao,
       depositos(nome),
       insumos(nome, unidades_medida(sigla)),
       equipamentos(descricao, placa),
       colaboradores(nome)`,
      { count: "exact" },
    )
    .order("data_abastecimento", { ascending: false })
    .order("created_at", { ascending: false })
    .range(de, ate);

  if (params.tanqueId) consulta = consulta.eq("deposito_id", params.tanqueId);
  if (params.equipamentoId)
    consulta = consulta.eq("equipamento_id", params.equipamentoId);

  const { data, error, count } = await consulta;

  if (error) throw new Error("Não foi possível carregar os abastecimentos");

  const itens: AbastecimentoLista[] = (data ?? []).map((ab) => ({
    id: ab.id,
    dataAbastecimento: ab.data_abastecimento,
    tanqueNome: ab.depositos?.nome ?? "-",
    insumoNome: ab.insumos?.nome ?? "-",
    unidadeSigla: ab.insumos?.unidades_medida?.sigla ?? "",
    equipamentoDescricao: ab.equipamentos?.descricao ?? "-",
    equipamentoPlaca: ab.equipamentos?.placa ?? null,
    quantidade: ab.quantidade,
    custoTotal: ab.custo_total,
    horimetro: ab.horimetro,
    km: ab.km,
    operadorNome: ab.colaboradores?.nome ?? null,
    observacao: ab.observacao,
  }));

  return { itens, total: count ?? 0 };
}

/** Nível atual de um tanque (saldo do insumo armazenado). */
export interface NivelTanque {
  depositoId: string;
  nome: string;
  insumoNome: string;
  unidadeSigla: string;
  quantidade: number;
  valorTotal: number;
}

/**
 * Níveis dos tanques (combustível e betuminoso), a partir dos saldos
 * materializados (inclui zerados, para o tanque vazio também aparecer).
 * Ordenado por nome.
 */
export async function listarNiveisTanques(): Promise<NivelTanque[]> {
  const saldos = await listarSaldos(true);

  return saldos
    .filter((saldo) => TIPOS_TANQUE.includes(saldo.depositoTipo))
    .map((saldo) => ({
      depositoId: saldo.depositoId,
      nome: saldo.depositoNome,
      insumoNome: saldo.insumoNome,
      unidadeSigla: saldo.unidadeSigla,
      quantidade: saldo.quantidade,
      valorTotal: saldo.valorTotal,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}
