import "server-only";

import { createClient } from "@/lib/supabase/server";
import { custoPorCentroCusto } from "@/modules/financeiro/relatorios/queries";
import { custoPorObra } from "@/modules/gestao/_shared/agregacao";
import {
  custoZerado,
  totalCusto,
  type CustoPorGrupo,
} from "@/modules/gestao/_shared/calculo";

/** Custo de uma obra quebrado por grupo, com o total já somado. */
export interface CustoObraLinha {
  obraId: string;
  obraNome: string;
  obraLote: string | null;
  custo: CustoPorGrupo;
  custoTotal: number;
}

/** Soma dos grupos de custo de todas as obras, para os KPIs do topo. */
export interface CustoResumo {
  total: number;
  porGrupo: CustoPorGrupo;
}

/** Comparação orçado x realizado de um centro de custo com orçamento definido. */
export interface OrcamentoLinha {
  centroCustoId: string;
  nome: string;
  codigo: string | null;
  orcado: number;
  realizado: number;
  /** orcado - realizado: positivo sobra, negativo estourou. */
  saldo: number;
  /** realizado / orcado * 100 (0 quando orçado = 0). */
  consumoPct: number;
  /** realizado > orcado. */
  estourado: boolean;
}

export interface PainelCustos {
  obras: CustoObraLinha[];
  resumo: CustoResumo;
  orcamentos: OrcamentoLinha[];
}

/** Soma dois custos por grupo, retornando um novo objeto. */
function somarGrupos(a: CustoPorGrupo, b: CustoPorGrupo): CustoPorGrupo {
  return {
    material: a.material + b.material,
    combustivel: a.combustivel + b.combustivel,
    manutencao: a.manutencao + b.manutencao,
    folha: a.folha + b.folha,
    servicos: a.servicos + b.servicos,
  };
}

/**
 * Painel de custos (somente leitura): custo por obra e por grupo (do núcleo
 * custoPorObra) e orçado x realizado por centro de custo. O realizado por CC
 * reaproveita custoPorCentroCusto (soma dos lancamento_rateios a pagar); o
 * orçado vem de centros_custo.orcamento, considerando só os CCs onde foi
 * definido. CCs com orçamento e sem lançamento entram como realizado zero.
 */
export async function painelCustos(): Promise<PainelCustos> {
  const supabase = await createClient();

  const [custoMapa, realizadoCC, { data: obras, error: erroObras }, { data: centros, error: erroCentros }] =
    await Promise.all([
      custoPorObra(),
      custoPorCentroCusto(),
      supabase.from("obras").select("id, nome, lote").eq("ativo", true).order("nome"),
      supabase
        .from("centros_custo")
        .select("id, nome, codigo, orcamento")
        .not("orcamento", "is", null),
    ]);

  if (erroObras) throw new Error("Não foi possível carregar as obras");
  if (erroCentros) {
    throw new Error("Não foi possível carregar os centros de custo");
  }

  // Custo por obra e por grupo. Só obras ativas, ordenadas por custo total.
  const obrasLinhas: CustoObraLinha[] = (obras ?? [])
    .map((obra) => {
      const custo = custoMapa.get(obra.id) ?? custoZerado();
      return {
        obraId: obra.id,
        obraNome: obra.nome,
        obraLote: obra.lote,
        custo,
        custoTotal: totalCusto(custo),
      };
    })
    .sort((a, b) => b.custoTotal - a.custoTotal);

  // Resumo: soma dos grupos de todas as obras.
  let porGrupo = custoZerado();
  for (const linha of obrasLinhas) {
    porGrupo = somarGrupos(porGrupo, linha.custo);
  }
  const resumo: CustoResumo = { total: totalCusto(porGrupo), porGrupo };

  // Realizado por CC indexado por id, para casar com o orçamento.
  const realizadoPorCC = new Map<string, number>();
  for (const centro of realizadoCC.centros) {
    realizadoPorCC.set(centro.centroCustoId, centro.valor);
  }

  // Orçado x realizado: só CCs com orçamento definido, maior estouro primeiro.
  const orcamentos: OrcamentoLinha[] = (centros ?? [])
    .map((centro) => {
      const orcado = centro.orcamento ?? 0;
      const realizado = realizadoPorCC.get(centro.id) ?? 0;
      const saldo = orcado - realizado;
      const consumoPct = orcado > 0 ? (realizado / orcado) * 100 : 0;
      return {
        centroCustoId: centro.id,
        nome: centro.nome,
        codigo: centro.codigo,
        orcado,
        realizado,
        saldo,
        consumoPct,
        estourado: realizado > orcado,
      };
    })
    .sort((a, b) => a.saldo - b.saldo);

  return { obras: obrasLinhas, resumo, orcamentos };
}
