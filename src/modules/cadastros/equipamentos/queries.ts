import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  COLUNAS_FICHA_TECNICA,
  fichaDoRegistro,
  type FichaTecnica,
} from "@/modules/cadastros/equipamentos/ficha-tecnica";
import type {
  ControlePor,
  Propriedade,
  StatusEquipamento,
} from "@/modules/cadastros/equipamentos/schemas";

/** Linha da listagem de equipamentos. */
export interface EquipamentoLista {
  id: string;
  codigo: string | null;
  descricao: string;
  tipo: string | null;
  marca: string | null;
  modelo: string | null;
  ano: number | null;
  placa: string | null;
  controlePor: ControlePor;
  propriedade: Propriedade;
  status: StatusEquipamento;
  medicaoInicial: number | null;
  numeroSerie: string | null;
  dataAquisicao: string | null;
  dataVenda: string | null;
  ativo: boolean;
}

/** Documento vinculado a um equipamento. */
export interface EquipamentoDocumento {
  id: string;
  equipamentoId: string;
  tipo: string;
  descricao: string | null;
  vencimento: string | null;
  anexoPath: string | null;
}

/** Lista todos os equipamentos, ordenados pela descrição. */
export async function listarEquipamentos(): Promise<EquipamentoLista[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("equipamentos")
    .select(
      "id, codigo, descricao, tipo, marca, modelo, ano, placa, controle_por, propriedade, status, medicao_inicial, numero_serie, data_aquisicao, data_venda, ativo",
    )
    .order("descricao");

  if (error) {
    throw new Error("Não foi possível carregar os equipamentos");
  }

  return (data ?? []).map((equipamento) => ({
    id: equipamento.id,
    codigo: equipamento.codigo,
    descricao: equipamento.descricao,
    tipo: equipamento.tipo,
    marca: equipamento.marca,
    modelo: equipamento.modelo,
    ano: equipamento.ano,
    placa: equipamento.placa,
    controlePor: equipamento.controle_por as ControlePor,
    propriedade: equipamento.propriedade as Propriedade,
    status: equipamento.status as StatusEquipamento,
    medicaoInicial: equipamento.medicao_inicial,
    numeroSerie: equipamento.numero_serie,
    dataAquisicao: equipamento.data_aquisicao,
    dataVenda: equipamento.data_venda,
    ativo: equipamento.ativo,
  }));
}

/**
 * Documentos de um equipamento, do vencimento mais próximo para o mais
 * distante. Documentos sem vencimento vêm por último.
 */
export async function listarDocumentos(
  equipamentoId: string,
): Promise<EquipamentoDocumento[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("equipamento_documentos")
    .select("id, equipamento_id, tipo, descricao, vencimento, anexo_path")
    .eq("equipamento_id", equipamentoId)
    .order("vencimento", { ascending: true, nullsFirst: false });

  if (error) {
    throw new Error("Não foi possível carregar os documentos do equipamento");
  }

  return (data ?? []).map((documento) => ({
    id: documento.id,
    equipamentoId: documento.equipamento_id,
    tipo: documento.tipo,
    descricao: documento.descricao,
    vencimento: documento.vencimento,
    anexoPath: documento.anexo_path,
  }));
}

/**
 * Ficha técnica do equipamento, ou null quando ainda não foi preenchida (a
 * linha só nasce no primeiro "Salvar ficha técnica").
 */
export async function obterFichaTecnica(
  equipamentoId: string,
): Promise<FichaTecnica | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("equipamento_especificacoes")
    .select(COLUNAS_FICHA_TECNICA)
    .eq("equipamento_id", equipamentoId)
    .maybeSingle();

  if (error) {
    throw new Error("Não foi possível carregar a ficha técnica do equipamento");
  }

  return data ? fichaDoRegistro(data) : null;
}
