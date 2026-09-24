import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import {
  aplicarFiltroGlobal,
  aplicarFiltroGlobalEntradas,
  opcoesDoFiltroGlobal,
  type EntradaComFornecedor,
  type FiltroGlobal,
  type OpcoesFiltroGlobal,
  periodoEfetivo,
  periodoFechado,
} from "@/modules/combustivel/_shared/filtro-global";
import {
  detectarNaBase,
  EQUIPAMENTO_DESCONHECIDO,
  relogioDeParede,
  type BaseCombustivel,
} from "@/modules/combustivel/anomalias/base";
import { carregarBaseCombustivel } from "@/modules/combustivel/anomalias/queries";
import {
  calcularKpis,
  custoPorObra,
  evolucaoNasTresGranularidades,
  heatmapDiaHora,
  ID_NAO_IDENTIFICADO,
  ID_SEM_OBRA,
  mixCombustivel,
  periodoAnterior,
  precoPorFornecedor,
  sparksDosKpis,
  topConsumidores,
  ultimasSaidas,
  type BaldeEvolucao,
  type Granularidade,
  type HeatmapDiaHora,
  type KpisPainel,
  type SparksKpis,
} from "@/modules/combustivel/painel/calculo";
import { corDoCombustivel } from "@/modules/combustivel/painel/cores";
import { paraNumeroDoBanco } from "@/modules/manutencao/servicos/formato";

/** Uma entrada de combustível no formato que o filtro global e o R$/L por fornecedor leem. */
export interface EntradaPainel extends EntradaComFornecedor {
  id: string;
  litros: number;
  valorTotal: number;
}

/**
 * Todas as entradas NÃO EXCLUÍDAS (poucas centenas), com o nome do fornecedor. `cache`:
 * o painel e as opções da barra leem uma vez por requisição. `data` é o relógio de parede
 * de Rio Branco, como o das saídas.
 */
export const carregarEntradasCombustivel = cache(async (): Promise<EntradaPainel[]> => {
  const supabase = await createClient();
  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("combustivel_entradas")
      .select("id, data_hora, tanque_id, insumo_id, fornecedor_id, litros, valor_total, fornecedores(razao_social, nome_fantasia)")
      .is("excluido_em", null)
      .order("data_hora", { ascending: false })
      .order("id")
      .range(de, ate),
  );
  if (erro) throw new Error("Não foi possível carregar as entradas de combustível");
  return linhas.map((linha) => ({
    id: linha.id,
    data: relogioDeParede(linha.data_hora),
    tanqueId: linha.tanque_id,
    insumoId: linha.insumo_id,
    fornecedorId: linha.fornecedor_id,
    fornecedorNome: linha.fornecedores
      ? linha.fornecedores.nome_fantasia?.trim() || linha.fornecedores.razao_social
      : null,
    litros: paraNumeroDoBanco(linha.litros),
    valorTotal: paraNumeroDoBanco(linha.valor_total),
  }));
});

/**
 * As opções da barra de filtros global, para qualquer aba do Combustível:
 * `<BarraFiltrosCombustivel opcoes={await carregarOpcoesFiltroGlobal(filtro)} ... />`.
 */
export async function carregarOpcoesFiltroGlobal(filtro: FiltroGlobal): Promise<OpcoesFiltroGlobal> {
  const [base, entradas] = await Promise.all([carregarBaseCombustivel(), carregarEntradasCombustivel()]);
  return opcoesDoFiltroGlobal(base, entradas, filtro);
}

/** As chaves das anomalias conferidas (saem do KPI, como as "verificadas" da origem). */
async function lerChavesConferidas(): Promise<Set<string>> {
  const supabase = await createClient();
  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase.from("combustivel_anomalias_conferidas").select("chave").order("chave").range(de, ate),
  );
  if (erro) throw new Error("Não foi possível ler as anomalias conferidas");
  return new Set(linhas.map((l) => l.chave));
}

export interface ConsumidorPainel {
  /** Equipamento (id), placa, ou `_naoid` (o sentinela). */
  id: string;
  nome: string;
  /** Código do equipamento, transportadora da carreta, ou "N saídas sem ID". */
  detalhe: string;
  litros: number;
  custo: number;
  qtd: number;
  sentinela: boolean;
}

export interface FatiaMix {
  id: string;
  nome: string;
  litros: number;
  custo: number;
  pct: number;
  cor: string;
}

export interface ObraPainel {
  id: string;
  nome: string;
  litros: number;
  custo: number;
  pct: number;
}

export interface FornecedorPainel {
  id: string;
  nome: string;
  litros: number;
  custo: number;
  rPorL: number;
  qtd: number;
}

export interface SaidaRecente {
  id: string;
  /** Relógio de parede de Rio Branco. */
  data: string;
  /** Nome do equipamento (próprios) ou placa (carretas). */
  consumidor: string | null;
  codigo: string | null;
  operador: string | null;
  transportadora: string | null;
  combustivel: string;
  corCombustivel: string;
  obra: string | null;
  litros: number;
  valorTotal: number;
}

export interface PainelCombustivel {
  /**
   * O período concreto dos gráficos: o escolhido, ou (sem período) a extensão das saídas do
   * recorte. O filtro continua "qualquer data"; isto só dá as pontas dos baldes.
   */
  periodo: { de: string; ate: string };
  /** Há período anterior para comparar? Só com as duas pontas escolhidas. */
  comparavel: boolean;
  kpis: KpisPainel;
  sparks: SparksKpis;
  /** Nome e detalhe do maior consumidor (equipamento ou placa). */
  maior: { nome: string; detalhe: string } | null;
  anomalias: { criticas: number; atencao: number; total: number };
  evolucao: Record<Granularidade, BaldeEvolucao[]>;
  mix: FatiaMix[];
  /** TODOS os consumidores do recorte: o gráfico ordena por litros ou R$ e corta em 10. */
  consumidores: ConsumidorPainel[];
  obras: ObraPainel[];
  fornecedores: { linhas: FornecedorPainel[]; media: number };
  heatmap: HeatmapDiaHora;
  ultimas: SaidaRecente[];
  opcoes: OpcoesFiltroGlobal;
}

function nomeDoConsumidor(
  base: BaseCombustivel,
  filtro: FiltroGlobal,
  transportadoraDaPlaca: (placa: string) => string,
  id: string,
): { nome: string; detalhe: string } {
  if (filtro.modo === "carretas") return { nome: id, detalhe: transportadoraDaPlaca(id) };
  if (id === ID_NAO_IDENTIFICADO) return { nome: "Não identificado", detalhe: "Saídas em Outros" };
  const e = base.equipamentos.find((eq) => eq.id === id);
  return e ? { nome: e.descricao, detalhe: e.codigo?.trim() || e.tipo?.trim() || "" } : { nome: "Equipamento não encontrado", detalhe: "" };
}

/**
 * A Visão Geral da origem (v2/visao-geral/VisaoGeralTab) sobre o recorte global, no
 * servidor: saídas e entradas passam pelo filtro global; o período anterior (mesma
 * duração) usa os mesmos filtros; as anomalias saem das saídas do recorte contra o banco
 * inteiro (o D3 e o D5 precisam dele), sem as conferidas.
 */
export async function carregarPainel(filtro: FiltroGlobal, hoje: string): Promise<PainelCombustivel> {
  const [base, entradas, conferidas] = await Promise.all([
    carregarBaseCombustivel(),
    carregarEntradasCombustivel(),
    lerChavesConferidas(),
  ]);
  const noPeriodo = aplicarFiltroGlobal(base.saidas, filtro);
  const comparavel = periodoFechado(filtro.periodo);
  const { de, ate } = periodoEfetivo(filtro.periodo, noPeriodo, hoje);
  const anterior = comparavel ? aplicarFiltroGlobal(base.saidas, filtro, periodoAnterior(de, ate)) : [];
  const kpis = calcularKpis(noPeriodo, anterior, filtro.modo);

  let criticas = 0;
  let atencao = 0;
  for (const a of detectarNaBase(base, noPeriodo)) {
    if (conferidas.has(a.id)) continue;
    if (a.severity === "critical") criticas += 1;
    else if (a.severity === "warning") atencao += 1;
  }

  const transportadoraDaPlaca = (placa: string): string => {
    const ref = noPeriodo.find((s) => (s.placa || "").trim() === placa);
    return ref?.transportadoraId ? (base.transportadoraNome.get(ref.transportadoraId) ?? "") : "";
  };
  const nome = (id: string) => nomeDoConsumidor(base, filtro, transportadoraDaPlaca, id);
  const equipamentoPorId = new Map(base.equipamentos.map((e) => [e.id, e]));

  const precos = precoPorFornecedor(aplicarFiltroGlobalEntradas(entradas, filtro));
  const fornecedorNome = new Map(entradas.map((e) => [e.fornecedorId, e.fornecedorNome]));

  return {
    periodo: { de, ate },
    comparavel,
    kpis,
    sparks: sparksDosKpis(noPeriodo, de, ate),
    maior: kpis.maiorChave ? nome(kpis.maiorChave) : null,
    anomalias: { criticas, atencao, total: criticas + atencao },
    evolucao: evolucaoNasTresGranularidades(noPeriodo, de, ate),
    mix: mixCombustivel(noPeriodo).map((l) => {
      const nomeCombustivel = l.id === "_outros" ? "Outros" : (base.combustivelNome.get(l.id) ?? "Outros");
      return { id: l.id, nome: nomeCombustivel, litros: l.litros, custo: l.custo, pct: l.pct, cor: corDoCombustivel(nomeCombustivel, l.id) };
    }),
    consumidores: topConsumidores(noPeriodo, filtro.modo, Number.POSITIVE_INFINITY).map((l) => {
      const sentinela = l.id === ID_NAO_IDENTIFICADO;
      const rotulo = nome(l.id);
      return {
        id: l.id,
        nome: rotulo.nome,
        detalhe: sentinela ? `${l.qtd} saída${l.qtd !== 1 ? "s" : ""} sem ID` : rotulo.detalhe,
        litros: l.litros,
        custo: l.custo,
        qtd: l.qtd,
        sentinela,
      };
    }),
    obras: custoPorObra(noPeriodo).map((l) => ({
      id: l.id,
      nome: l.id === ID_SEM_OBRA ? "Sem obra" : (base.obraNome.get(l.id) ?? "Obra não encontrada"),
      litros: l.litros,
      custo: l.custo,
      pct: l.pct,
    })),
    fornecedores: {
      media: precos.media,
      linhas: precos.linhas.map((l) => ({ ...l, nome: fornecedorNome.get(l.id)?.trim() || "Fornecedor sem nome" })),
    },
    heatmap: heatmapDiaHora(noPeriodo),
    ultimas: ultimasSaidas(noPeriodo).map((s) => {
      const equipamento =
        s.equipamentoIdReal && s.equipamentoId !== EQUIPAMENTO_DESCONHECIDO ? equipamentoPorId.get(s.equipamentoIdReal) : undefined;
      const combustivel = base.combustivelNome.get(s.tipoCombustivel) ?? "Sem combustível";
      return {
        id: s.id,
        data: s.data,
        consumidor:
          filtro.modo === "carretas" ? (s.placa?.trim() || null) : s.equipamentoId === EQUIPAMENTO_DESCONHECIDO ? "Não identificado" : (equipamento?.descricao ?? null),
        codigo: equipamento?.codigo?.trim() || null,
        operador: s.motorista?.trim() || null,
        transportadora: s.transportadoraId ? (base.transportadoraNome.get(s.transportadoraId) ?? null) : null,
        combustivel,
        corCombustivel: corDoCombustivel(combustivel),
        obra: s.obraId ? (base.obraNome.get(s.obraId) ?? null) : null,
        litros: s.litros,
        valorTotal: s.valorTotal,
      };
    }),
    opcoes: opcoesDoFiltroGlobal(base, entradas, filtro),
  };
}
