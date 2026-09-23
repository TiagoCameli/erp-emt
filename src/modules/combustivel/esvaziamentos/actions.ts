"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { erroAcao, semLancar } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { esvaziamentoSchema, type EsvaziamentoInput } from "@/modules/combustivel/esvaziamentos/schemas";
import { traduzErroMovimento } from "@/modules/combustivel/transferencias/erros";

/**
 * Mutações dos esvaziamentos (`combustivel.esvaziamentos`: ver, criar e
 * excluir; não há edição). Só por RPC: `fn_comb_registrar_esvaziamento` (grava
 * o nível atual inteiro, agora, como a origem), `fn_comb_excluir` (lixeira com
 * motivo) e `fn_comb_restaurar`. A recusa do banco vai para a tela.
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
      p_motivo: validado.data.motivo,
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

/**
 * Tira o esvaziamento da lixeira (Lixeira da origem). Pede a lixeira
 * (`administracao.lixeira`/editar) e a exclusão do recurso, como a RPC.
 */
export async function restaurarEsvaziamento(id: string): Promise<ResultadoAcao> {
  return semLancar("combustivel.esvaziamentos.restaurar", async () => {
    if (!(await temPermissaoDeRestaurar())) return { erro: "Sem permissão para restaurar esvaziamentos" };

    const idValido = idSchema.safeParse(id);
    if (!idValido.success) return { erro: "Esvaziamento inválido" };

    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_comb_restaurar", {
      p_tabela: "combustivel_esvaziamentos",
      p_id: idValido.data,
    });

    if (error) {
      return erroAcao(
        "combustivel.esvaziamentos.restaurar",
        error,
        traduzErroMovimento(error, "Não foi possível restaurar o esvaziamento. Tente novamente"),
      );
    }

    revalidar();
    return { ok: true };
  });
}

async function temPermissaoDeRestaurar(): Promise<boolean> {
  try {
    await exigirPermissao("administracao.lixeira", "editar");
    await exigirPermissao(RECURSO, "excluir");
    return true;
  } catch {
    return false;
  }
}
