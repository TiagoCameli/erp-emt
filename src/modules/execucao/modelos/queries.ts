import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";

/** Leitura da biblioteca de serviços, dos calendários e dos feriados. */

export interface Servico {
  id: string;
  codigo: string;
  nome: string;
  unidadeId: string | null;
  unidadeSigla: string | null;
  produtividadePadrao: string | null;
  ceuAberto: boolean;
  ativo: boolean;
  observacoes: string | null;
}

export async function listarServicos(): Promise<Servico[]> {
  const supabase = await createClient();
  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase.from("ex_servicos").select("*, unidades_medida(sigla)").order("codigo").range(de, ate),
  );
  if (erro) throw new Error(`Não foi possível ler os serviços: ${erro}`);
  return linhas.map((s) => ({
    id: s.id,
    codigo: s.codigo,
    nome: s.nome,
    unidadeId: s.unidade_id,
    unidadeSigla: s.unidades_medida?.sigla ?? null,
    produtividadePadrao: s.produtividade_padrao === null ? null : String(s.produtividade_padrao),
    ceuAberto: s.ceu_aberto,
    ativo: s.ativo,
    observacoes: s.observacoes,
  }));
}

export interface Calendario {
  id: string;
  nome: string;
  /** Modelo da biblioteca (true) ou calendário próprio de um cronograma (false). */
  modelo: boolean;
  paiId: string | null;
  horasSeg: string;
  horasTer: string;
  horasQua: string;
  horasQui: string;
  horasSex: string;
  horasSab: string;
  horasDom: string;
  feriadosAbrangencia: ("nacional" | "AC" | "municipal")[];
  municipio: string | null;
  chuvosoInicioMes: number | null;
  chuvosoFimMes: number | null;
  padraoEmpresa: boolean;
  observacoes: string | null;
}

type LinhaCalendario = {
  id: string; nome: string; modelo: boolean; pai_id: string | null;
  horas_seg: number; horas_ter: number; horas_qua: number; horas_qui: number; horas_sex: number; horas_sab: number; horas_dom: number;
  feriados_abrangencia: string[]; municipio: string | null; chuvoso_inicio_mes: number | null; chuvoso_fim_mes: number | null;
  padrao_empresa: boolean; observacoes: string | null;
};

function paraCalendario(c: LinhaCalendario): Calendario {
  return {
    id: c.id,
    nome: c.nome,
    modelo: c.modelo,
    paiId: c.pai_id,
    horasSeg: String(c.horas_seg),
    horasTer: String(c.horas_ter),
    horasQua: String(c.horas_qua),
    horasQui: String(c.horas_qui),
    horasSex: String(c.horas_sex),
    horasSab: String(c.horas_sab),
    horasDom: String(c.horas_dom),
    feriadosAbrangencia: c.feriados_abrangencia as Calendario["feriadosAbrangencia"],
    municipio: c.municipio,
    chuvosoInicioMes: c.chuvoso_inicio_mes,
    chuvosoFimMes: c.chuvoso_fim_mes,
    padraoEmpresa: c.padrao_empresa,
    observacoes: c.observacoes,
  };
}

/** Só os modelos da biblioteca. */
export async function listarCalendarios(): Promise<Calendario[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("ex_calendarios").select("*").eq("modelo", true).is("excluido_em", null).order("nome");
  if (error) throw new Error(`Não foi possível ler os calendários: ${error.message}`);
  return (data ?? []).map(paraCalendario);
}

/** Um calendário qualquer (modelo ou próprio de cronograma), para o drawer aberto a partir do cronograma. */
export async function calendarioPorId(id: string): Promise<Calendario | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("ex_calendarios").select("*").eq("id", id).is("excluido_em", null).maybeSingle();
  if (error) throw new Error(`Não foi possível ler o calendário: ${error.message}`);
  return data ? paraCalendario(data) : null;
}

export interface Excecao {
  data: string;
  horas: string;
  tipo: "feriado" | "paralisacao" | "extra";
  descricao: string;
  /** Vem do calendário pai: só leitura aqui. */
  herdada: boolean;
  /** Nome do calendário de onde a exceção herdada vem. */
  origemNome: string | null;
}

/** Exceções do calendário e, só em leitura, as do pai (herdada: true). As do próprio vêm primeiro. */
export async function excecoesDoCalendario(id: string): Promise<Excecao[]> {
  const supabase = await createClient();
  const { data: cal, error: erroCal } = await supabase.from("ex_calendarios").select("pai_id").eq("id", id).maybeSingle();
  if (erroCal) throw new Error(`Não foi possível ler o calendário: ${erroCal.message}`);
  const paiId = cal?.pai_id ?? null;

  const ids = paiId ? [id, paiId] : [id];
  const [{ data, error }, pai] = await Promise.all([
    supabase.from("ex_calendario_excecoes").select("*").in("calendario_id", ids).order("data"),
    paiId ? supabase.from("ex_calendarios").select("nome").eq("id", paiId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (error) throw new Error(`Não foi possível ler as exceções: ${error.message}`);
  const mapear = (e: NonNullable<typeof data>[number]): Excecao => ({
    data: e.data,
    horas: String(e.horas),
    tipo: e.tipo as Excecao["tipo"],
    descricao: e.descricao,
    herdada: e.calendario_id !== id,
    origemNome: e.calendario_id !== id ? (pai.data?.nome ?? null) : null,
  });
  const linhas = (data ?? []).map(mapear);
  return [...linhas.filter((e) => !e.herdada), ...linhas.filter((e) => e.herdada)];
}

export async function unidadesMedida(): Promise<{ id: string; sigla: string; nome: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("unidades_medida").select("id, sigla, nome").eq("ativo", true).order("sigla");
  if (error) throw new Error(`Não foi possível ler as unidades: ${error.message}`);
  return data ?? [];
}

export interface Feriado {
  id: string;
  data: string;
  nome: string;
  abrangencia: "nacional" | "AC" | "municipal";
  municipio: string | null;
}

/** Feriados em ordem de data; de um ano só, ou de todos quando `ano` é omitido. */
export async function listarFeriados(ano?: number): Promise<Feriado[]> {
  const supabase = await createClient();
  const { linhas, erro } = await todasAsLinhas((de, ate) => {
    let q = supabase.from("ex_feriados").select("*");
    if (ano !== undefined) q = q.gte("data", `${ano}-01-01`).lte("data", `${ano}-12-31`);
    return q.order("data").order("nome").range(de, ate);
  });
  if (erro) throw new Error(`Não foi possível ler os feriados: ${erro}`);
  return linhas.map((f) => ({
    id: f.id,
    data: f.data,
    nome: f.nome,
    abrangencia: f.abrangencia as Feriado["abrangencia"],
    municipio: f.municipio,
  }));
}
