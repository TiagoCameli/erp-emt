import "server-only";

import { createClient } from "@/lib/supabase/server";

/** Linha da listagem de funções (aba de cadastro). Sem FK: lê direto da tabela. */
export interface FuncaoLista {
  id: string;
  nome: string;
  salarioBase: number | null;
  cbo: string | null;
  ativo: boolean;
}

/** Lista todas as funções, ordenadas por nome. Excluídas via lixeira já saem da tabela. */
export async function listarFuncoes(): Promise<FuncaoLista[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("funcoes")
    .select("id, nome, salario_base, cbo, ativo")
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar as funções");
  }

  return (data ?? []).map((funcao) => ({
    id: funcao.id,
    nome: funcao.nome,
    salarioBase: funcao.salario_base,
    cbo: funcao.cbo,
    ativo: funcao.ativo,
  }));
}

/** Linha enxuta de função ativa, para o Combobox do colaborador (Task 3). */
export interface FuncaoAtiva {
  id: string;
  nome: string;
  salarioBase: number | null;
  cbo: string | null;
}

/** Lista as funções ativas, ordenadas por nome — para seleção em outros cadastros. */
export async function listarFuncoesAtivas(): Promise<FuncaoAtiva[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("funcoes")
    .select("id, nome, salario_base, cbo")
    .eq("ativo", true)
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar as funções ativas");
  }

  return (data ?? []).map((funcao) => ({
    id: funcao.id,
    nome: funcao.nome,
    salarioBase: funcao.salario_base,
    cbo: funcao.cbo,
  }));
}
