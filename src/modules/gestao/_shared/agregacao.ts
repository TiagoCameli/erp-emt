import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  avancoPercentual,
  calcularMargem,
  custoZerado,
  grupoDoConsumo,
  grupoDoLancamento,
  resolverObraPorCentroCusto,
  totalCusto,
  type CustoPorGrupo,
  type NoCentroCusto,
} from "@/modules/gestao/_shared/calculo";

/** Linha do painel por obra: contratual, medido, faturado, recebido, custo e margem. */
export interface ResultadoObra {
  obraId: string;
  obraNome: string;
  obraLote: string | null;
  contratual: number;
  medido: number;
  avancoPct: number;
  faturado: number;
  recebido: number;
  custo: CustoPorGrupo;
  custoTotal: number;
  margem: number;
  margemPct: number;
}

/** Mapa centro de custo -> obra, resolvido pela árvore. */
async function mapaObraPorCentroCusto(): Promise<Map<string, string | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("centros_custo")
    .select("id, pai_id, obra_id");
  if (error) throw new Error("Não foi possível carregar os centros de custo");
  const nos: NoCentroCusto[] = (data ?? []).map((c) => ({
    id: c.id,
    paiId: c.pai_id,
    obraId: c.obra_id,
  }));
  return resolverObraPorCentroCusto(nos);
}

/** Acumula um custo num mapa por obra. */
function acumular(
  mapa: Map<string, CustoPorGrupo>,
  obraId: string | null,
  grupo: keyof CustoPorGrupo,
  valor: number,
): void {
  if (!obraId || !valor) return;
  const atual = mapa.get(obraId) ?? custoZerado();
  atual[grupo] += valor;
  mapa.set(obraId, atual);
}

/**
 * Custo gerencial por obra e grupo, pelo modelo de consumo: consumo de estoque
 * (material/combustível/peças) + folha + lançamentos a pagar de origem
 * os/diaria/manual. Compra (oc) e receita (fatura) ficam de fora.
 */
export async function custoPorObra(): Promise<Map<string, CustoPorGrupo>> {
  const supabase = await createClient();
  const ccObra = await mapaObraPorCentroCusto();
  const custo = new Map<string, CustoPorGrupo>();

  // 1. Consumo de estoque (saída/consumo), categorizado pelo tipo do insumo.
  const { data: movs, error: erroMov } = await supabase
    .from("estoque_movimentos")
    .select("tipo, custo_total, centro_custo_id, insumos(categorias_insumo(tipo))")
    .in("tipo", ["consumo", "saida"]);
  if (erroMov) throw new Error("Não foi possível carregar o consumo de estoque");
  for (const m of movs ?? []) {
    if (!m.centro_custo_id) continue;
    const grupo = grupoDoConsumo(m.insumos?.categorias_insumo?.tipo ?? null);
    acumular(custo, ccObra.get(m.centro_custo_id) ?? null, grupo, m.custo_total ?? 0);
  }

  // 2. Folha (folha_itens).
  const { data: folha, error: erroFolha } = await supabase
    .from("folha_itens")
    .select("custo_total, centro_custo_id");
  if (erroFolha) throw new Error("Não foi possível carregar a folha");
  for (const f of folha ?? []) {
    if (!f.centro_custo_id) continue;
    acumular(custo, ccObra.get(f.centro_custo_id) ?? null, "folha", f.custo_total ?? 0);
  }

  // 3. Lançamentos a pagar rateados (os/diaria/manual; nunca oc/fatura).
  const { data: rateios, error: erroRat } = await supabase
    .from("lancamento_rateios")
    .select("valor, centro_custo_id, lancamentos(origem, tipo, status)");
  if (erroRat) throw new Error("Não foi possível carregar os rateios");
  for (const r of rateios ?? []) {
    const lanc = r.lancamentos;
    if (!lanc || lanc.tipo !== "a_pagar" || lanc.status === "cancelado") continue;
    const grupo = grupoDoLancamento(lanc.origem);
    if (!grupo) continue;
    acumular(custo, ccObra.get(r.centro_custo_id) ?? null, grupo, r.valor ?? 0);
  }

  return custo;
}

/** Medido acumulado (medições aprovadas) por obra. */
async function medidoPorObra(): Promise<Map<string, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("medicoes")
    .select("obra_id, valor_total")
    .eq("status", "aprovada");
  if (error) throw new Error("Não foi possível carregar as medições");
  const mapa = new Map<string, number>();
  for (const m of data ?? []) {
    mapa.set(m.obra_id, (mapa.get(m.obra_id) ?? 0) + (m.valor_total ?? 0));
  }
  return mapa;
}

/** Valor contratual por obra (soma quantidade contratada x preço da planilha). */
async function contratualPorObra(): Promise<Map<string, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("planilha_itens")
    .select("quantidade_contratada, preco_unitario, planilhas_contratuais(obra_id)");
  if (error) throw new Error("Não foi possível carregar a planilha contratual");
  const mapa = new Map<string, number>();
  for (const i of data ?? []) {
    const obraId = i.planilhas_contratuais?.obra_id;
    if (!obraId) continue;
    const valor = (i.quantidade_contratada ?? 0) * (i.preco_unitario ?? 0);
    mapa.set(obraId, (mapa.get(obraId) ?? 0) + valor);
  }
  return mapa;
}

/** Faturado e recebido por obra (faturas e suas parcelas pagas). */
async function faturamentoPorObra(): Promise<
  Map<string, { faturado: number; recebido: number }>
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("faturas")
    .select("obra_id, valor, status, lancamentos(lancamento_parcelas(valor, status))")
    .eq("status", "aberta");
  if (error) throw new Error("Não foi possível carregar as faturas");
  const mapa = new Map<string, { faturado: number; recebido: number }>();
  for (const f of data ?? []) {
    const atual = mapa.get(f.obra_id) ?? { faturado: 0, recebido: 0 };
    atual.faturado += f.valor ?? 0;
    const parcelas = f.lancamentos?.lancamento_parcelas ?? [];
    for (const p of parcelas) {
      if (p.status === "pago") atual.recebido += p.valor ?? 0;
    }
    mapa.set(f.obra_id, atual);
  }
  return mapa;
}

/** Painel por obra: junta contratual, medido, faturado, recebido, custo e margem. */
export async function painelPorObra(): Promise<ResultadoObra[]> {
  const supabase = await createClient();
  const [{ data: obras, error }, custo, medido, contratual, faturamento] =
    await Promise.all([
      supabase.from("obras").select("id, nome, lote").eq("ativo", true).order("nome"),
      custoPorObra(),
      medidoPorObra(),
      contratualPorObra(),
      faturamentoPorObra(),
    ]);
  if (error) throw new Error("Não foi possível carregar as obras");

  return (obras ?? []).map((obra) => {
    const c = custo.get(obra.id) ?? custoZerado();
    const ct = totalCusto(c);
    const med = medido.get(obra.id) ?? 0;
    const fat = faturamento.get(obra.id) ?? { faturado: 0, recebido: 0 };
    const contr = contratual.get(obra.id) ?? 0;
    const margem = calcularMargem(med, ct);
    return {
      obraId: obra.id,
      obraNome: obra.nome,
      obraLote: obra.lote,
      contratual: contr,
      medido: margem.medido,
      avancoPct: avancoPercentual(med, contr),
      faturado: fat.faturado,
      recebido: fat.recebido,
      custo: c,
      custoTotal: ct,
      margem: margem.margem,
      margemPct: margem.margemPct,
    };
  });
}
