"use server";

import { revalidatePath } from "next/cache";

import { erroAcao } from "@/lib/erros";
import { mesParaCompetencia } from "@/lib/formatadores";
import { idSchema } from "@/lib/id";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";

export type EntidadeCompetencia = "ordem_compra" | "lancamento";

export type ResultadoCompetencia = { ok: true } | { erro: string };

/**
 * Altera o mês de referência da OC e do lançamento dela ao mesmo tempo: é um
 * único mês da mesma compra, visto de dois lugares. Quem garante a regra é o
 * banco (`fn_alterar_mes_competencia`), que recusa quando o pagamento já foi
 * aprovado ou pago e manda desaprovar ou estornar antes.
 *
 * Aceita o mês do input ("2026-08") ou já normalizado ("2026-08-01").
 */
export async function alterarMesCompetencia(
  entidade: EntidadeCompetencia,
  id: string,
  mes: string,
): Promise<ResultadoCompetencia> {
  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Documento inválido" };

  const competencia = /^\d{4}-\d{2}-01$/.test(mes)
    ? mes
    : mesParaCompetencia(mes);
  if (competencia === "") return { erro: "Informe o mês de referência" };

  const usuario = await getUsuarioLogado();
  const recurso =
    entidade === "ordem_compra" ? "compras.ordens" : "financeiro.lancamentos";
  if (!temPermissao(usuario, recurso, "editar")) {
    return { erro: "Sem permissão para alterar o mês de referência" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_alterar_mes_competencia", {
    p_entidade: entidade,
    p_id: idValido.data,
    p_mes: competencia,
  });

  if (error) {
    return erroAcao(
      "compartilhado.alterarMesCompetencia",
      error,
      error.message || "Não foi possível alterar o mês de referência",
    );
  }

  // Os dois lados mudam juntos, então as duas listas e os dois detalhes saem do
  // cache: o valor antigo não pode sobreviver em nenhuma tela.
  revalidatePath("/compras/ordens");
  revalidatePath("/financeiro/lancamentos");
  return { ok: true };
}
