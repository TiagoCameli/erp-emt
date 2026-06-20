import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  TIPOS_TANQUE,
  type TipoDeposito,
} from "@/modules/cadastros/depositos/schemas";
import type { TipoMovimento } from "@/modules/estoque/_shared/formato";

/** Insumo para os selects, já com a sigla da unidade de medida. */
export interface InsumoOpcao {
  id: string;
  nome: string;
  codigo: string | null;
  unidadeSigla: string;
}

/** Depósito para os selects. */
export interface DepositoOpcao {
  id: string;
  nome: string;
  tipo: TipoDeposito;
}

/** Tanque (depósito de insumo único) para o abastecimento. */
export interface TanqueOpcao {
  id: string;
  nome: string;
  tipo: TipoDeposito;
  insumoId: string | null;
  insumoNome: string | null;
  unidadeSigla: string | null;
}

/** Centro de custo para os selects de consumo. */
export interface CentroCustoOpcao {
  id: string;
  nome: string;
  codigo: string | null;
}

/** Equipamento para o abastecimento. */
export interface EquipamentoOpcao {
  id: string;
  descricao: string;
  codigo: string | null;
  placa: string | null;
  controlePor: string;
}

/** Colaborador (operador) para o abastecimento. */
export interface OperadorOpcao {
  id: string;
  nome: string;
}

/** Saldo de um insumo num depósito, com nomes resolvidos. */
export interface SaldoLista {
  insumoId: string;
  insumoNome: string;
  insumoCodigo: string | null;
  unidadeSigla: string;
  depositoId: string;
  depositoNome: string;
  depositoTipo: TipoDeposito;
  quantidade: number;
  valorTotal: number;
}

/**
 * Lista os saldos materializados (insumo + depósito) com quantidade > 0 por
 * padrão, com os nomes resolvidos. Base da posição de estoque e dos alertas.
 * Passe `incluirZerados` para trazer também os saldos zerados.
 */
export async function listarSaldos(
  incluirZerados = false,
): Promise<SaldoLista[]> {
  const supabase = await createClient();

  let consulta = supabase
    .from("estoque_saldos")
    .select(
      `insumo_id, deposito_id, quantidade, valor_total,
       insumos(nome, codigo, unidades_medida(sigla)),
       depositos(nome, tipo)`,
    );

  if (!incluirZerados) consulta = consulta.gt("quantidade", 0);

  const { data, error } = await consulta;

  if (error) throw new Error("Não foi possível carregar os saldos");

  return (data ?? [])
    .map((saldo) => ({
      insumoId: saldo.insumo_id,
      insumoNome: saldo.insumos?.nome ?? "-",
      insumoCodigo: saldo.insumos?.codigo ?? null,
      unidadeSigla: saldo.insumos?.unidades_medida?.sigla ?? "",
      depositoId: saldo.deposito_id,
      depositoNome: saldo.depositos?.nome ?? "-",
      depositoTipo: (saldo.depositos?.tipo ?? "central") as TipoDeposito,
      quantidade: saldo.quantidade,
      valorTotal: saldo.valor_total,
    }))
    .sort(
      (a, b) =>
        a.insumoNome.localeCompare(b.insumoNome) ||
        a.depositoNome.localeCompare(b.depositoNome),
    );
}

/** Saldo atual (quantidade) de um insumo num depósito; 0 se não houver. */
export async function buscarSaldo(
  insumoId: string,
  depositoId: string,
): Promise<number> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("estoque_saldos")
    .select("quantidade")
    .eq("insumo_id", insumoId)
    .eq("deposito_id", depositoId)
    .maybeSingle();

  return data?.quantidade ?? 0;
}

/** Linha da listagem de movimentos de estoque, com nomes resolvidos. */
export interface MovimentoLista {
  id: string;
  tipo: TipoMovimento;
  dataMovimento: string;
  insumoNome: string;
  insumoCodigo: string | null;
  unidadeSigla: string;
  depositoNome: string;
  depositoDestinoNome: string | null;
  quantidade: number;
  custoUnitario: number | null;
  custoTotal: number | null;
  centroCustoNome: string | null;
  centroCustoCodigo: string | null;
  equipamentoDescricao: string | null;
  origem: string;
  observacao: string | null;
}

/** Resultado paginado de movimentos. */
export interface MovimentosPagina {
  itens: MovimentoLista[];
  total: number;
}

/** Filtros e paginação da listagem de movimentos. */
export interface ListarMovimentosParams {
  tipos: TipoMovimento[];
  pagina: number;
  tamanho: number;
  insumoId?: string;
  depositoId?: string;
  /** Origens a ocultar (ex.: a aba Entradas esconde a entrada vinda de transferência). */
  excluirOrigens?: string[];
}

/**
 * Lista movimentos de estoque por tipo, com paginação server-side (count
 * exato) e os nomes de insumo, unidade, depósito (origem e destino), centro
 * de custo e equipamento já resolvidos. Reaproveitado por entradas, saídas,
 * transferências e inventário, cada um passando os tipos que lhe interessam.
 */
export async function listarMovimentos(
  params: ListarMovimentosParams,
): Promise<MovimentosPagina> {
  const supabase = await createClient();

  const pagina = Math.max(0, params.pagina);
  const tamanho = Math.max(1, params.tamanho);
  const de = pagina * tamanho;
  const ate = de + tamanho - 1;

  let consulta = supabase
    .from("estoque_movimentos")
    .select(
      `id, tipo, data_movimento, quantidade, custo_unitario, custo_total,
       origem, observacao,
       insumos(nome, codigo, unidades_medida(sigla)),
       deposito:depositos!estoque_movimentos_deposito_id_fkey(nome),
       destino:depositos!estoque_movimentos_deposito_destino_id_fkey(nome),
       centros_custo(nome, codigo),
       equipamentos(descricao)`,
      { count: "exact" },
    )
    .in("tipo", params.tipos)
    .order("data_movimento", { ascending: false })
    .order("created_at", { ascending: false })
    .range(de, ate);

  if (params.insumoId) consulta = consulta.eq("insumo_id", params.insumoId);
  if (params.depositoId) consulta = consulta.eq("deposito_id", params.depositoId);
  if (params.excluirOrigens && params.excluirOrigens.length > 0) {
    consulta = consulta.not(
      "origem",
      "in",
      `(${params.excluirOrigens.join(",")})`,
    );
  }

  const { data, error, count } = await consulta;

  if (error) throw new Error("Não foi possível carregar os movimentos");

  const itens: MovimentoLista[] = (data ?? []).map((mov) => ({
    id: mov.id,
    tipo: mov.tipo as TipoMovimento,
    dataMovimento: mov.data_movimento,
    insumoNome: mov.insumos?.nome ?? "-",
    insumoCodigo: mov.insumos?.codigo ?? null,
    unidadeSigla: mov.insumos?.unidades_medida?.sigla ?? "",
    depositoNome: mov.deposito?.nome ?? "-",
    depositoDestinoNome: mov.destino?.nome ?? null,
    quantidade: mov.quantidade,
    custoUnitario: mov.custo_unitario,
    custoTotal: mov.custo_total,
    centroCustoNome: mov.centros_custo?.nome ?? null,
    centroCustoCodigo: mov.centros_custo?.codigo ?? null,
    equipamentoDescricao: mov.equipamentos?.descricao ?? null,
    origem: mov.origem,
    observacao: mov.observacao,
  }));

  return { itens, total: count ?? 0 };
}

/** Insumos ativos, com a sigla da unidade, em ordem alfabética. */
export async function listarInsumos(): Promise<InsumoOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("insumos")
    .select("id, nome, codigo, unidades_medida(sigla)")
    .eq("ativo", true)
    .order("nome");

  if (error) throw new Error("Não foi possível carregar os insumos");

  return (data ?? []).map((insumo) => ({
    id: insumo.id,
    nome: insumo.nome,
    codigo: insumo.codigo,
    unidadeSigla: insumo.unidades_medida?.sigla ?? "",
  }));
}

/** Depósitos ativos (todos os tipos), em ordem alfabética. */
export async function listarDepositos(): Promise<DepositoOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("depositos")
    .select("id, nome, tipo")
    .eq("ativo", true)
    .order("nome");

  if (error) throw new Error("Não foi possível carregar os depósitos");

  return (data ?? []).map((deposito) => ({
    id: deposito.id,
    nome: deposito.nome,
    tipo: deposito.tipo as TipoDeposito,
  }));
}

/** Tanques ativos (depósito de insumo único), com o insumo armazenado. */
export async function listarTanques(): Promise<TanqueOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("depositos")
    .select("id, nome, tipo, insumo_id, insumos(nome, unidades_medida(sigla))")
    .eq("ativo", true)
    .in("tipo", TIPOS_TANQUE as readonly string[])
    .order("nome");

  if (error) throw new Error("Não foi possível carregar os tanques");

  return (data ?? []).map((tanque) => ({
    id: tanque.id,
    nome: tanque.nome,
    tipo: tanque.tipo as TipoDeposito,
    insumoId: tanque.insumo_id,
    insumoNome: tanque.insumos?.nome ?? null,
    unidadeSigla: tanque.insumos?.unidades_medida?.sigla ?? null,
  }));
}

/** Centros de custo ativos, em ordem de código. */
export async function listarCentrosCusto(): Promise<CentroCustoOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("centros_custo")
    .select("id, nome, codigo")
    .eq("ativo", true)
    .order("codigo", { ascending: true, nullsFirst: false })
    .order("nome");

  if (error) throw new Error("Não foi possível carregar os centros de custo");

  return (data ?? []).map((centro) => ({
    id: centro.id,
    nome: centro.nome,
    codigo: centro.codigo,
  }));
}

/** Equipamentos ativos, em ordem alfabética. */
export async function listarEquipamentos(): Promise<EquipamentoOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("equipamentos")
    .select("id, descricao, codigo, placa, controle_por")
    .eq("ativo", true)
    .order("descricao");

  if (error) throw new Error("Não foi possível carregar os equipamentos");

  return (data ?? []).map((equipamento) => ({
    id: equipamento.id,
    descricao: equipamento.descricao,
    codigo: equipamento.codigo,
    placa: equipamento.placa,
    controlePor: equipamento.controle_por,
  }));
}

/** Colaboradores ativos, candidatos a operador, em ordem alfabética. */
export async function listarOperadores(): Promise<OperadorOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("colaboradores")
    .select("id, nome")
    .eq("ativo", true)
    .order("nome");

  if (error) throw new Error("Não foi possível carregar os operadores");

  return (data ?? []).map((colaborador) => ({
    id: colaborador.id,
    nome: colaborador.nome,
  }));
}
