import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import type { Database } from "@/lib/database.types";
import type { CriterioPeso, StatusCronograma, TipoAtividade, TipoVinculo } from "@/modules/execucao/_shared/rotulos";
import type { AtividadeGrade } from "@/modules/execucao/cronogramas/edicao";

/** Leitura de cronogramas e atividades. A RLS já filtra pela lista de acesso da obra. */

export interface CronogramaLista {
  id: string;
  obraId: string;
  obraNome: string;
  codigo: string;
  nome: string;
  status: StatusCronograma;
  criterioPeso: CriterioPeso;
  dataInicio: string | null;
  dataCorte: string | null;
  calendarioId: string | null;
  calculadoEm: string | null;
  observacoes: string | null;
  versao: string | null;
  nAtividades: number;
  nCriticas: number;
  inicioPrevisto: string | null;
  terminoPrevisto: string | null;
}

type LinhaCronograma = Database["public"]["Views"]["ex_v_cronogramas"]["Row"];
type LinhaAtividade = Database["public"]["Views"]["ex_v_atividades"]["Row"];

function paraCronograma(c: LinhaCronograma): CronogramaLista {
  return {
    id: c.id ?? "",
    obraId: c.obra_id ?? "",
    obraNome: c.obra_nome ?? "",
    codigo: c.codigo ?? "",
    nome: c.nome ?? "",
    status: c.status as StatusCronograma,
    criterioPeso: c.criterio_peso as CriterioPeso,
    dataInicio: c.data_inicio,
    dataCorte: c.data_corte,
    calendarioId: c.calendario_id,
    calculadoEm: c.calculado_em,
    observacoes: c.observacoes,
    versao: c.versao,
    nAtividades: Number(c.n_atividades ?? 0),
    nCriticas: Number(c.n_criticas ?? 0),
    inicioPrevisto: c.inicio_previsto,
    terminoPrevisto: c.termino_previsto,
  };
}

export async function listarCronogramas(filtros: { obraId?: string; status?: StatusCronograma } = {}): Promise<CronogramaLista[]> {
  const supabase = await createClient();
  let consulta = supabase.from("ex_v_cronogramas").select("*");
  if (filtros.obraId) consulta = consulta.eq("obra_id", filtros.obraId);
  if (filtros.status) consulta = consulta.eq("status", filtros.status);
  const { data, error } = await consulta.order("obra_nome").order("codigo");
  if (error) throw new Error(`Não foi possível ler os cronogramas: ${error.message}`);
  return (data ?? []).map(paraCronograma);
}

export async function cronogramaDetalhe(id: string): Promise<CronogramaLista | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("ex_v_cronogramas").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Não foi possível ler o cronograma: ${error.message}`);
  return data ? paraCronograma(data) : null;
}

const texto = (n: number | null) => (n === null ? null : String(n));

function predecessorasDe(json: unknown): AtividadeGrade["predecessoras"] {
  if (!Array.isArray(json)) return [];
  return json.map((p: { codigo?: unknown; tipo?: unknown; atraso?: unknown }) => ({
    codigo: String(p.codigo ?? ""),
    tipo: String(p.tipo ?? "TI") as TipoVinculo,
    atraso: Number(p.atraso ?? 0),
  }));
}

function locaisDe(json: unknown): AtividadeGrade["locais"] {
  if (!Array.isArray(json)) return [];
  return json.map((l: { id?: unknown; codigo?: unknown; nome?: unknown }) => ({
    id: String(l.id ?? ""),
    codigo: String(l.codigo ?? ""),
    nome: String(l.nome ?? ""),
  }));
}

export function paraAtividade(a: LinhaAtividade): AtividadeGrade {
  return {
    id: a.id ?? "",
    codigo: a.codigo ?? "",
    nome: a.nome ?? "",
    tipo: (a.tipo ?? "atividade") as TipoAtividade,
    paiId: a.pai_id,
    paiCodigo: a.pai_codigo,
    ordem: a.ordem ?? 0,
    servicoId: a.servico_id,
    servicoCodigo: a.servico_codigo,
    quantidade: texto(a.quantidade),
    unidadeId: a.unidade_id,
    unidadeSigla: a.unidade_sigla,
    produtividade: texto(a.produtividade),
    modoDuracao: a.modo_duracao === "por_produtividade" ? "por_produtividade" : "digitada",
    duracaoDias: a.duracao_dias ?? 0,
    inicioCedo: a.inicio_cedo,
    fimCedo: a.fim_cedo,
    folgaTotal: a.folga_total,
    critica: a.critica,
    predecessoras: predecessorasDe(a.predecessoras),
    locais: locaisDe(a.locais),
    observacao: a.observacao,
    // Texto exato do banco: volta no lote e o banco compara em microssegundos (nunca via Date).
    versao: a.versao ?? "",
  };
}

/** Todas as atividades do cronograma, passando do teto de 1.000 linhas do PostgREST. */
export async function atividadesDoCronograma(id: string): Promise<AtividadeGrade[]> {
  const supabase = await createClient();
  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase.from("ex_v_atividades").select("*").eq("cronograma_id", id).order("ordem").order("codigo").range(de, ate),
  );
  if (erro) throw new Error(`Não foi possível ler as atividades: ${erro}`);
  return linhas.map(paraAtividade);
}
