import "server-only";

import { dataHojeISO } from "@/lib/formatadores";
import { createClient } from "@/lib/supabase/server";
import type {
  IntervaloTipo,
  TipoLeitura,
} from "@/modules/manutencao/planos-preventivos/schemas";
import {
  preverAtividade,
  type PlanoAtividade,
  type PrevisaoAtividade,
  type UltimasLeituras,
} from "@/modules/manutencao/planos-preventivos/previsao";

export type {
  PlanoAtividade,
  PrevisaoAtividade,
} from "@/modules/manutencao/planos-preventivos/previsao";

/* ------------------------------------------------------------------ */
/* Tipos de saída                                                     */
/* ------------------------------------------------------------------ */

/** Linha da listagem de modelos de plano. */
export interface PlanoLista {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  atividades: PlanoAtividade[];
  /** Quantidade de equipamentos que usam este plano (atribuições ativas). */
  equipamentos: number;
  criadoEm: string;
}

/** Atribuição de plano a equipamento, já com a previsão calculada. */
export interface AtribuicaoLista {
  id: string;
  equipamentoId: string;
  equipamentoDescricao: string;
  equipamentoPlaca: string | null;
  equipamentoControlePor: string;
  planoId: string;
  planoNome: string;
  baseHorimetro: number | null;
  baseKm: number | null;
  baseData: string;
  ultimoHorimetro: number | null;
  ultimoKm: number | null;
  atividades: PrevisaoAtividade[];
  /** "vencido" se qualquer atividade vencida, senão "em dia". */
  status: "vencido" | "em_dia";
  criadoEm: string;
}

/** Linha de histórico de leitura manual. */
export interface LeituraRecente {
  id: string;
  equipamentoId: string;
  equipamentoDescricao: string;
  tipo: TipoLeitura;
  valor: number;
  data: string;
  origem: string;
  criadoEm: string;
}


/* ------------------------------------------------------------------ */
/* Queries                                                            */
/* ------------------------------------------------------------------ */

/**
 * Lista os modelos de plano com suas atividades (embed) e a contagem de
 * equipamentos que usam cada plano (atribuições ativas), ordenados por nome.
 */
export async function listarPlanos(): Promise<PlanoLista[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("planos_preventivos")
    .select(
      "id, nome, descricao, ativo, created_at, plano_atividades(id, descricao, intervalo_tipo, intervalo_valor, ordem)",
    )
    .order("nome");

  if (error) throw new Error("Não foi possível carregar os planos");

  const { data: vinculos, error: erroVinculos } = await supabase
    .from("equipamento_planos")
    .select("plano_id")
    .eq("ativo", true);

  if (erroVinculos) {
    throw new Error("Não foi possível carregar o uso dos planos");
  }

  const usoPorPlano = new Map<string, number>();
  for (const vinculo of vinculos ?? []) {
    usoPorPlano.set(
      vinculo.plano_id,
      (usoPorPlano.get(vinculo.plano_id) ?? 0) + 1,
    );
  }

  return (data ?? []).map((plano) => ({
    id: plano.id,
    nome: plano.nome,
    descricao: plano.descricao,
    ativo: plano.ativo,
    atividades: (plano.plano_atividades ?? [])
      .map((atividade) => ({
        id: atividade.id,
        descricao: atividade.descricao,
        intervaloTipo: atividade.intervalo_tipo as IntervaloTipo,
        intervaloValor: atividade.intervalo_valor,
        ordem: atividade.ordem,
      }))
      .sort((a, b) => a.ordem - b.ordem),
    equipamentos: usoPorPlano.get(plano.id) ?? 0,
    criadoEm: plano.created_at,
  }));
}

/**
 * Lista as atribuições ativas (equipamento + plano + atividades + últimas
 * leituras do equipamento) já com a previsão da próxima manutenção calculada.
 * As leituras saem numa única query agregada por equipamento (Map), sem N+1.
 */
export async function listarAtribuicoes(): Promise<AtribuicaoLista[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("equipamento_planos")
    .select(
      "id, equipamento_id, plano_id, base_horimetro, base_km, base_data, created_at, equipamentos(descricao, placa, controle_por), planos_preventivos(nome, plano_atividades(id, descricao, intervalo_tipo, intervalo_valor, ordem))",
    )
    .eq("ativo", true)
    .order("created_at");

  if (error) throw new Error("Não foi possível carregar as atribuições");

  const atribuicoes = data ?? [];
  const equipamentoIds = Array.from(
    new Set(atribuicoes.map((a) => a.equipamento_id)),
  );

  // Últimas leituras por equipamento numa só query: ordena por data desc e o
  // primeiro de cada (equipamento, tipo) é o mais recente.
  const ultimasPorEquipamento = new Map<string, UltimasLeituras>();
  if (equipamentoIds.length > 0) {
    const { data: leituras, error: erroLeituras } = await supabase
      .from("leituras_equipamento")
      .select("equipamento_id, tipo, valor, data")
      .in("equipamento_id", equipamentoIds)
      .order("data", { ascending: false })
      .order("created_at", { ascending: false });

    if (erroLeituras) {
      throw new Error("Não foi possível carregar as leituras");
    }

    for (const leitura of leituras ?? []) {
      const atual = ultimasPorEquipamento.get(leitura.equipamento_id) ?? {
        horimetro: null,
        km: null,
      };
      if (leitura.tipo === "horimetro" && atual.horimetro === null) {
        atual.horimetro = leitura.valor;
      } else if (leitura.tipo === "km" && atual.km === null) {
        atual.km = leitura.valor;
      }
      ultimasPorEquipamento.set(leitura.equipamento_id, atual);
    }
  }

  const hoje = dataHojeISO();

  return atribuicoes.map((atribuicao) => {
    const ultimas = ultimasPorEquipamento.get(atribuicao.equipamento_id) ?? {
      horimetro: null,
      km: null,
    };

    const atividades: PlanoAtividade[] = (
      atribuicao.planos_preventivos?.plano_atividades ?? []
    )
      .map((atividade) => ({
        id: atividade.id,
        descricao: atividade.descricao,
        intervaloTipo: atividade.intervalo_tipo as IntervaloTipo,
        intervaloValor: atividade.intervalo_valor,
        ordem: atividade.ordem,
      }))
      .sort((a, b) => a.ordem - b.ordem);

    const previsoes = atividades.map((atividade) =>
      preverAtividade(
        atividade,
        {
          horimetro: atribuicao.base_horimetro,
          km: atribuicao.base_km,
          data: atribuicao.base_data,
        },
        ultimas,
        hoje,
      ),
    );

    const status = previsoes.some((p) => p.vencido) ? "vencido" : "em_dia";

    return {
      id: atribuicao.id,
      equipamentoId: atribuicao.equipamento_id,
      equipamentoDescricao: atribuicao.equipamentos?.descricao ?? "",
      equipamentoPlaca: atribuicao.equipamentos?.placa ?? null,
      equipamentoControlePor: atribuicao.equipamentos?.controle_por ?? "nenhum",
      planoId: atribuicao.plano_id,
      planoNome: atribuicao.planos_preventivos?.nome ?? "",
      baseHorimetro: atribuicao.base_horimetro,
      baseKm: atribuicao.base_km,
      baseData: atribuicao.base_data,
      ultimoHorimetro: ultimas.horimetro,
      ultimoKm: ultimas.km,
      atividades: previsoes,
      status,
      criadoEm: atribuicao.created_at,
    };
  });
}

/**
 * Histórico recente de leituras manuais, opcionalmente de um equipamento,
 * das mais novas para as mais antigas. Limite enxuto para exibição.
 */
export async function listarLeiturasRecentes(
  equipamentoId?: string,
): Promise<LeituraRecente[]> {
  const supabase = await createClient();

  let query = supabase
    .from("leituras_equipamento")
    .select(
      "id, equipamento_id, tipo, valor, data, origem, created_at, equipamentos(descricao)",
    )
    .order("data", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);

  if (equipamentoId) {
    query = query.eq("equipamento_id", equipamentoId);
  }

  const { data, error } = await query;

  if (error) throw new Error("Não foi possível carregar as leituras");

  return (data ?? []).map((leitura) => ({
    id: leitura.id,
    equipamentoId: leitura.equipamento_id,
    equipamentoDescricao: leitura.equipamentos?.descricao ?? "",
    tipo: leitura.tipo as TipoLeitura,
    valor: leitura.valor,
    data: leitura.data,
    origem: leitura.origem,
    criadoEm: leitura.created_at,
  }));
}
