import "server-only";

import { createClient } from "@/lib/supabase/server";

/** Equipamento para os selects. */
export interface EquipamentoOpcao {
  id: string;
  descricao: string;
  codigo: string | null;
  placa: string | null;
  controlePor: string;
}

/** Colaborador (mecânico/operador) para os selects. */
export interface ColaboradorOpcao {
  id: string;
  nome: string;
  funcao: string | null;
}

/** Fornecedor para o serviço de terceiro. */
export interface FornecedorOpcao {
  id: string;
  nome: string;
}

/** Insumo (peça) para os selects, com a sigla da unidade. */
export interface InsumoOpcao {
  id: string;
  nome: string;
  codigo: string | null;
  unidadeSigla: string;
}

/** Depósito de almoxarifado da mecânica. */
export interface DepositoOpcao {
  id: string;
  nome: string;
}

/** Nome de exibição do fornecedor: fantasia quando existe, senão razão social. */
function nomeFornecedor(fornecedor: {
  razao_social: string;
  nome_fantasia: string | null;
}): string {
  return fornecedor.nome_fantasia ?? fornecedor.razao_social;
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

  return (data ?? []).map((e) => ({
    id: e.id,
    descricao: e.descricao,
    codigo: e.codigo,
    placa: e.placa,
    controlePor: e.controle_por,
  }));
}

/** Colaboradores ativos (candidatos a mecânico/operador). */
export async function listarColaboradores(): Promise<ColaboradorOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("colaboradores")
    .select("id, nome, funcao")
    .eq("ativo", true)
    .order("nome");

  if (error) throw new Error("Não foi possível carregar os colaboradores");

  return (data ?? []).map((c) => ({
    id: c.id,
    nome: c.nome,
    funcao: c.funcao,
  }));
}

/** Fornecedores ativos para serviço de terceiro. */
export async function listarFornecedores(): Promise<FornecedorOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("fornecedores")
    .select("id, razao_social, nome_fantasia")
    .eq("ativo", true)
    .order("razao_social");

  if (error) throw new Error("Não foi possível carregar os fornecedores");

  return (data ?? []).map((f) => ({ id: f.id, nome: nomeFornecedor(f) }));
}

/** Insumos ativos (peças), com a sigla da unidade. */
export async function listarInsumos(): Promise<InsumoOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("insumos")
    .select("id, nome, codigo, unidades_medida(sigla)")
    .eq("ativo", true)
    .order("nome");

  if (error) throw new Error("Não foi possível carregar os insumos");

  return (data ?? []).map((i) => ({
    id: i.id,
    nome: i.nome,
    codigo: i.codigo,
    unidadeSigla: i.unidades_medida?.sigla ?? "",
  }));
}

/** Depósitos de almoxarifado da mecânica (origem das peças da OS). */
export async function listarDepositosAlmoxarifado(): Promise<DepositoOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("depositos")
    .select("id, nome")
    .eq("ativo", true)
    .eq("tipo", "almoxarifado_mecanica")
    .order("nome");

  if (error) throw new Error("Não foi possível carregar os almoxarifados");

  return (data ?? []).map((d) => ({ id: d.id, nome: d.nome }));
}
