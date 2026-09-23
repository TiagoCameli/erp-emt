import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import {
  ORIGENS_MEDICAO,
  TIPOS_MEDICAO,
  type OrigemMedicao,
  type TipoMedicao,
} from "@/modules/manutencao/medicoes/schemas";

/** Tamanho padrão da página da lista de leituras. */
export const TAMANHO_PADRAO = 50;

/** Linha da lista de leituras. */
export interface MedicaoLista {
  id: string;
  equipamentoId: string;
  equipamentoRotulo: string;
  data: string;
  tipo: TipoMedicao;
  valor: number;
  origem: OrigemMedicao;
  observacoes: string | null;
}

export interface MedicoesPagina {
  itens: MedicaoLista[];
  total: number;
}

/** Equipamento que controla horímetro ou km, para o filtro e o formulário. */
export interface EquipamentoMedicaoOpcao {
  id: string;
  rotulo: string;
  controlePor: TipoMedicao;
  ativo: boolean;
  medicaoInicial: number | null;
}

export interface ListarMedicoesParams {
  pagina: number;
  tamanho: number;
  equipamentoId?: string;
  /** Início do período (yyyy-MM-dd). */
  de?: string;
  /** Fim do período (yyyy-MM-dd). */
  ate?: string;
}

/** "EQ-001 · Escavadeira CAT 320" quando tem código, senão só a descrição. */
export function rotuloEquipamento(equipamento: { codigo: string | null; descricao: string; placa?: string | null }): string {
  const partes = [equipamento.codigo?.trim(), equipamento.descricao.trim()].filter(Boolean);
  const base = partes.join(" · ");
  return equipamento.placa?.trim() ? `${base} (${equipamento.placa.trim()})` : base;
}

function tipoValido(valor: string): TipoMedicao {
  return (TIPOS_MEDICAO as readonly string[]).includes(valor) ? (valor as TipoMedicao) : "horimetro";
}

function origemValida(valor: string): OrigemMedicao {
  return (ORIGENS_MEDICAO as readonly string[]).includes(valor) ? (valor as OrigemMedicao) : "manual";
}

/**
 * Leituras com paginação no servidor (range + count exact): a tabela cresce
 * todo dia e não pode depender do teto de 1.000 do PostgREST. Filtros vão para
 * o banco, senão o total mentiria. Ordem: data mais nova primeiro, depois o
 * equipamento, com `created_at` e `id` de desempate para a paginação não
 * repetir nem pular linha entre páginas.
 */
export async function listarMedicoes(params: ListarMedicoesParams): Promise<MedicoesPagina> {
  const supabase = await createClient();

  const pagina = Math.max(0, params.pagina);
  const tamanho = Math.max(1, Math.min(params.tamanho, 500));
  const de = pagina * tamanho;

  let consulta = supabase
    .from("equipamento_medicoes")
    .select("id, equipamento_id, data, tipo, valor, origem, observacoes, equipamentos(codigo, descricao, placa)", {
      count: "exact",
    })
    .is("excluido_em", null)
    .order("data", { ascending: false })
    .order("equipamento_id")
    .order("created_at", { ascending: false })
    .order("id")
    .range(de, de + tamanho - 1);

  if (params.equipamentoId) consulta = consulta.eq("equipamento_id", params.equipamentoId);
  // `data` é DATE: a string yyyy-MM-dd compara direto, sem fuso.
  if (params.de) consulta = consulta.gte("data", params.de);
  if (params.ate) consulta = consulta.lte("data", params.ate);

  const { data, error, count } = await consulta;
  if (error) throw new Error("Não foi possível carregar as leituras de horímetro e km");

  const itens = (data ?? []).map((linha) => ({
    id: linha.id,
    equipamentoId: linha.equipamento_id,
    equipamentoRotulo: linha.equipamentos ? rotuloEquipamento(linha.equipamentos) : "Equipamento não encontrado",
    data: linha.data,
    tipo: tipoValido(linha.tipo),
    valor: Number(linha.valor),
    origem: origemValida(linha.origem),
    observacoes: linha.observacoes,
  }));

  return { itens, total: count ?? 0 };
}

/**
 * Equipamentos que controlam horímetro ou km, ativos e inativos (o filtro
 * precisa achar leitura antiga de equipamento baixado; o formulário usa só os
 * ativos). Lido inteiro por `todasAsLinhas`.
 */
export async function listarEquipamentosComMedicao(): Promise<EquipamentoMedicaoOpcao[]> {
  const supabase = await createClient();

  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("equipamentos")
      .select("id, codigo, descricao, placa, controle_por, ativo, medicao_inicial")
      .in("controle_por", [...TIPOS_MEDICAO])
      .order("descricao")
      .order("id")
      .range(de, ate),
  );

  if (erro) throw new Error("Não foi possível carregar os equipamentos");

  return linhas.map((equipamento) => ({
    id: equipamento.id,
    rotulo: rotuloEquipamento(equipamento),
    controlePor: tipoValido(equipamento.controle_por),
    ativo: equipamento.ativo,
    medicaoInicial: equipamento.medicao_inicial === null ? null : Number(equipamento.medicao_inicial),
  }));
}

/** Última leitura de um equipamento: a de data mais nova, e entre as do mesmo dia a última lançada. */
export interface UltimaLeitura {
  valor: number;
  data: string;
  origem: OrigemMedicao;
}

export async function buscarUltimaLeitura(
  equipamentoId: string,
  ignorarId?: string,
): Promise<UltimaLeitura | null> {
  const supabase = await createClient();

  let consulta = supabase
    .from("equipamento_medicoes")
    .select("valor, data, origem")
    .eq("equipamento_id", equipamentoId)
    .is("excluido_em", null)
    .order("data", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);

  if (ignorarId) consulta = consulta.neq("id", ignorarId);

  const { data, error } = await consulta;
  if (error) throw new Error("Não foi possível carregar a última leitura");

  const linha = data?.[0];
  if (!linha) return null;
  return { valor: Number(linha.valor), data: linha.data, origem: origemValida(linha.origem) };
}
