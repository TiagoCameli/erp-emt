import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import { saidasDoRecorte, type Modo } from "@/modules/combustivel/anomalias/base";
import { carregarBaseCombustivel } from "@/modules/combustivel/anomalias/queries";
import {
  calcularKpis,
  custoPorObra,
  ID_NAO_IDENTIFICADO,
  ID_SEM_OBRA,
  mixCombustivel,
  percentualDoTanque,
  periodoAnterior,
  topConsumidores,
  type KpisPainel,
  type LinhaPainel,
} from "@/modules/combustivel/painel/calculo";
import type { Periodo } from "@/modules/combustivel/relatorios/periodo";
import { paraNumeroDoBanco } from "@/modules/manutencao/servicos/formato";

export interface TanquePainel {
  id: string;
  nome: string;
  combustivel: string | null;
  nivel: number;
  capacidade: number;
  percentual: number | null;
}

export interface LinhaNomeada extends LinhaPainel {
  nome: string;
  /** Código do equipamento ou transportadora da carreta. */
  detalhe: string;
}

export interface PainelCombustivel {
  kpis: KpisPainel;
  /** Nome e detalhe do maior consumidor (equipamento ou placa). */
  maior: { nome: string; detalhe: string } | null;
  porCombustivel: LinhaNomeada[];
  topConsumidores: LinhaNomeada[];
  porObra: LinhaNomeada[];
  tanques: TanquePainel[];
}

/**
 * A Visão Geral da origem sobre o recorte (modo + período), no servidor. As saídas vêm da
 * base compartilhada (a mesma leitura das anomalias na requisição). Tanque externo fica
 * fora da lista de níveis: é de terceiro e não tem estoque no ERP.
 */
export async function carregarPainel(periodo: Periodo, modo: Modo): Promise<PainelCombustivel> {
  const supabase = await createClient();
  const [base, tanques] = await Promise.all([
    carregarBaseCombustivel(),
    todasAsLinhas((inicio, fim) =>
      supabase
        .from("tanques")
        .select("id, nome, apelido, capacidade_litros, nivel_atual_litros, combustivel_atual_id")
        .eq("ativo", true)
        .eq("eh_externo", false)
        .order("nome")
        .order("id")
        .range(inicio, fim),
    ),
  ]);
  if (tanques.erro) throw new Error("Não foi possível carregar os tanques");

  const anterior = periodoAnterior(periodo.de, periodo.ate);
  const noPeriodo = saidasDoRecorte(base.saidas, modo, periodo.de, periodo.ate);
  const kpis = calcularKpis(noPeriodo, saidasDoRecorte(base.saidas, modo, anterior.de, anterior.ate), modo);

  const equipamentoPorId = new Map(base.equipamentos.map((e) => [e.id, e]));
  const transportadoraDaPlaca = (placa: string): string => {
    const ref = noPeriodo.find((s) => (s.placa || "").trim() === placa);
    return ref?.transportadoraId ? (base.transportadoraNome.get(ref.transportadoraId) ?? "") : "";
  };
  const nomeDoConsumidor = (id: string): { nome: string; detalhe: string } => {
    if (modo === "carretas") return { nome: id, detalhe: transportadoraDaPlaca(id) };
    if (id === ID_NAO_IDENTIFICADO) return { nome: "Não identificado", detalhe: "Saídas em Outros" };
    const e = equipamentoPorId.get(id);
    return e
      ? { nome: e.descricao, detalhe: e.codigo?.trim() || e.tipo?.trim() || "" }
      : { nome: "Equipamento não encontrado", detalhe: "" };
  };

  const maior = kpis.maiorChave ? nomeDoConsumidor(kpis.maiorChave) : null;

  return {
    kpis,
    maior,
    porCombustivel: mixCombustivel(noPeriodo).map((l) => ({
      ...l,
      nome: base.combustivelNome.get(l.id) ?? "Outros",
      detalhe: "",
    })),
    topConsumidores: topConsumidores(noPeriodo, modo).map((l) => ({ ...l, ...nomeDoConsumidor(l.id) })),
    porObra: custoPorObra(noPeriodo).map((l) => ({
      ...l,
      nome: l.id === ID_SEM_OBRA ? "Sem obra" : (base.obraNome.get(l.id) ?? "Obra não encontrada"),
      detalhe: "",
    })),
    tanques: tanques.linhas.map((t) => {
      const nivel = paraNumeroDoBanco(t.nivel_atual_litros);
      const capacidade = paraNumeroDoBanco(t.capacidade_litros);
      return {
        id: t.id,
        nome: t.apelido?.trim() || t.nome,
        combustivel: t.combustivel_atual_id ? (base.combustivelNome.get(t.combustivel_atual_id) ?? null) : null,
        nivel,
        capacidade,
        percentual: percentualDoTanque(nivel, capacidade),
      };
    }),
  };
}
