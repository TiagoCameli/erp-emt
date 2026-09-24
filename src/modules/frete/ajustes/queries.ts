import "server-only";

import type { EventoTrilha } from "@/components/canonicos/trilha";
import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import { listarCentrosCusto, type CentroCustoOpcao } from "@/modules/_shared/centro-custo/queries";
import { obrasParaAlocacao } from "@/modules/combustivel/abastecimentos/opcoes";
import { limitesDoPeriodo, type FiltrosAjustes } from "@/modules/frete/ajustes/filtros";
import {
  eventosDoAuditLog,
  eventosDoRegistro,
  type RegistroAuditoriaAjuste,
} from "@/modules/frete/ajustes/regras";
import type { SinalAjuste } from "@/modules/frete/ajustes/schemas";
import { nomesUsuariosFrete } from "@/modules/frete/_shared/usuarios";
import { paraNumeroDoBanco } from "@/modules/manutencao/servicos/formato";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface AjusteLista {
  id: string;
  transportadoraId: string;
  transportadoraNome: string;
  sinal: SinalAjuste;
  valor: number;
  data: string;
  mesReferencia: string;
  centroCustoId: string | null;
  obraNome: string | null;
  descricao: string;
  status: string;
  motivoStatus: string | null;
  origem: string;
  createdAt: string;
  criadoPorNome: string | null;
  aprovadoEm: string | null;
  aprovadoPorNome: string | null;
  updatedAt: string;
  atualizadoPorNome: string | null;
}

export interface OpcaoTransportadora {
  id: string;
  nome: string;
  ativo: boolean;
}

const COLUNAS =
  "id, transportadora_id, sinal, valor, data, mes_referencia, centro_custo_id, descricao, status, motivo_status, origem, created_at, created_by, aprovado_em, aprovado_por, updated_at, updated_by";

type LinhaAjuste = {
  id: string;
  transportadora_id: string;
  sinal: string;
  valor: number;
  data: string;
  mes_referencia: string;
  centro_custo_id: string | null;
  descricao: string;
  status: string;
  motivo_status: string | null;
  origem: string;
  created_at: string;
  created_by: string | null;
  aprovado_em: string | null;
  aprovado_por: string | null;
  updated_at: string;
  updated_by: string | null;
};

function nomeFornecedor(f: { razao_social: string; nome_fantasia: string | null }): string {
  return f.nome_fantasia?.trim() || f.razao_social;
}

async function mapaEmLotes<T extends { id: string }>(
  ids: readonly string[],
  buscar: (lote: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>,
  nome: (linha: T) => string,
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  const unicos = [...new Set(ids)];
  for (let i = 0; i < unicos.length; i += 100) {
    const { data, error } = await buscar(unicos.slice(i, i + 100));
    if (error) return mapa;
    for (const linha of data ?? []) mapa.set(linha.id, nome(linha));
  }
  return mapa;
}

async function completar(supabase: Supabase, linhas: LinhaAjuste[]): Promise<AjusteLista[]> {
  const semNulo = (v: (string | null)[]) => v.filter((x): x is string => x !== null);
  const [transportadoras, centros, usuarios] = await Promise.all([
    mapaEmLotes<{ id: string; razao_social: string; nome_fantasia: string | null }>(
      linhas.map((l) => l.transportadora_id),
      (lote) => supabase.from("fornecedores").select("id, razao_social, nome_fantasia").in("id", lote),
      nomeFornecedor,
    ),
    mapaEmLotes(
      semNulo(linhas.map((l) => l.centro_custo_id)),
      (lote) => supabase.from("centros_custo").select("id, nome").in("id", lote),
      (c) => c.nome,
    ),
    nomesUsuariosFrete(supabase, linhas.flatMap((l) => [l.created_by, l.aprovado_por, l.updated_by])),
  ]);
  const nome = (mapa: Map<string, string>, id: string | null) => (id ? (mapa.get(id) ?? null) : null);
  return linhas.map((l) => ({
    id: l.id,
    transportadoraId: l.transportadora_id,
    transportadoraNome: transportadoras.get(l.transportadora_id) ?? "",
    sinal: l.sinal === "debito" ? "debito" : "credito",
    valor: paraNumeroDoBanco(l.valor),
    data: l.data,
    mesReferencia: l.mes_referencia,
    centroCustoId: l.centro_custo_id,
    obraNome: nome(centros, l.centro_custo_id),
    descricao: l.descricao,
    status: l.status,
    motivoStatus: l.motivo_status,
    origem: l.origem,
    createdAt: l.created_at,
    criadoPorNome: nome(usuarios, l.created_by),
    aprovadoEm: l.aprovado_em,
    aprovadoPorNome: nome(usuarios, l.aprovado_por),
    updatedAt: l.updated_at,
    atualizadoPorNome: nome(usuarios, l.updated_by),
  }));
}

/** Todos os ajustes do filtro, do mais novo para o mais velho. */
export async function listarAjustes(filtros: FiltrosAjustes): Promise<AjusteLista[]> {
  const supabase = await createClient();
  const { desde, antes } = limitesDoPeriodo(filtros);
  const { linhas, erro } = await todasAsLinhas((de, ate) => {
    let consulta = supabase.from("frete_ajustes").select(COLUNAS);
    if (filtros.transportadoraId) consulta = consulta.eq("transportadora_id", filtros.transportadoraId);
    if (filtros.status) consulta = consulta.eq("status", filtros.status);
    if (filtros.sinal) consulta = consulta.eq("sinal", filtros.sinal);
    if (desde) consulta = consulta.gte("data", desde);
    if (antes) consulta = consulta.lt("data", antes);
    return consulta
      .order("data", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(de, ate);
  });
  if (erro) throw new Error("Não foi possível carregar os ajustes");
  return completar(supabase, linhas);
}

export async function buscarAjuste(id: string): Promise<AjusteLista | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("frete_ajustes").select(COLUNAS).eq("id", id).maybeSingle();
  if (error) throw new Error("Não foi possível carregar o ajuste");
  if (!data) return null;
  const [ajuste] = await completar(supabase, [data]);
  return ajuste ?? null;
}

/**
 * Histórico do ajuste. Com acesso à auditoria, cada transição do audit_log vira
 * evento; sem ele (a RLS devolve vazio), a Trilha sai do próprio registro.
 */
export async function trilhaAjuste(ajuste: AjusteLista): Promise<EventoTrilha[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, acao, usuario_id, dados_antes, dados_depois, criado_em")
    .eq("tabela", "frete_ajustes")
    .eq("registro_id", ajuste.id)
    .order("criado_em", { ascending: false })
    .order("id", { ascending: false });

  if (error || !data || data.length === 0) return eventosDoRegistro(ajuste);

  const nomes = await nomesUsuariosFrete(
    supabase,
    data.map((l) => l.usuario_id),
  );
  const registros: RegistroAuditoriaAjuste[] = data.map((l) => ({
    id: String(l.id),
    acao: l.acao,
    usuarioNome: l.usuario_id ? (nomes.get(l.usuario_id) ?? null) : "Sistema",
    dadosAntes: l.dados_antes,
    dadosDepois: l.dados_depois,
    criadoEm: l.criado_em,
  }));
  return eventosDoAuditLog(registros);
}

/**
 * Quem pode receber ajuste: fornecedor marcado como transportadora ou dono de
 * tanque (a mesma trava de `fn_frete_exigir_transportadora`). Os inativos vêm
 * para o filtro e para o rótulo de ajuste antigo.
 */
export async function listarTransportadorasAjuste(): Promise<OpcaoTransportadora[]> {
  const supabase = await createClient();
  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("fornecedores")
      .select("id, razao_social, nome_fantasia, ativo")
      .or("eh_transportadora.eq.true,eh_dona_de_tanque.eq.true")
      .order("razao_social")
      .order("id")
      .range(de, ate),
  );
  if (erro) throw new Error("Não foi possível carregar as transportadoras");
  return linhas
    .map((f) => ({ id: f.id, nome: nomeFornecedor(f), ativo: f.ativo }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Obras (raízes de obra do centro de custo) para o campo "Obra". */
export async function listarObrasAjuste(): Promise<CentroCustoOpcao[]> {
  return obrasParaAlocacao(await listarCentrosCusto());
}
