import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { StatusFrota } from "@/modules/manutencao/_shared/formato";

/** Status de OS que mantêm o equipamento "em manutenção". */
const STATUS_OS_ABERTAS = ["aberta", "em_execucao"] as const;

/** Uma linha do Painel de frota: um equipamento ativo com seus agregados. */
export interface FrotaLinha {
  equipamentoId: string;
  descricao: string;
  codigo: string | null;
  placa: string | null;
  controlePor: string;
  status: StatusFrota;
  custoManutencao: number;
  custoCombustivel: number;
  custoTotal: number;
  ultimoHorimetro: number | null;
  ultimoKm: number | null;
  custoPorHora: number | null;
}

/** Resumo da frota para os KPIs do topo. */
export interface FrotaResumo {
  totalEquipamentos: number;
  emManutencao: number;
  custoTotalFrota: number;
}

/** Última leitura (valor) por tipo de um equipamento. */
interface UltimaLeitura {
  valor: number;
  data: string;
  createdAt: string;
}

/**
 * Painel de frota (somente leitura). Carrega os equipamentos ativos e, em
 * paralelo, agrega ordens de serviço, abastecimentos e leituras. Os agregados
 * são montados em JS com Maps por equipamento_id (uma query por tabela) para
 * evitar N+1. Ordena por descrição.
 */
export async function listarFrota(): Promise<FrotaLinha[]> {
  const supabase = await createClient();

  const [equipamentosResp, ordensResp, abastecimentosResp, leiturasResp] =
    await Promise.all([
      supabase
        .from("equipamentos")
        .select("id, descricao, codigo, placa, controle_por")
        .eq("ativo", true)
        .order("descricao"),
      supabase
        .from("ordens_servico")
        .select("equipamento_id, status, custo_total"),
      supabase.from("abastecimentos").select("equipamento_id, custo_total"),
      supabase
        .from("leituras_equipamento")
        .select("equipamento_id, tipo, valor, data, created_at"),
    ]);

  if (equipamentosResp.error) {
    throw new Error("Não foi possível carregar os equipamentos");
  }
  if (ordensResp.error) {
    throw new Error("Não foi possível carregar as ordens de serviço");
  }
  if (abastecimentosResp.error) {
    throw new Error("Não foi possível carregar os abastecimentos");
  }
  if (leiturasResp.error) {
    throw new Error("Não foi possível carregar as leituras dos equipamentos");
  }

  // Manutenção: soma das OS concluídas; "em manutenção" se houver OS aberta.
  const custoManutencaoPorEquip = new Map<string, number>();
  const emManutencaoPorEquip = new Set<string>();
  for (const os of ordensResp.data ?? []) {
    if (os.status === "concluida") {
      const atual = custoManutencaoPorEquip.get(os.equipamento_id) ?? 0;
      custoManutencaoPorEquip.set(
        os.equipamento_id,
        atual + (os.custo_total ?? 0),
      );
    }
    if ((STATUS_OS_ABERTAS as readonly string[]).includes(os.status)) {
      emManutencaoPorEquip.add(os.equipamento_id);
    }
  }

  // Combustível: soma do custo_total dos abastecimentos.
  const custoCombustivelPorEquip = new Map<string, number>();
  for (const abastecimento of abastecimentosResp.data ?? []) {
    const atual = custoCombustivelPorEquip.get(abastecimento.equipamento_id) ?? 0;
    custoCombustivelPorEquip.set(
      abastecimento.equipamento_id,
      atual + (abastecimento.custo_total ?? 0),
    );
  }

  // Leituras: a mais recente por (equipamento, tipo), desempate por created_at.
  const ultimaLeituraPorEquip = new Map<string, Map<string, UltimaLeitura>>();
  for (const leitura of leiturasResp.data ?? []) {
    let porTipo = ultimaLeituraPorEquip.get(leitura.equipamento_id);
    if (!porTipo) {
      porTipo = new Map<string, UltimaLeitura>();
      ultimaLeituraPorEquip.set(leitura.equipamento_id, porTipo);
    }
    const atual = porTipo.get(leitura.tipo);
    const ehMaisRecente =
      !atual ||
      leitura.data > atual.data ||
      (leitura.data === atual.data && leitura.created_at > atual.createdAt);
    if (ehMaisRecente) {
      porTipo.set(leitura.tipo, {
        valor: leitura.valor,
        data: leitura.data,
        createdAt: leitura.created_at,
      });
    }
  }

  return (equipamentosResp.data ?? []).map((equipamento) => {
    const custoManutencao = custoManutencaoPorEquip.get(equipamento.id) ?? 0;
    const custoCombustivel = custoCombustivelPorEquip.get(equipamento.id) ?? 0;
    const custoTotal = custoManutencao + custoCombustivel;

    const leituras = ultimaLeituraPorEquip.get(equipamento.id);
    const ultimoHorimetro = leituras?.get("horimetro")?.valor ?? null;
    const ultimoKm = leituras?.get("km")?.valor ?? null;

    const custoPorHora =
      equipamento.controle_por === "horimetro" &&
      ultimoHorimetro !== null &&
      ultimoHorimetro > 0
        ? custoTotal / ultimoHorimetro
        : null;

    return {
      equipamentoId: equipamento.id,
      descricao: equipamento.descricao,
      codigo: equipamento.codigo,
      placa: equipamento.placa,
      controlePor: equipamento.controle_por,
      status: emManutencaoPorEquip.has(equipamento.id)
        ? "em_manutencao"
        : "operando",
      custoManutencao,
      custoCombustivel,
      custoTotal,
      ultimoHorimetro,
      ultimoKm,
      custoPorHora,
    };
  });
}

/** Resumo da frota a partir das linhas já carregadas (sem nova query). */
export function resumirFrota(frota: FrotaLinha[]): FrotaResumo {
  return {
    totalEquipamentos: frota.length,
    emManutencao: frota.filter((linha) => linha.status === "em_manutencao")
      .length,
    custoTotalFrota: frota.reduce((soma, linha) => soma + linha.custoTotal, 0),
  };
}
