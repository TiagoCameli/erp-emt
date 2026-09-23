import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import {
  detectarAnomalias,
  ehEquipamentoSentinela,
  JANELA_D3_DIAS,
  ROTULO_REGRA,
  type Anomalia,
  type EquipamentoParaDeteccao,
  type SaidaParaDeteccao,
} from "@/modules/combustivel/anomalias/detect";
import { fimExclusivoDoDia, inicioDoDia, somarDias, type Periodo } from "@/modules/combustivel/relatorios/periodo";
import { paraNumeroDoBanco, rotuloEquipamento } from "@/modules/manutencao/servicos/formato";

export interface Conferencia {
  motivo: string | null;
  conferidoEm: string;
}

export interface AnomaliaLista extends Anomalia {
  rotuloRegra: string;
  equipamentoRotulo: string | null;
  conferencia: Conferencia | null;
}

export interface ResultadoAnomalias {
  anomalias: AnomaliaLista[];
  pendentes: number;
  conferidas: number;
}

/**
 * Roda a detecção no servidor para o período (dias de Rio Branco, fim incluído).
 *
 * Lê as saídas não excluídas do período e dos 90 dias antes dele (o D3 compara
 * com os 90 dias anteriores a cada saída), paginadas por `todasAsLinhas` porque o
 * PostgREST corta em 1.000 sem avisar. O D5 precisa do último abastecimento de
 * cada equipamento ativo; quem não aparece na janela lida ganha uma consulta de
 * uma linha (são poucas dezenas de equipamentos).
 */
export async function carregarAnomalias(periodo: Periodo): Promise<ResultadoAnomalias> {
  const supabase = await createClient();
  const inicio = inicioDoDia(periodo.de);
  const fim = fimExclusivoDoDia(periodo.ate);
  const buscaDesde = inicioDoDia(somarDias(periodo.de, -JANELA_D3_DIAS));

  const [saidas, equipamentos, conferidas] = await Promise.all([
    todasAsLinhas((de, ate) =>
      supabase
        .from("combustivel_saidas")
        .select(
          "id, data, tipo_consumidor, equipamento_id, placa, transportadora_id, insumo_id, litros, valor_total, preco_unitario",
        )
        .is("excluido_em", null)
        .gte("data", buscaDesde)
        .lt("data", fim)
        .order("data")
        .order("id")
        .range(de, ate),
    ),
    todasAsLinhas((de, ate) =>
      supabase.from("equipamentos").select("id, codigo, descricao, placa, ativo").order("id").range(de, ate),
    ),
    todasAsLinhas((de, ate) =>
      supabase
        .from("combustivel_anomalias_conferidas")
        .select("chave, motivo, conferido_em")
        .order("chave")
        .range(de, ate),
    ),
  ]);
  if (saidas.erro || equipamentos.erro || conferidas.erro) {
    throw new Error("Não foi possível carregar as anomalias do combustível");
  }

  const linhasSaida: SaidaParaDeteccao[] = saidas.linhas.map((s) => ({
    id: s.id,
    data: s.data,
    tipoConsumidor: s.tipo_consumidor,
    equipamentoId: s.equipamento_id,
    placa: s.placa,
    transportadoraId: s.transportadora_id,
    insumoId: s.insumo_id,
    litros: paraNumeroDoBanco(s.litros),
    valorTotal: paraNumeroDoBanco(s.valor_total),
    precoUnitario: paraNumeroDoBanco(s.preco_unitario),
  }));

  // D5: último abastecimento antes da janela, só de quem é ativo e não apareceu nela.
  const naJanela = new Set(linhasSaida.map((s) => s.equipamentoId).filter((id): id is string => id !== null));
  const semNaJanela = equipamentos.linhas.filter(
    (e) => e.ativo && !naJanela.has(e.id) && !ehEquipamentoSentinela(e),
  );
  const ultimas = await Promise.all(
    semNaJanela.map(async (e) => {
      const { data, error } = await supabase
        .from("combustivel_saidas")
        .select("data")
        .eq("equipamento_id", e.id)
        .is("excluido_em", null)
        .lt("data", buscaDesde)
        .order("data", { ascending: false })
        .limit(1);
      if (error) throw new Error("Não foi possível ler o último abastecimento dos equipamentos");
      return [e.id, data?.[0]?.data ?? null] as const;
    }),
  );
  const ultimaAntes = new Map(ultimas);

  const listaEquipamentos: EquipamentoParaDeteccao[] = equipamentos.linhas.map((e) => ({
    id: e.id,
    codigo: e.codigo,
    descricao: e.descricao,
    ativo: e.ativo,
    rotulo: rotuloEquipamento(e),
    ultimaSaidaAntesDaJanela: ultimaAntes.get(e.id) ?? null,
  }));

  const insumoIds = [...new Set(linhasSaida.map((s) => s.insumoId))];
  const combustiveis = new Map<string, string>();
  if (insumoIds.length > 0) {
    const { data, error } = await supabase.from("insumos").select("id, nome").in("id", insumoIds);
    if (error) throw new Error("Não foi possível ler os combustíveis");
    for (const insumo of data ?? []) combustiveis.set(insumo.id, insumo.nome);
  }

  const anomalias = detectarAnomalias({
    saidas: linhasSaida,
    equipamentos: listaEquipamentos,
    combustiveis,
    inicio,
    fim,
  });

  const porChave = new Map(conferidas.linhas.map((c) => [c.chave, { motivo: c.motivo, conferidoEm: c.conferido_em }]));
  const rotulos = new Map(listaEquipamentos.map((e) => [e.id, e.rotulo]));
  const lista: AnomaliaLista[] = anomalias.map((a) => ({
    ...a,
    rotuloRegra: ROTULO_REGRA[a.regra],
    equipamentoRotulo: a.equipamentoId ? (rotulos.get(a.equipamentoId) ?? null) : null,
    conferencia: porChave.get(a.id) ?? null,
  }));
  const conferidasNoPeriodo = lista.filter((a) => a.conferencia !== null).length;

  return { anomalias: lista, pendentes: lista.length - conferidasNoPeriodo, conferidas: conferidasNoPeriodo };
}

// ---------------------------------------------------------------------------
// Sem suprimento
// ---------------------------------------------------------------------------

export interface SemSuprimentoLista {
  id: string;
  saidaId: string;
  tanqueNome: string;
  consumidor: string;
  dataSaida: string;
  litrosSolicitados: number;
  litrosSupridos: number;
  litrosSemSuprimento: number;
  revisao: { revisadoEm: string; observacao: string | null } | null;
}

/**
 * Saídas que pediram mais litros do que o tanque tinha na data (o PEPS grava a
 * falta em `combustivel_sem_suprimento`). Sem filtro de período: é fila de
 * revisão, e uma pendência de três meses atrás continua pendente.
 *
 * A revisão mora em outra tabela porque o recálculo do PEPS apaga e refaz as
 * linhas de sem suprimento a cada mudança no tanque.
 */
export async function listarSemSuprimento(): Promise<SemSuprimentoLista[]> {
  const supabase = await createClient();
  const [linhas, revisoes, tanques, equipamentos] = await Promise.all([
    todasAsLinhas((de, ate) =>
      supabase
        .from("combustivel_sem_suprimento")
        .select(
          "id, saida_id, tanque_id, data_saida, litros_solicitados, litros_supridos, litros_sem_suprimento, saida:combustivel_saidas!inner(excluido_em, tipo_consumidor, equipamento_id, placa)",
        )
        .is("saida.excluido_em", null)
        .order("data_saida", { ascending: false })
        .order("id")
        .range(de, ate),
    ),
    todasAsLinhas((de, ate) =>
      supabase
        .from("combustivel_sem_suprimento_revisao")
        .select("saida_id, revisado_em, observacao")
        .order("saida_id")
        .range(de, ate),
    ),
    todasAsLinhas((de, ate) => supabase.from("tanques").select("id, nome, apelido").order("id").range(de, ate)),
    todasAsLinhas((de, ate) =>
      supabase.from("equipamentos").select("id, codigo, descricao, placa").order("id").range(de, ate),
    ),
  ]);
  if (linhas.erro || revisoes.erro || tanques.erro || equipamentos.erro) {
    throw new Error("Não foi possível carregar as saídas sem suprimento");
  }

  const revisaoPorSaida = new Map(
    revisoes.linhas.map((r) => [r.saida_id, { revisadoEm: r.revisado_em, observacao: r.observacao }]),
  );
  const nomeTanque = new Map(tanques.linhas.map((t) => [t.id, t.apelido?.trim() || t.nome]));
  const nomeEquipamento = new Map(equipamentos.linhas.map((e) => [e.id, rotuloEquipamento(e)]));

  return linhas.linhas.map((linha) => {
    const saida = linha.saida;
    const consumidor =
      saida.tipo_consumidor === "carreta_transportadora"
        ? `Carreta ${saida.placa ?? "sem placa"}`
        : (nomeEquipamento.get(saida.equipamento_id ?? "") ?? "Equipamento não encontrado");
    return {
      id: linha.id,
      saidaId: linha.saida_id,
      tanqueNome: nomeTanque.get(linha.tanque_id) ?? "Tanque não encontrado",
      consumidor,
      dataSaida: linha.data_saida,
      litrosSolicitados: paraNumeroDoBanco(linha.litros_solicitados),
      litrosSupridos: paraNumeroDoBanco(linha.litros_supridos),
      litrosSemSuprimento: paraNumeroDoBanco(linha.litros_sem_suprimento),
      revisao: revisaoPorSaida.get(linha.saida_id) ?? null,
    };
  });
}
