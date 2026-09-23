import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import { percentualDoTanque, resumirMes, type ResumoMes } from "@/modules/combustivel/painel/calculo";
import { diasDoMes, fimExclusivoDoDia, inicioDoDia } from "@/modules/combustivel/relatorios/periodo";
import { paraNumeroDoBanco, rotuloEquipamento } from "@/modules/manutencao/servicos/formato";

export interface TanquePainel {
  id: string;
  nome: string;
  combustivel: string | null;
  nivel: number;
  capacidade: number;
  percentual: number | null;
}

export interface LinhaNomeada {
  id: string;
  nome: string;
  litros: number;
  valor: number;
  abastecimentos: number;
}

export interface PainelCombustivel {
  resumo: ResumoMes;
  porCombustivel: LinhaNomeada[];
  maioresConsumidores: LinhaNomeada[];
  tanques: TanquePainel[];
}

/**
 * Números do mês (yyyy-MM, dias de Rio Branco), todos no servidor.
 *
 * Saídas paginadas por `todasAsLinhas` (o PostgREST corta em 1.000 sem avisar),
 * só com as colunas que a conta usa. Tanque externo fica fora da lista de
 * níveis: é de terceiro e não tem estoque no ERP.
 */
export async function carregarPainel(mes: string): Promise<PainelCombustivel> {
  const supabase = await createClient();
  const { de, ate } = diasDoMes(mes);

  const [saidas, tanques] = await Promise.all([
    todasAsLinhas((inicio, fim) =>
      supabase
        .from("combustivel_saidas")
        .select("id, tipo_consumidor, equipamento_id, insumo_id, litros, valor_total")
        .is("excluido_em", null)
        .gte("data", inicioDoDia(de))
        .lt("data", fimExclusivoDoDia(ate))
        .order("id")
        .range(inicio, fim),
    ),
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
  if (saidas.erro || tanques.erro) throw new Error("Não foi possível carregar a visão geral do combustível");

  const resumo = resumirMes(
    saidas.linhas.map((s) => ({
      tipoConsumidor: s.tipo_consumidor,
      equipamentoId: s.equipamento_id,
      insumoId: s.insumo_id,
      litros: paraNumeroDoBanco(s.litros),
      valorTotal: paraNumeroDoBanco(s.valor_total),
    })),
  );

  const insumoIds = [
    ...new Set([
      ...resumo.porCombustivel.map((c) => c.id),
      ...tanques.linhas.map((t) => t.combustivel_atual_id).filter((id): id is string => id !== null),
    ]),
  ];
  const equipamentoIds = resumo.maioresConsumidores.map((e) => e.id);

  const [insumos, equipamentos] = await Promise.all([
    insumoIds.length > 0
      ? supabase.from("insumos").select("id, nome").in("id", insumoIds)
      : Promise.resolve({ data: [], error: null }),
    equipamentoIds.length > 0
      ? supabase.from("equipamentos").select("id, codigo, descricao, placa").in("id", equipamentoIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (insumos.error || equipamentos.error) throw new Error("Não foi possível carregar os nomes da visão geral");

  const nomeInsumo = new Map((insumos.data ?? []).map((i) => [i.id, i.nome]));
  const nomeEquipamento = new Map((equipamentos.data ?? []).map((e) => [e.id, rotuloEquipamento(e)]));

  return {
    resumo,
    porCombustivel: resumo.porCombustivel.map((c) => ({ ...c, nome: nomeInsumo.get(c.id) ?? "Combustível não encontrado" })),
    maioresConsumidores: resumo.maioresConsumidores.map((e) => ({
      ...e,
      nome: nomeEquipamento.get(e.id) ?? "Equipamento não encontrado",
    })),
    tanques: tanques.linhas.map((t) => {
      const nivel = paraNumeroDoBanco(t.nivel_atual_litros);
      const capacidade = paraNumeroDoBanco(t.capacidade_litros);
      return {
        id: t.id,
        nome: t.apelido?.trim() || t.nome,
        combustivel: t.combustivel_atual_id ? (nomeInsumo.get(t.combustivel_atual_id) ?? null) : null,
        nivel,
        capacidade,
        percentual: percentualDoTanque(nivel, capacidade),
      };
    }),
  };
}
