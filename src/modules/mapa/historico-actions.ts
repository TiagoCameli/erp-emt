"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { erroAcao, textoDoErro } from "@/lib/erros";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";

/**
 * Desfazer a última movimentação de uma máquina pelo Histórico. A regra toda mora na RPC
 * (`fn_mapa_desfazer_movimentacao`, v1.23): só a última que vale, só transferência, posição e
 * estado, recusa se a máquina mudou depois por outro caminho. A mensagem dela sobe como está.
 */

const desfazerSchema = z.strictObject({
  id: z.number().int().positive({ error: "Movimentação inválida" }),
  motivo: z
    .string()
    .trim()
    .min(1, { error: "Informe o motivo" })
    .max(300, { error: "Motivo longo demais" }),
});

export async function desfazerMovimentacao(
  dados: unknown,
): Promise<{ ok: true } | { erro: string }> {
  try {
    await exigirPermissao("mapa.mapa", "editar");
  } catch {
    return { erro: "Sem permissão para editar o Mapa" };
  }
  const validado = desfazerSchema.safeParse(dados);
  if (!validado.success)
    return { erro: validado.error.issues[0]?.message ?? "Pedido inválido" };
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_mapa_desfazer_movimentacao", {
      p_id: validado.data.id,
      p_motivo: validado.data.motivo,
    });
    if (error) {
      const negocio =
        (error.code === "P0001" || error.code === "42501") && error.message;
      return erroAcao(
        "mapa.historico.desfazer",
        error,
        negocio || "Não foi possível desfazer a movimentação",
      );
    }
  } catch (erro) {
    return erroAcao(
      "mapa.historico.desfazer",
      erro,
      `Não foi possível desfazer: ${textoDoErro(erro)}`,
    );
  }
  try {
    revalidatePath("/mapa/historico");
    revalidatePath("/mapa");
  } catch {
    // a gravação já aconteceu
  }
  return { ok: true };
}

/**
 * Excluir uma linha do Histórico de vez (`fn_mapa_excluir_movimentacao`, v1.26). Com `voltar`,
 * desfaz antes (mesmas recusas do desfazer); sem ele, só o registro sai e o estado atual fica.
 * A linha apagada continua no audit_log.
 */

const excluirSchema = z.strictObject({
  id: z.number().int().positive({ error: "Movimentação inválida" }),
  voltar: z.boolean(),
});

export async function excluirMovimentacao(
  dados: unknown,
): Promise<{ ok: true } | { erro: string }> {
  try {
    await exigirPermissao("mapa.mapa", "excluir");
  } catch {
    return { erro: "Sem permissão para excluir no Mapa" };
  }
  const validado = excluirSchema.safeParse(dados);
  if (!validado.success)
    return { erro: validado.error.issues[0]?.message ?? "Pedido inválido" };
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_mapa_excluir_movimentacao", {
      p_id: validado.data.id,
      p_voltar: validado.data.voltar,
    });
    if (error) {
      const negocio =
        (error.code === "P0001" || error.code === "42501") && error.message;
      return erroAcao(
        "mapa.historico.excluir",
        error,
        negocio || "Não foi possível excluir a movimentação",
      );
    }
  } catch (erro) {
    return erroAcao(
      "mapa.historico.excluir",
      erro,
      `Não foi possível excluir: ${textoDoErro(erro)}`,
    );
  }
  try {
    revalidatePath("/mapa/historico");
    revalidatePath("/mapa");
  } catch {
    // a gravação já aconteceu
  }
  return { ok: true };
}
