import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import {
  detectarNaBase,
  EQUIPAMENTO_DESCONHECIDO,
  ehEquipamentoSentinela,
  montarSaidaBase,
  opcoesDeEquipamento,
  raizDoCentro,
  rotuloOrigemEquipamento,
  saidasDoRecorte,
  type BaseCombustivel,
  type EquipamentoBase,
  type LinhaSaidaBanco,
  type Modo,
} from "@/modules/combustivel/anomalias/base";
import { DETECTOR_LABEL, type Anomalia } from "@/modules/combustivel/anomalias/detect";
import type { Periodo } from "@/modules/combustivel/relatorios/periodo";
import { paraNumeroDoBanco, rotuloEquipamento } from "@/modules/manutencao/servicos/formato";

const SELECT_SAIDA =
  "id, data, origem, tipo_consumidor, tanque_id, equipamento_id, transportadora_id, placa, motorista, insumo_id, " +
  "litros, preco_unitario, valor_total, pago, pago_em, observacoes, created_by, " +
  "abastecimento_alocacoes(centro_custo_id, percentual)";

/**
 * Todas as saídas NÃO EXCLUÍDAS e os cadastros, no formato da origem. É o que a origem
 * carrega (`useSaidasCombustivel` busca a tabela inteira, página por página) e o que a
 * detecção precisa: o D3 olha 90 dias até hoje e o D5 a última saída de cada
 * equipamento, independente do período da tela.
 *
 * `cache` do React: painel e anomalias na mesma requisição leem uma vez só.
 * Paginado por `todasAsLinhas` (o PostgREST corta em 1.000 sem avisar), com desempate
 * por id (senão a paginação repete e pula linha).
 */
export const carregarBaseCombustivel = cache(async (): Promise<BaseCombustivel> => {
  const supabase = await createClient();

  const [saidas, equipamentos, insumos, centros, tanques] = await Promise.all([
    todasAsLinhas<LinhaSaidaBanco>((de, ate) =>
      supabase
        .from("combustivel_saidas")
        .select(SELECT_SAIDA)
        .is("excluido_em", null)
        .order("data", { ascending: false })
        .order("id", { ascending: false })
        .range(de, ate)
        .returns<LinhaSaidaBanco[]>(),
    ),
    todasAsLinhas((de, ate) =>
      supabase
        .from("equipamentos")
        .select("id, codigo, descricao, placa, tipo, marca, modelo, ativo")
        .order("id")
        .range(de, ate),
    ),
    todasAsLinhas((de, ate) => supabase.from("insumos").select("id, nome").order("id").range(de, ate)),
    todasAsLinhas((de, ate) => supabase.from("centros_custo").select("id, nome, pai_id").order("id").range(de, ate)),
    todasAsLinhas((de, ate) =>
      supabase
        .from("tanques")
        .select("id, nome, apelido, capacidade_litros, eh_externo, proprietario_id, ativo")
        .order("id")
        .range(de, ate),
    ),
  ]);
  if (saidas.erro || equipamentos.erro || insumos.erro || centros.erro || tanques.erro) {
    throw new Error("Não foi possível carregar as saídas de combustível");
  }

  const listaEquipamentos: EquipamentoBase[] = equipamentos.linhas.map((e) => ({
    id: e.id,
    codigo: e.codigo,
    descricao: e.descricao,
    placa: e.placa,
    tipo: e.tipo,
    marca: e.marca,
    modelo: e.modelo,
    ativo: e.ativo,
    sentinela: ehEquipamentoSentinela(e),
  }));
  const sentinelas = new Set(listaEquipamentos.filter((e) => e.sentinela).map((e) => e.id));
  const arvore = new Map(centros.linhas.map((c) => [c.id, { nome: c.nome, paiId: c.pai_id }]));

  const listaSaidas = saidas.linhas.map((linha) => montarSaidaBase(linha, sentinelas, arvore));

  const obraNome = new Map<string, string>();
  for (const c of centros.linhas) {
    const raiz = raizDoCentro(c.id, arvore);
    if (raiz && raiz.id === c.id) obraNome.set(c.id, c.nome);
  }

  // Transportadoras: as das saídas e as donas de tanque. São poucas dezenas.
  const fornecedorIds = [
    ...new Set(
      [
        ...listaSaidas.map((s) => s.transportadoraId),
        ...tanques.linhas.map((t) => t.proprietario_id),
      ].filter((id): id is string => id !== null),
    ),
  ];
  const transportadoraNome = new Map<string, string>();
  for (let i = 0; i < fornecedorIds.length; i += 100) {
    const { data, error } = await supabase
      .from("fornecedores")
      .select("id, razao_social, nome_fantasia")
      .in("id", fornecedorIds.slice(i, i + 100));
    if (error) throw new Error("Não foi possível ler as transportadoras");
    for (const f of data ?? []) transportadoraNome.set(f.id, f.nome_fantasia?.trim() || f.razao_social);
  }

  return {
    saidas: listaSaidas,
    equipamentos: listaEquipamentos,
    combustivelNome: new Map(insumos.linhas.map((i) => [i.id, i.nome])),
    obraNome,
    tanques: tanques.linhas.map((t) => ({
      id: t.id,
      nome: t.nome,
      apelido: t.apelido,
      nomeExibicao: t.apelido?.trim() || t.nome,
      capacidadeLitros: paraNumeroDoBanco(t.capacidade_litros),
      ehExterno: t.eh_externo,
      proprietarioId: t.proprietario_id,
      ativo: t.ativo,
    })),
    transportadoraNome,
  };
});

// ---------------------------------------------------------------------------
// Anomalias
// ---------------------------------------------------------------------------

export interface Conferencia {
  motivo: string | null;
  conferidoEm: string;
}

/** Uma saída afetada, para a lista da origem (SaidasAfetadasList) e a atribuição. */
export interface SaidaDaAnomalia {
  id: string;
  /** Relógio de parede de Rio Branco. */
  data: string;
  tanque: string | null;
  obra: string | null;
  consumidor: string;
  litros: number;
  valorTotal: number;
}

export interface AnomaliaLista extends Anomalia {
  rotuloDetector: string;
  equipamentoRotulo: string | null;
  conferencia: Conferencia | null;
  saidas: SaidaDaAnomalia[];
}

export interface ResultadoAnomalias {
  anomalias: AnomaliaLista[];
  pendentes: number;
  conferidas: number;
  /** Opções do seletor de equipamento da atribuição. */
  equipamentos: { valor: string; rotulo: string }[];
}

/** A conferência mora no banco pela chave (o id determinístico da anomalia). */
async function lerConferidas(): Promise<Map<string, Conferencia>> {
  const supabase = await createClient();
  const conferidas = await todasAsLinhas((de, ate) =>
    supabase
      .from("combustivel_anomalias_conferidas")
      .select("chave, motivo, conferido_em")
      .order("chave")
      .range(de, ate),
  );
  if (conferidas.erro) throw new Error("Não foi possível ler as anomalias conferidas");
  return new Map(conferidas.linhas.map((c) => [c.chave, { motivo: c.motivo, conferidoEm: c.conferido_em }]));
}

/**
 * A aba Anomalias da origem: `saidasNoPeriodo` = saídas do modo (próprios ou carretas)
 * no período, `saidasTodas` = o banco inteiro.
 */
export async function carregarAnomalias(periodo: Periodo, modo: Modo): Promise<ResultadoAnomalias> {
  const [base, porChave] = await Promise.all([carregarBaseCombustivel(), lerConferidas()]);
  const anomalias = detectarNaBase(base, saidasDoRecorte(base.saidas, modo, periodo.de, periodo.ate));

  const saidaPorId = new Map(base.saidas.map((s) => [s.id, s]));
  const equipamentoPorId = new Map(base.equipamentos.map((e) => [e.id, e]));
  const tanqueNome = new Map(base.tanques.map((t) => [t.id, t.nomeExibicao]));
  const rotuloSentinela =
    base.equipamentos.find((e) => e.sentinela) !== undefined
      ? rotuloEquipamento(base.equipamentos.find((e) => e.sentinela)!)
      : "Outros";
  const rotuloDoEquipamento = (id: string | null | undefined): string | null => {
    if (!id) return null;
    if (id === EQUIPAMENTO_DESCONHECIDO) return rotuloSentinela;
    const equipamento = equipamentoPorId.get(id);
    return equipamento ? rotuloEquipamento(equipamento) : null;
  };

  const lista: AnomaliaLista[] = anomalias.map((a) => ({
    ...a,
    rotuloDetector: DETECTOR_LABEL[a.detector],
    equipamentoRotulo: rotuloDoEquipamento(a.affectedEquipamentoId),
    conferencia: porChave.get(a.id) ?? null,
    saidas: a.affectedSaidaIds.flatMap((id) => {
      const s = saidaPorId.get(id);
      if (!s) return [];
      const consumidor =
        s.tipoConsumidor === "equipamento_proprio"
          ? s.equipamentoId === EQUIPAMENTO_DESCONHECIDO
            ? "Não identificado"
            : (() => {
                const e = s.equipamentoIdReal ? equipamentoPorId.get(s.equipamentoIdReal) : undefined;
                return e ? rotuloOrigemEquipamento(e) : "Equipamento não encontrado";
              })()
          : [s.placa ?? "Sem placa", s.transportadoraId ? base.transportadoraNome.get(s.transportadoraId) : null]
              .filter(Boolean)
              .join(" · ");
      return [
        {
          id: s.id,
          data: s.data,
          tanque: s.tanqueId ? (tanqueNome.get(s.tanqueId) ?? null) : null,
          obra: s.obraId ? (base.obraNome.get(s.obraId) ?? null) : null,
          consumidor,
          litros: s.litros,
          valorTotal: s.valorTotal,
        },
      ];
    }),
  }));
  const conferidasNoPeriodo = lista.filter((a) => a.conferencia !== null).length;

  return {
    anomalias: lista,
    pendentes: lista.length - conferidasNoPeriodo,
    conferidas: conferidasNoPeriodo,
    equipamentos: opcoesDeEquipamento(base.equipamentos),
  };
}

/**
 * O KPI "Anomalias" da Visão Geral da origem: críticas + atenção do recorte, tirando as
 * verificadas (conferidas). D5 (informação) não conta.
 */
export async function contarAnomaliasDoPainel(
  periodo: Periodo,
  modo: Modo,
): Promise<{ criticas: number; atencao: number; total: number; conferidas: number }> {
  const [base, porChave] = await Promise.all([carregarBaseCombustivel(), lerConferidas()]);
  const anomalias = detectarNaBase(base, saidasDoRecorte(base.saidas, modo, periodo.de, periodo.ate));
  let criticas = 0;
  let atencao = 0;
  let conferidas = 0;
  for (const a of anomalias) {
    if (porChave.has(a.id)) {
      conferidas += 1;
      continue;
    }
    if (a.severity === "critical") criticas += 1;
    else if (a.severity === "warning") atencao += 1;
  }
  return { criticas, atencao, total: criticas + atencao, conferidas };
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
