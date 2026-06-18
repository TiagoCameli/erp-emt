import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ControlePor } from "@/modules/cadastros/equipamentos/schemas";

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
      "id, codigo, descricao, tipo, marca, modelo, ano, placa, controle_por, ativo",
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
