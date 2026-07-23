import "server-only";

import { createClient } from "@/lib/supabase/server";

/** Uma parcela lida do banco: dias após a data base + fração do valor. */
export interface CondicaoParcela {
  diasOffset: number;
  percentual: number;
}

/** Linha da listagem de condições de pagamento. */
export interface CondicaoLista {
  id: string;
  descricao: string;
  ativo: boolean;
  qtdParcelas: number;
  /** Resumo legível das parcelas, ex.: "À vista" ou "0/30/60 (50/25/25%)". */
  resumoParcelas: string;
  /**
   * Parcelas completas (dias + percentual), já incluídas na consulta da
   * listagem. Expostas aqui para o drawer de edição não precisar de uma
   * segunda consulta: a linha da tabela já carrega tudo que o form precisa.
   */
  parcelas: CondicaoParcela[];
}

/** Condição de pagamento completa, com as parcelas para o formulário de edição. */
export interface CondicaoDetalhe {
  id: string;
  descricao: string;
  ativo: boolean;
  parcelas: CondicaoParcela[];
}

const formatadorPercentualCompacto = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/**
 * Monta o resumo legível a partir das parcelas (já ordenadas por dias), ex.:
 * "À vista" (parcela única em 0 dias) ou "0/30/60 (50/25/25%)".
 */
function resumoDeParcelas(parcelas: CondicaoParcela[]): string {
  if (parcelas.length === 0) return "Sem parcelas";
  if (parcelas.length === 1 && parcelas[0].diasOffset === 0) return "À vista";
  const dias = parcelas.map((p) => p.diasOffset).join("/");
  const percentuais = parcelas
    .map((p) => formatadorPercentualCompacto.format(p.percentual))
    .join("/");
  return `${dias} (${percentuais}%)`;
}

/** Converte as parcelas embutidas (snake_case do banco) e ordena por dias. */
function paraParcelas(
  bruto: { dias_offset: number; percentual: number }[] | null,
): CondicaoParcela[] {
  return (bruto ?? [])
    .map((p) => ({ diasOffset: p.dias_offset, percentual: p.percentual }))
    .sort((a, b) => a.diasOffset - b.diasOffset);
}

/**
 * Lista todas as condições de pagamento (ativas e inativas), com a
 * contagem e o resumo das parcelas de cada uma.
 */
export async function listarCondicoes(): Promise<CondicaoLista[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("condicoes_pagamento")
    .select("id, descricao, ativo, condicao_parcelas(dias_offset, percentual)")
    .order("descricao", { ascending: true });

  if (error) {
    throw new Error("Não foi possível carregar as condições de pagamento");
  }

  return (data ?? []).map((condicao) => {
    const parcelas = paraParcelas(condicao.condicao_parcelas);
    return {
      id: condicao.id,
      descricao: condicao.descricao,
      ativo: condicao.ativo,
      qtdParcelas: parcelas.length,
      resumoParcelas: resumoDeParcelas(parcelas),
      parcelas,
    };
  });
}

/** Busca uma condição de pagamento com as parcelas. Retorna null se não achar. */
export async function obterCondicao(
  id: string,
): Promise<CondicaoDetalhe | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("condicoes_pagamento")
    .select("id, descricao, ativo, condicao_parcelas(dias_offset, percentual)")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    descricao: data.descricao,
    ativo: data.ativo,
    parcelas: paraParcelas(data.condicao_parcelas),
  };
}
