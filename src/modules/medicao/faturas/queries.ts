import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { StatusFatura } from "@/modules/medicao/_shared/formato";

/** Linha da listagem de faturas, com nomes já resolvidos dos embeds. */
export interface FaturaLista {
  id: string;
  numero: string | null;
  obraNome: string;
  obraLote: string | null;
  clienteNome: string | null;
  medicaoNumero: string | null;
  competencia: string;
  valor: number;
  dataVencimento: string | null;
  status: StatusFatura;
}

/** Totais da listagem para os KPIs do topo. */
export interface ResumoFaturas {
  /** Quantidade total de faturas. */
  total: number;
  /** Quantidade de faturas em aberto. */
  emAberto: number;
  /** Soma do valor das faturas em aberto. */
  totalFaturadoAberto: number;
}

/**
 * Normaliza o status vindo do banco (texto livre) para o domínio conhecido.
 * Qualquer valor fora do esperado cai em "aberta".
 */
function normalizarStatus(status: string): StatusFatura {
  return status === "cancelada" ? "cancelada" : "aberta";
}

/**
 * Faturas geradas pelas medições aprovadas, ordenadas por competência (desc) e,
 * dentro da mesma competência, pela criação mais recente. Somente leitura: o RLS
 * decide o que cada usuário enxerga. Os nomes de obra, cliente e medição vêm de
 * embeds e já chegam resolvidos no retorno.
 */
export async function listarFaturas(): Promise<FaturaLista[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("faturas")
    .select(
      `id, numero, competencia, valor, data_vencimento, status,
       obras(nome, lote),
       clientes(nome, nome_fantasia),
       medicoes(numero)`,
    )
    .order("competencia", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw new Error("Não foi possível carregar as faturas");

  return (data ?? []).map((f) => ({
    id: f.id,
    numero: f.numero,
    obraNome: f.obras?.nome ?? "",
    obraLote: f.obras?.lote ?? null,
    clienteNome: f.clientes?.nome_fantasia ?? f.clientes?.nome ?? null,
    medicaoNumero: f.medicoes?.numero ?? null,
    competencia: f.competencia,
    valor: f.valor,
    dataVencimento: f.data_vencimento,
    status: normalizarStatus(f.status),
  }));
}

/** Resumo das faturas para os KPIs (total, contagem e valor em aberto). */
export function resumirFaturas(faturas: FaturaLista[]): ResumoFaturas {
  const abertas = faturas.filter((f) => f.status === "aberta");
  return {
    total: faturas.length,
    emAberto: abertas.length,
    totalFaturadoAberto: abertas.reduce((soma, f) => soma + f.valor, 0),
  };
}
