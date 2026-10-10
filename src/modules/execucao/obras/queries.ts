import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import type { TipoLocal, TipoObra } from "@/modules/execucao/_shared/rotulos";

/** Leitura de pastas, obra e locais. A RLS já filtra pela lista da obra. */

export interface Pasta {
  obraId: string;
  obraNome: string;
  tipoObra: TipoObra;
  nCronogramas: number;
  nAtivos: number;
  nRascunhos: number;
  inicioPrevisto: string | null;
  terminoPrevisto: string | null;
}

export async function listarPastas(): Promise<Pasta[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("ex_v_pastas").select("*").order("obra_nome");
  if (error) throw new Error(`Não foi possível ler as pastas: ${error.message}`);
  return (data ?? []).map((p) => ({
    obraId: p.obra_id!,
    obraNome: p.obra_nome ?? "",
    tipoObra: p.tipo_obra as TipoObra,
    nCronogramas: Number(p.n_cronogramas ?? 0),
    nAtivos: Number(p.n_ativos ?? 0),
    nRascunhos: Number(p.n_rascunhos ?? 0),
    inicioPrevisto: p.inicio_previsto,
    terminoPrevisto: p.termino_previsto,
  }));
}

export interface ObraPasta {
  obraId: string;
  obraNome: string;
  tipoObra: TipoObra;
  calendarioId: string | null;
  kmInicial: string | null;
  kmFinal: string | null;
  metrosPorEstaca: string;
  ppcLimite: string;
  observacoes: string | null;
}

export async function pastaDaObra(obraId: string): Promise<ObraPasta | null> {
  const supabase = await createClient();
  const [{ data, error }, nome] = await Promise.all([
    supabase.from("ex_obras").select("*").eq("obra_id", obraId).maybeSingle(),
    supabase.rpc("fn_ex_obra_nome", { p_obra: obraId }),
  ]);
  if (error) throw new Error(`Não foi possível ler a obra: ${error.message}`);
  if (!data) return null;
  return {
    obraId: data.obra_id,
    obraNome: String(nome.data ?? ""),
    tipoObra: data.tipo_obra as TipoObra,
    calendarioId: data.calendario_id,
    kmInicial: data.km_inicial === null ? null : String(data.km_inicial),
    kmFinal: data.km_final === null ? null : String(data.km_final),
    metrosPorEstaca: String(data.metros_por_estaca),
    ppcLimite: String(data.ppc_limite),
    observacoes: data.observacoes,
  };
}

export interface Local {
  id: string;
  paiId: string | null;
  tipo: TipoLocal;
  codigo: string;
  nome: string;
  ordem: number;
  kmInicial: string | null;
  kmFinal: string | null;
  lado: string | null;
  faixa: string | null;
}

export async function locaisDaObra(obraId: string): Promise<Local[]> {
  const supabase = await createClient();
  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase.from("ex_locais").select("*").eq("obra_id", obraId).is("excluido_em", null).order("ordem").order("codigo").range(de, ate),
  );
  if (erro) throw new Error(`Não foi possível ler os locais: ${erro}`);
  return linhas.map((l) => ({
    id: l.id,
    paiId: l.pai_id,
    tipo: l.tipo as TipoLocal,
    codigo: l.codigo,
    nome: l.nome,
    ordem: l.ordem,
    kmInicial: l.km_inicial === null ? null : String(l.km_inicial),
    kmFinal: l.km_final === null ? null : String(l.km_final),
    lado: l.lado,
    faixa: l.faixa,
  }));
}

export interface UsuarioDaObra { id: string; nome: string; email: string; naLista: boolean }

export async function usuariosDaObra(obraId: string): Promise<UsuarioDaObra[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_ex_usuarios_da_obra", { p_obra: obraId });
  if (error) throw new Error(`Não foi possível ler o acesso: ${error.message}`);
  return (data ?? []).map((u) => ({ id: u.usuario_id, nome: u.nome, email: u.email, naLista: u.na_lista }));
}

export interface ObraDisponivel { id: string; nome: string; temPasta: boolean; tenhoAcesso: boolean }

export async function obrasDisponiveis(): Promise<ObraDisponivel[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_ex_obras_disponiveis");
  if (error) throw new Error(`Não foi possível ler as obras: ${error.message}`);
  return (data ?? []).map((o) => ({ id: o.obra_id, nome: o.nome, temPasta: o.tem_pasta, tenhoAcesso: o.tenho_acesso }));
}

export async function calendariosModelo(): Promise<{ id: string; nome: string; padrao: boolean }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ex_calendarios").select("id, nome, padrao_empresa").eq("modelo", true).is("excluido_em", null).order("nome");
  if (error) throw new Error(`Não foi possível ler os calendários: ${error.message}`);
  return (data ?? []).map((c) => ({ id: c.id, nome: c.nome, padrao: c.padrao_empresa }));
}
