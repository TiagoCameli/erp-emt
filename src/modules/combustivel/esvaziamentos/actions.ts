"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { erroAcao, semLancar } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { esvaziamentoSchema, type EsvaziamentoInput } from "@/modules/combustivel/esvaziamentos/schemas";
import { traduzErroMovimento } from "@/modules/combustivel/transferencias/erros";
import { dataHoraIso } from "@/modules/combustivel/transferencias/schemas";

/**
 * Mutações dos esvaziamentos (`combustivel.esvaziamentos`: ver, criar e
 * excluir; não há edição). Só por RPC: `fn_comb_registrar_esvaziamento` e
 * `fn_comb_excluir` (lixeira com motivo). Tanque externo e ciclo fechado são
 * recusados pelas travas do banco, e a mensagem delas vai para a tela.
 */

const RECURSO = "combustivel.esvaziamentos" as const;
const ROTA = "/combustivel/esvaziamentos";
const ROTA_TANQUES = "/combustivel/tanques";

export type ResultadoAcao = { ok: true } | { erro: string };

const motivoExclusaoSchema = z.string().trim().min(1);

async function temAcao(acao: "ver" | "criar" | "excluir"): Promise<boolean> {
  try {
    await exigirPermissao(RECURSO, acao);
    return true;
  } catch {
    return false;
  }
}

function revalidar() {
  for (const rota of [ROTA, ROTA_TANQUES, "/combustivel"]) {
    try {
      revalidatePath(rota);
    } catch {
      // O sucesso já aconteceu.
    }
  }
}

export async function registrarEsvaziamento(dados: EsvaziamentoInput): Promise<ResultadoAcao> {
  return semLancar("combustivel.esvaziamentos.registrar", async () => {
    if (!(await temAcao("criar"))) return { erro: "Sem permissão para esvaziar tanques" };

    const validado = esvaziamentoSchema.safeParse(dados);
    if (!validado.success) return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };

    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_comb_registrar_esvaziamento", {
      p_tanque: validado.data.tanqueId,
      p_litros: validado.data.litros,
      p_motivo: validado.data.motivo,
      p_data_hora: validado.data.dataHora,
    });

    if (error) {
      return erroAcao(
        "combustivel.esvaziamentos.registrar",
        error,
        traduzErroMovimento(error, "Não foi possível registrar o esvaziamento. Tente novamente"),
      );
    }

    revalidar();
    return { ok: true };
  });
}

export async function excluirEsvaziamento(id: string, motivo: string): Promise<ResultadoAcao> {
  return semLancar("combustivel.esvaziamentos.excluir", async () => {
    if (!(await temAcao("excluir"))) return { erro: "Sem permissão para excluir esvaziamentos" };

    const idValido = idSchema.safeParse(id);
    if (!idValido.success) return { erro: "Esvaziamento inválido" };

    const motivoValido = motivoExclusaoSchema.safeParse(motivo);
    if (!motivoValido.success) return { erro: "Informe o motivo da exclusão" };

    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_comb_excluir", {
      p_tabela: "combustivel_esvaziamentos",
      p_id: idValido.data,
      p_motivo: motivoValido.data,
    });

    if (error) {
      return erroAcao(
        "combustivel.esvaziamentos.excluir",
        error,
        traduzErroMovimento(error, "Não foi possível excluir o esvaziamento. Tente novamente"),
      );
    }

    revalidar();
    return { ok: true };
  });
}

/** Litros no tanque até a data: a dica do formulário. Quem decide é a trava do banco. */
export async function consultarEstoqueEsvaziamento(
  tanqueId: string,
  dataHora: string,
): Promise<{ ok: true; litros: number } | { erro: string }> {
  return semLancar("combustivel.esvaziamentos.estoque", async () => {
    if (!(await temAcao("ver"))) return { erro: "Sem permissão para ver esvaziamentos" };

    const tanque = idSchema.safeParse(tanqueId);
    const data = dataHoraIso.safeParse(dataHora);
    if (!tanque.success || !data.success) return { erro: "Tanque ou data inválidos" };

    const supabase = await createClient();
    const { data: litros, error } = await supabase.rpc("fn_comb_estoque_na_data", {
      p_tanque: tanque.data,
      p_data: data.data,
    });

    if (error) {
      return erroAcao("combustivel.esvaziamentos.estoque", error, "Não foi possível consultar o estoque do tanque");
    }
    return { ok: true, litros: Number(litros ?? 0) };
  });
}
