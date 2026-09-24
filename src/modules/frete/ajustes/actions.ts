"use server";

import { revalidatePath } from "next/cache";

import { erroAcao, semLancar } from "@/lib/erros";
import { mensagemDeNegocio } from "@/lib/erros-banco";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { ajusteSchema, motivoSchema, payloadDoAjuste, type AjusteInput } from "@/modules/frete/ajustes/schemas";

/**
 * Mutações do ajuste de saldo (`frete.ajustes`: ver, criar, aprovar,
 * desaprovar). Só por RPC, que confere a permissão de novo:
 *
 * - `fn_frete_ajuste_salvar`: cria (pendente) ou edita o pendente;
 * - `fn_frete_ajuste_aprovar`: pendente > aprovado (vira movimento);
 * - `fn_frete_ajuste_desaprovar`: rejeita o pendente OU devolve o aprovado a
 *   pendente, sempre com motivo. A RPC decide pelo status; aqui a action lê o
 *   status antes para que "Rejeitar" nunca desaprove e "Desaprovar" nunca
 *   rejeite, e para cobrar a permissão certa de cada um.
 *
 * Sem exclusão: a origem apagava o ajuste de verdade; no ERP ele fica, e o
 * rejeitado não entra no saldo.
 */

const RECURSO = "frete.ajustes" as const;
const ROTA = "/frete/ajustes";

export type ResultadoAcao = { ok: true } | { erro: string };
export type ResultadoSalvar = { ok: true; id: string } | { erro: string };

async function temAcao(acao: "criar" | "aprovar" | "desaprovar"): Promise<boolean> {
  try {
    await exigirPermissao(RECURSO, acao);
    return true;
  } catch {
    return false;
  }
}

/** Depois do commit nada vira falha. */
function revalidar(id?: string) {
  const rotas = [ROTA, "/frete/conta-corrente", "/frete"];
  if (id) rotas.push(`${ROTA}/${id}`);
  for (const rota of rotas) {
    try {
      revalidatePath(rota);
    } catch {
      // O sucesso já aconteceu.
    }
  }
}

/** Cria (id nulo) ou edita um ajuste pendente. */
export async function salvarAjuste(id: string | null, dados: AjusteInput): Promise<ResultadoSalvar> {
  return semLancar("frete.ajustes.salvar", async () => {
    if (!(await temAcao("criar"))) return { erro: "Sem permissão para ajustar saldo" };

    if (id !== null && !idSchema.safeParse(id).success) return { erro: "Ajuste inválido" };
    const validado = ajusteSchema.safeParse(dados);
    if (!validado.success) return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_frete_ajuste_salvar", {
      p_id: (id ?? null) as unknown as string,
      p_dados: payloadDoAjuste(validado.data),
    });
    if (error) {
      return erroAcao(
        "frete.ajustes.salvar",
        error,
        mensagemDeNegocio(error, "Não foi possível salvar o ajuste. Tente novamente"),
      );
    }

    const salvo = typeof data === "string" ? data : (id ?? "");
    revalidar(salvo || undefined);
    return { ok: true, id: salvo };
  });
}

async function statusAtual(id: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("frete_ajustes").select("status").eq("id", id).maybeSingle();
  return data?.status ?? null;
}

export async function aprovarAjuste(id: string): Promise<ResultadoAcao> {
  return semLancar("frete.ajustes.aprovar", async () => {
    if (!(await temAcao("aprovar"))) return { erro: "Sem permissão para aprovar ajuste" };
    const idValido = idSchema.safeParse(id);
    if (!idValido.success) return { erro: "Ajuste inválido" };

    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_frete_ajuste_aprovar", { p_id: idValido.data });
    if (error) {
      return erroAcao("frete.ajustes.aprovar", error, mensagemDeNegocio(error, "Não foi possível aprovar o ajuste. Tente novamente"));
    }
    revalidar(idValido.data);
    return { ok: true };
  });
}

/** Rejeita o PENDENTE (fim de linha). Pede `aprovar`, como a RPC. */
export async function rejeitarAjuste(id: string, motivo: string): Promise<ResultadoAcao> {
  return semLancar("frete.ajustes.rejeitar", async () => {
    if (!(await temAcao("aprovar"))) return { erro: "Sem permissão para rejeitar ajuste" };
    return devolver(id, motivo, "pendente_aprovacao", "frete.ajustes.rejeitar", "rejeitar");
  });
}

/** Devolve o APROVADO a pendente: sai do saldo. Pede `desaprovar`. */
export async function desaprovarAjuste(id: string, motivo: string): Promise<ResultadoAcao> {
  return semLancar("frete.ajustes.desaprovar", async () => {
    if (!(await temAcao("desaprovar"))) return { erro: "Sem permissão para desaprovar ajuste" };
    return devolver(id, motivo, "aprovado", "frete.ajustes.desaprovar", "desaprovar");
  });
}

async function devolver(
  id: string,
  motivo: string,
  statusEsperado: "pendente_aprovacao" | "aprovado",
  contexto: string,
  verbo: "rejeitar" | "desaprovar",
): Promise<ResultadoAcao> {
  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Ajuste inválido" };
  const motivoValido = motivoSchema.safeParse(motivo);
  if (!motivoValido.success) return { erro: "Informe o motivo" };

  const status = await statusAtual(idValido.data);
  if (status === null) return { erro: "Ajuste não encontrado" };
  if (status !== statusEsperado) {
    return {
      erro:
        verbo === "rejeitar"
          ? "Só dá para rejeitar ajuste pendente de aprovação"
          : "Só dá para desaprovar ajuste aprovado",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_frete_ajuste_desaprovar", {
    p_id: idValido.data,
    p_motivo: motivoValido.data,
  });
  if (error) {
    return erroAcao(contexto, error, mensagemDeNegocio(error, `Não foi possível ${verbo} o ajuste. Tente novamente`));
  }
  revalidar(idValido.data);
  return { ok: true };
}
