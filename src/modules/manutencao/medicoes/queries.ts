import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import {
  facetasNoServidor,
  type FacetasPresentes,
} from "@/modules/_shared/filtros-facetados";
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

/** Os filtros da listagem, sem a paginação. */
export type FiltrosMedicoes = Omit<ListarMedicoesParams, "pagina" | "tamanho">;

/** O pedaço do builder do PostgREST que os filtros das leituras usam. */
interface ConsultaFiltravelMedicoes<T> {
  eq: (coluna: string, valor: string) => T;
  gte: (coluna: string, valor: string) => T;
  lte: (coluna: string, valor: string) => T;
}

/**
 * Aplica os filtros na consulta: serve a página e as facetas, que precisam do
 * MESMO recorte. Síncrona: o builder é thenable (ver `aplicarFiltrosPagas`).
 */
function aplicarFiltrosMedicoes<T extends ConsultaFiltravelMedicoes<T>>(
  consultaInicial: T,
  filtros: FiltrosMedicoes,
): T {
  let consulta = consultaInicial;
  if (filtros.equipamentoId) consulta = consulta.eq("equipamento_id", filtros.equipamentoId);
  // `data` é DATE: a string yyyy-MM-dd compara direto, sem fuso.
  if (filtros.de) consulta = consulta.gte("data", filtros.de);
  if (filtros.ate) consulta = consulta.lte("data", filtros.ate);
  return consulta;
}

/** Os filtros de seleção da barra. O período restringe, mas não tem lista. */
export type FacetaMedicoes = "equipamento";

/**
 * Equipamentos que têm leitura no recorte dos outros filtros (o período), para
 * o filtro de equipamento só oferecer o que devolve linha (ver
 * `_shared/filtros-facetados`). Só a coluna da chave, sem paginação.
 */
export async function facetasMedicoes(
  filtros: FiltrosMedicoes,
): Promise<FacetasPresentes<FacetaMedicoes>> {
  const supabase = await createClient();

  return facetasNoServidor<{ equipamento_id: string }, FacetaMedicoes>(
    { equipamento: { ativo: !!filtros.equipamentoId, chave: (linha) => linha.equipamento_id } },
    async (exceto) => {
      const recorte = exceto === "equipamento" ? { ...filtros, equipamentoId: undefined } : filtros;
      const { linhas, erro } = await todasAsLinhas((de, ate) =>
        aplicarFiltrosMedicoes(
          supabase.from("equipamento_medicoes").select("id, equipamento_id").is("excluido_em", null),
          recorte,
        )
          .order("id")
          .range(de, ate),
      );
      if (erro) throw new Error("Não foi possível carregar os filtros das leituras");
      return linhas;
    },
  );
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

  consulta = aplicarFiltrosMedicoes(consulta, params);

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
