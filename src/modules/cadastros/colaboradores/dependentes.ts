"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { erroAcao } from "@/lib/erros";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  dependenteSchema,
  type DependenteInput,
  type Parentesco,
} from "@/modules/cadastros/colaboradores/dependentes-schemas";

/**
 * Dependentes não têm recurso próprio (#Task 1): a RLS de `rh_dependentes`
 * usa `cadastros.colaboradores`, então as actions checam o mesmo recurso do
 * colaborador dono — permissão tripla (RLS + Server Action + UI) sem
 * inventar um recurso novo no catálogo.
 */
const RECURSO = "cadastros.colaboradores" as const;
const ROTA = "/cadastros/colaboradores";

export type ResultadoAcao = { ok: true } | { erro: string };

const uuidSchema = z.uuid();

/** Dependente do colaborador, para a ficha e o formulário (#Task 3). */
export interface Dependente {
  id: string;
  colaboradorId: string;
  nome: string;
  dataNascimento: string | null;
  parentesco: string;
  cpf: string | null;
  dependenteIrrf: boolean;
  dependenteSalarioFamilia: boolean;
}

/**
 * Lista os dependentes de um colaborador, ordenados por data de nascimento
 * (mais novo por último não importa aqui; o que importa é agrupar quem tem
 * data antes de quem não tem) e, dentro do mesmo critério, por nome — mesmo
 * padrão de ordenação nula-por-último usado em `rh/alertas/queries.ts`.
 */
export async function listarDependentes(
  colaboradorId: string,
): Promise<Dependente[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("rh_dependentes")
    .select(
      "id, colaborador_id, nome, data_nascimento, parentesco, cpf, dependente_irrf, dependente_salario_familia",
    )
    .eq("colaborador_id", colaboradorId)
    .order("data_nascimento", { ascending: true, nullsFirst: false })
    .order("nome", { ascending: true });

  if (error) {
    throw new Error("Não foi possível carregar os dependentes");
  }

  return (data ?? []).map((dependente) => ({
    id: dependente.id,
    colaboradorId: dependente.colaborador_id,
    nome: dependente.nome,
    dataNascimento: dependente.data_nascimento,
    // A coluna é nullable no banco, mas o schema de escrita sempre exige um
    // parentesco: na prática nunca fica null. Sem dado (registro legado),
    // cai em string vazia em vez de expor `null` numa interface tipada como
    // `string` (assinatura da brief/Task 3).
    parentesco: (dependente.parentesco as Parentesco | null) ?? "",
    cpf: dependente.cpf,
    dependenteIrrf: dependente.dependente_irrf,
    dependenteSalarioFamilia: dependente.dependente_salario_familia,
  }));
}

/** Converte o DependenteInput validado nas colunas da tabela rh_dependentes. */
function paraLinhaBanco(dados: DependenteInput) {
  return {
    colaborador_id: dados.colaboradorId,
    nome: dados.nome,
    data_nascimento: dados.dataNascimento,
    parentesco: dados.parentesco,
    cpf: dados.cpf,
    dependente_irrf: dados.dependenteIrrf,
    dependente_salario_familia: dados.dependenteSalarioFamilia,
  };
}

/**
 * Cria ou edita um dependente: sem `id` cria, com `id` edita (mesmo padrão
 * de decisão do `dependenteSchema`). Checa `cadastros.colaboradores` com a
 * ação correspondente (criar/editar) — a RLS de `rh_dependentes` já cobre o
 * banco, esta é a camada 2 do enforcement triplo.
 */
export async function salvarDependente(
  input: DependenteInput,
): Promise<ResultadoAcao> {
  const validado = dependenteSchema.safeParse(input);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const dados = validado.data;
  const editando = dados.id !== undefined;
  await exigirPermissao(RECURSO, editando ? "editar" : "criar");

  const supabase = await createClient();
  const linha = paraLinhaBanco(dados);

  const { error } = editando
    ? await supabase.from("rh_dependentes").update(linha).eq("id", dados.id as string)
    : await supabase.from("rh_dependentes").insert(linha);

  if (error) {
    return erroAcao(
      "cadastros.colaboradores.dependentes.salvar",
      error,
      "Não foi possível salvar o dependente. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Remove um dependente. Checa a permissão de excluir de `cadastros.colaboradores`. */
export async function removerDependente(id: string): Promise<ResultadoAcao> {
  await exigirPermissao(RECURSO, "excluir");

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Dependente inválido" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("rh_dependentes")
    .delete()
    .eq("id", idValido.data);

  if (error) {
    return erroAcao(
      "cadastros.colaboradores.dependentes.remover",
      error,
      "Não foi possível remover o dependente. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}
