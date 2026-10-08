import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  ProdutoAplicacao,
  TipoCentro,
} from "@/modules/cadastros/centros-custo/schemas";

/**
 * Um nó da árvore de centros de custo (centro, etapa ou item).
 * A query devolve a lista PLANA de todos os nós, já ordenada por nível e nome.
 * A hierarquia (pai > filhos) é montada no client, em
 * components/arvore-centros-custo.tsx, indexando por pai_id. Optei pelo plano
 * porque a árvore tem só 3 níveis e o volume é pequeno, então montar no client
 * mantém a query simples e o componente dono do estado de expansão.
 */
export interface NoCentroCusto {
  id: string;
  codigo: string | null;
  nome: string;
  nivel: 1 | 2 | 3;
  tipo: TipoCentro | null;
  pai_id: string | null;
  obra_id: string | null;
  equipamento_id: string | null;
  orcamento: number | null;
  sistema: boolean;
  ativo: boolean;
}

/**
 * Lista todos os nós da árvore de centros de custo, ordenados por nível e
 * nome para uma montagem estável no client.
 */
export async function listarArvore(): Promise<NoCentroCusto[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("centros_custo")
    .select(
      "id, codigo, nome, nivel, tipo, pai_id, obra_id, equipamento_id, orcamento, sistema, ativo",
    )
    .order("nivel")
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar os centros de custo");
  }

  return (data ?? []).map((no) => ({
    id: no.id,
    codigo: no.codigo,
    nome: no.nome,
    nivel: no.nivel as 1 | 2 | 3,
    tipo: no.tipo as TipoCentro | null,
    pai_id: no.pai_id,
    obra_id: no.obra_id,
    equipamento_id: no.equipamento_id,
    orcamento: no.orcamento,
    sistema: no.sistema,
    ativo: no.ativo,
  }));
}

/** A conta e o tipo da aplicação de uma etapa de Investimentos. */
export interface AplicacaoDaEtapa {
  contaId: string;
  contaNome: string;
  produto: ProdutoAplicacao;
}

/** Conta corrente ou poupança que pode receber aplicação. */
export interface ContaParaAplicacao {
  id: string;
  nome: string;
}

/**
 * Por etapa de Investimentos, a conta e o tipo da aplicação. Sai de
 * `fn_aplicacoes_das_etapas` porque a tabela `aplicacoes` só é legível por quem
 * vê a aba Aplicações, e a conta não é saldo: quem cadastra centro de custo
 * precisa enxergá-la.
 */
export async function listarAplicacoesDasEtapas(): Promise<Record<string, AplicacaoDaEtapa>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_aplicacoes_das_etapas");
  if (error) {
    throw new Error("Não foi possível carregar as contas das aplicações");
  }
  const porEtapa: Record<string, AplicacaoDaEtapa> = {};
  for (const linha of data ?? []) {
    porEtapa[linha.centro_custo_id] = {
      contaId: linha.conta_id,
      contaNome: linha.conta_nome,
      produto: linha.produto as ProdutoAplicacao,
    };
  }
  return porEtapa;
}

/** Contas correntes e poupanças ativas: as que têm subconta de investimentos. */
export async function listarContasParaAplicacao(): Promise<ContaParaAplicacao[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contas_bancarias")
    .select("id, nome")
    .in("tipo", ["corrente", "poupanca"])
    .eq("ativo", true)
    .order("nome");
  if (error) {
    throw new Error("Não foi possível carregar as contas bancárias");
  }
  return data ?? [];
}
