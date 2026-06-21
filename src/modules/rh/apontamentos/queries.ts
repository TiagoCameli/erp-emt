import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  STATUS_PONTO,
  type StatusPonto,
  type TipoApontamento,
} from "@/modules/rh/_shared/formato";

/** Tamanho padrão de página da listagem de pontos. */
export const TAMANHO_PADRAO = 25;

/** Linha da listagem de pontos do dia. */
export interface PontoLista {
  id: string;
  obraNome: string;
  obraLote: string | null;
  data: string;
  status: StatusPonto;
  qtdColaboradores: number;
  totalHoras: number;
}

/** Página da listagem: itens da página + total geral (count exact). */
export interface PontosPagina {
  itens: PontoLista[];
  total: number;
}

/** Apontamento de um colaborador no dia, com o nome resolvido via join. */
export interface PontoApontamento {
  id: string;
  colaboradorId: string;
  colaboradorNome: string;
  colaboradorFuncao: string | null;
  horasNormais: number;
  horasExtras: number;
  tipo: TipoApontamento;
  observacao: string | null;
}

/** Ponto completo para a tela de detalhe. */
export interface PontoDetalhe {
  id: string;
  obraId: string;
  obraNome: string;
  obraLote: string | null;
  data: string;
  status: StatusPonto;
  encarregadoId: string | null;
  encarregadoNome: string | null;
  observacao: string | null;
  aprovadoEm: string | null;
  apontamentos: PontoApontamento[];
  totalHorasNormais: number;
  totalHorasExtras: number;
}

export interface ListarPontosParams {
  pagina: number;
  tamanho: number;
  obraId?: string;
  status?: string;
}

/**
 * Lista os pontos com paginação server-side (range + count exact), nome da obra
 * resolvido via join. Para cada ponto da página, agrega a contagem de
 * colaboradores e o total de horas (normais + extras) a partir dos apontamentos.
 * Filtros opcionais por obra e por status.
 */
export async function listarPontos(
  params: ListarPontosParams,
): Promise<PontosPagina> {
  const supabase = await createClient();

  const pagina = Math.max(0, params.pagina);
  const tamanho = Math.max(1, params.tamanho);
  const de = pagina * tamanho;
  const ate = de + tamanho - 1;

  let consulta = supabase
    .from("rh_pontos")
    .select(`id, data, status, obras(nome, lote)`, { count: "exact" })
    .order("data", { ascending: false })
    .order("created_at", { ascending: false })
    .range(de, ate);

  if (params.obraId) consulta = consulta.eq("obra_id", params.obraId);
  if (params.status) consulta = consulta.eq("status", params.status);

  const { data, error, count } = await consulta;

  if (error) throw new Error("Não foi possível carregar os pontos");

  const linhas = data ?? [];
  const ids = linhas.map((linha) => linha.id);

  // Apontamentos das linhas da página, para agregar qtd. de colaboradores e horas.
  const agregadoPorPonto = new Map<
    string,
    { qtdColaboradores: number; totalHoras: number }
  >();

  if (ids.length > 0) {
    const { data: apontamentos } = await supabase
      .from("rh_apontamentos")
      .select("ponto_id, horas_normais, horas_extras")
      .in("ponto_id", ids);

    for (const apontamento of apontamentos ?? []) {
      const atual = agregadoPorPonto.get(apontamento.ponto_id) ?? {
        qtdColaboradores: 0,
        totalHoras: 0,
      };
      atual.qtdColaboradores += 1;
      atual.totalHoras += apontamento.horas_normais + apontamento.horas_extras;
      agregadoPorPonto.set(apontamento.ponto_id, atual);
    }
  }

  const itens: PontoLista[] = linhas.map((ponto) => {
    const agregado = agregadoPorPonto.get(ponto.id) ?? {
      qtdColaboradores: 0,
      totalHoras: 0,
    };
    return {
      id: ponto.id,
      obraNome: ponto.obras?.nome ?? "-",
      obraLote: ponto.obras?.lote ?? null,
      data: ponto.data,
      status: statusPonto(ponto.status),
      qtdColaboradores: agregado.qtdColaboradores,
      totalHoras: agregado.totalHoras,
    };
  });

  return { itens, total: count ?? 0 };
}

/**
 * Ponto completo para o detalhe: cabeçalho com obra e encarregado, mais a lista
 * de apontamentos com nome e função do colaborador. O embed do encarregado usa
 * o alias do FK (rh_pontos_encarregado_id_fkey). Retorna null se não achar.
 */
export async function buscarPonto(id: string): Promise<PontoDetalhe | null> {
  const supabase = await createClient();

  const { data: ponto, error } = await supabase
    .from("rh_pontos")
    .select(
      `id, obra_id, data, status, encarregado_id, observacao, aprovado_em,
       obras(nome, lote),
       colaboradores!rh_pontos_encarregado_id_fkey(nome)`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !ponto) return null;

  const { data: apontamentosRaw } = await supabase
    .from("rh_apontamentos")
    .select(
      `id, colaborador_id, horas_normais, horas_extras, tipo, observacao,
       colaboradores(nome, funcao)`,
    )
    .eq("ponto_id", id)
    .order("created_at", { ascending: true });

  const apontamentos: PontoApontamento[] = (apontamentosRaw ?? []).map(
    (linha) => ({
      id: linha.id,
      colaboradorId: linha.colaborador_id,
      colaboradorNome: linha.colaboradores?.nome ?? "-",
      colaboradorFuncao: linha.colaboradores?.funcao ?? null,
      horasNormais: linha.horas_normais,
      horasExtras: linha.horas_extras,
      tipo: tipoApontamento(linha.tipo),
      observacao: linha.observacao,
    }),
  );

  const totalHorasNormais = apontamentos.reduce(
    (soma, linha) => soma + linha.horasNormais,
    0,
  );
  const totalHorasExtras = apontamentos.reduce(
    (soma, linha) => soma + linha.horasExtras,
    0,
  );

  return {
    id: ponto.id,
    obraId: ponto.obra_id,
    obraNome: ponto.obras?.nome ?? "-",
    obraLote: ponto.obras?.lote ?? null,
    data: ponto.data,
    status: statusPonto(ponto.status),
    encarregadoId: ponto.encarregado_id,
    encarregadoNome: ponto.colaboradores?.nome ?? null,
    observacao: ponto.observacao,
    aprovadoEm: ponto.aprovado_em,
    apontamentos,
    totalHorasNormais,
    totalHorasExtras,
  };
}

/** Normaliza o status vindo do banco no tipo do app (default aberto). */
function statusPonto(valor: string): StatusPonto {
  return valor in STATUS_PONTO ? (valor as StatusPonto) : "aberto";
}

/** Normaliza o tipo de apontamento vindo do banco (default normal). */
function tipoApontamento(valor: string): TipoApontamento {
  const tipos: readonly TipoApontamento[] = [
    "normal",
    "falta",
    "atestado",
    "folga",
  ];
  return tipos.includes(valor as TipoApontamento)
    ? (valor as TipoApontamento)
    : "normal";
}

/** Lê um uuid de filtro da query string (ignora valores inválidos). */
export function uuidParam(
  valor: string | string[] | undefined,
): string | undefined {
  if (typeof valor !== "string") return undefined;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    valor,
  )
    ? valor
    : undefined;
}

/** Lê um status de ponto válido da query string (ignora fora do enum). */
export function statusParam(
  valor: string | string[] | undefined,
): StatusPonto | undefined {
  if (typeof valor !== "string") return undefined;
  return valor in STATUS_PONTO ? (valor as StatusPonto) : undefined;
}
