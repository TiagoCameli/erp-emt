import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import {
  custoNoPeriodo,
  janelasDoPainel,
  maioresCustosPorEquipamento,
  type OsConcluidaResumo,
} from "@/modules/manutencao/painel/calculo";
import { paraNumeroDoBanco, rotuloEquipamento } from "@/modules/manutencao/servicos/formato";

export interface LinhaMaiorCusto {
  equipamentoId: string;
  equipamentoNome: string;
  custo: number;
  quantidadeOs: number;
}

export interface PainelManutencao {
  abertas: number;
  emExecucao: number;
  equipamentosEmManutencao: number;
  custoMes: number;
  custoAno: number;
  osConcluidasMes: number;
  osConcluidasAno: number;
  maioresCustos: LinhaMaiorCusto[];
  janelas: ReturnType<typeof janelasDoPainel>;
}

/**
 * Números do painel, todos no servidor.
 *
 * Contagens com `head: true` (o banco conta, nada desce). O custo sai das OS
 * CONCLUÍDAS do ano, só com as três colunas que a conta usa, paginadas por
 * `todasAsLinhas` (o PostgREST corta em 1.000 sem avisar). RPC de agregação
 * seria o caminho mais curto, mas não entra nesta entrega.
 *
 * Custo é por data de CONCLUSÃO: OS aberta ainda não tem custo fechado, e somá-la
 * faria o mês "subir" e "descer" conforme alguém lança e tira peça.
 */
export async function carregarPainel(hoje: string): Promise<PainelManutencao> {
  const supabase = await createClient();
  const janelas = janelasDoPainel(hoje);

  const [abertas, emExecucao, emManutencao, concluidasAno] = await Promise.all([
    supabase
      .from("ordens_servico")
      .select("id", { count: "exact", head: true })
      .eq("status", "aberta")
      .is("excluido_em", null),
    supabase
      .from("ordens_servico")
      .select("id", { count: "exact", head: true })
      .eq("status", "em_execucao")
      .is("excluido_em", null),
    supabase
      .from("equipamentos")
      .select("id", { count: "exact", head: true })
      .eq("status", "em_manutencao"),
    todasAsLinhas((de, ate) =>
      supabase
        .from("ordens_servico")
        .select("equipamento_id, data_conclusao, custo_total")
        .eq("status", "concluida")
        .is("excluido_em", null)
        .gte("data_conclusao", janelas.anoDe)
        .lte("data_conclusao", janelas.anoAte)
        .order("id")
        .range(de, ate),
    ),
  ]);

  if (abertas.error || emExecucao.error || emManutencao.error || concluidasAno.erro) {
    throw new Error("Não foi possível carregar o painel da manutenção");
  }

  const os: OsConcluidaResumo[] = concluidasAno.linhas
    .filter((linha): linha is typeof linha & { data_conclusao: string } => linha.data_conclusao !== null)
    .map((linha) => ({
      equipamentoId: linha.equipamento_id,
      dataConclusao: linha.data_conclusao,
      custoTotal: paraNumeroDoBanco(linha.custo_total),
    }));

  const top = maioresCustosPorEquipamento(os, 10);
  const nomes = new Map<string, string>();
  if (top.length > 0) {
    const { data, error } = await supabase
      .from("equipamentos")
      .select("id, codigo, descricao, placa")
      .in(
        "id",
        top.map((linha) => linha.equipamentoId),
      );
    if (error) throw new Error("Não foi possível carregar os equipamentos do painel");
    for (const equipamento of data ?? []) nomes.set(equipamento.id, rotuloEquipamento(equipamento));
  }

  return {
    abertas: abertas.count ?? 0,
    emExecucao: emExecucao.count ?? 0,
    equipamentosEmManutencao: emManutencao.count ?? 0,
    custoMes: custoNoPeriodo(os, janelas.mesDe, janelas.mesAte),
    custoAno: custoNoPeriodo(os, janelas.anoDe, janelas.anoAte),
    osConcluidasMes: os.filter((item) => item.dataConclusao >= janelas.mesDe && item.dataConclusao <= janelas.mesAte)
      .length,
    osConcluidasAno: os.length,
    maioresCustos: top.map((linha) => ({
      ...linha,
      equipamentoNome: nomes.get(linha.equipamentoId) ?? "Equipamento não encontrado",
    })),
    janelas,
  };
}
