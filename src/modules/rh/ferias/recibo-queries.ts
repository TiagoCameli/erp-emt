import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { StatusFerias } from "@/modules/rh/ferias/schemas";
import type { StatusRecibo } from "@/modules/rh/ferias/recibo-schemas";

/**
 * O recibo de férias de uma pessoa, com o contexto que a tela mostra ao lado
 * dos campos digitados.
 *
 * Salário e admissão vêm junto porque a tela MOSTRA o contexto e não calcula
 * nada com ele: quem digita precisa ver de quanto era o salário para conferir
 * se o valor que está digitando faz sentido.
 */
export interface ReciboDetalhe {
  id: string;
  colaboradorId: string;
  colaboradorNome: string;
  vinculo: string | null;
  salarioBase: number | null;
  dataAdmissao: string | null;
  centroCustoId: string | null;
  centroCustoNome: string | null;
  centroCustoCodigo: string | null;
  /** Início do período aquisitivo (yyyy-MM-dd). */
  periodoAquisitivoInicio: string;
  /** Fim do período aquisitivo (yyyy-MM-dd). */
  periodoAquisitivoFim: string;
  /** Início do gozo (yyyy-MM-dd) ou null se só programada. */
  dataInicio: string | null;
  /** Fim do gozo (yyyy-MM-dd) ou null se só programada. */
  dataFim: string | null;
  dias: number;
  /** Status do GOZO. Independente do status do recibo. */
  status: StatusFerias;
  observacao: string | null;
  /** Status do PAGAMENTO. */
  statusRecibo: StatusRecibo;
  valorBruto: number;
  valorInss: number;
  valorIrrf: number;
  valorLiquido: number;
  /** yyyy-MM-dd, ou null quando vale o padrão (dois dias antes do gozo). */
  dataVencimento: string | null;
  lancamentoId: string | null;
  aprovadoEm: string | null;
  aprovadoPorNome: string | null;
  motivoRejeicao: string | null;
}

/**
 * O embed de quem aprovou leva HINT OBRIGATÓRIO.
 *
 * `rh_ferias` tem duas FKs para `usuarios` (`created_by` e `aprovado_por`)
 * desde a migration 20260917140000. Com duas, o PostgREST não escolhe: devolve
 * HTTP 300 / PGRST201 e a tela quebra. E isso passa batido em `tsc`, lint e
 * build, porque é resolvido em tempo de request.
 *
 * Conferido com curl em 18/09/2026: sem o hint, 300; com o hint, 401 (parou na
 * permissão, ou seja, o embed resolveu).
 */
const SELECT_RECIBO = `
  id, colaborador_id, periodo_aquisitivo_inicio, periodo_aquisitivo_fim,
  data_inicio, data_fim, dias, status, observacao,
  status_recibo, valor_bruto, valor_inss, valor_irrf, valor_liquido,
  data_vencimento, centro_custo_id, lancamento_id, aprovado_em, motivo_rejeicao,
  colaboradores(nome, vinculo, salario, data_admissao),
  centros_custo(nome, codigo),
  usuarios!rh_ferias_aprovado_por_fkey(nome)
` as const;

/** Busca um recibo pelo id. Devolve null quando não existe ou não é visível. */
export async function buscarRecibo(id: string): Promise<ReciboDetalhe | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("rh_ferias")
    .select(SELECT_RECIBO)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error("Não foi possível carregar o recibo de férias");
  }
  if (!data) return null;

  return {
    id: data.id,
    colaboradorId: data.colaborador_id,
    colaboradorNome: data.colaboradores?.nome ?? "",
    vinculo: data.colaboradores?.vinculo ?? null,
    salarioBase: data.colaboradores?.salario ?? null,
    dataAdmissao: data.colaboradores?.data_admissao ?? null,
    centroCustoId: data.centro_custo_id,
    centroCustoNome: data.centros_custo?.nome ?? null,
    centroCustoCodigo: data.centros_custo?.codigo ?? null,
    periodoAquisitivoInicio: data.periodo_aquisitivo_inicio,
    periodoAquisitivoFim: data.periodo_aquisitivo_fim,
    dataInicio: data.data_inicio,
    dataFim: data.data_fim,
    dias: data.dias,
    status: data.status as StatusFerias,
    observacao: data.observacao,
    statusRecibo: data.status_recibo as StatusRecibo,
    valorBruto: data.valor_bruto,
    valorInss: data.valor_inss,
    valorIrrf: data.valor_irrf,
    valorLiquido: data.valor_liquido,
    dataVencimento: data.data_vencimento,
    lancamentoId: data.lancamento_id,
    aprovadoEm: data.aprovado_em,
    aprovadoPorNome: data.usuarios?.nome ?? null,
    motivoRejeicao: data.motivo_rejeicao,
  };
}
