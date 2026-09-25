"use server";

import { revalidatePath } from "next/cache";

import { erroAcao } from "@/lib/erros";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  atribuirEquipamentoSchema,
  conferirAnomaliaSchema,
  conferirAnomaliasSchema,
  revisarSemSuprimentoSchema,
  type AtribuirEquipamentoInput,
  type ConferirAnomaliaInput,
  type ConferirAnomaliasInput,
  type RevisarSemSuprimentoInput,
} from "@/modules/combustivel/anomalias/schemas";

const RECURSO = "combustivel.anomalias" as const;
const ROTA = "/combustivel/anomalias";

export type ResultadoAcao = { ok: true } | { erro: string };

/** Texto da trava (P0001) sobe; o resto vira a mensagem genérica, com o real no log. */
function erroDaRpc(contexto: string, error: { code?: string; message?: string }, generica: string) {
  if (error.code === "P0001" && error.message) return erroAcao(contexto, error, error.message);
  return erroAcao(contexto, error, generica);
}

/**
 * Marca (ou desmarca) uma anomalia como conferida. A RPC confere a mesma
 * permissão no banco; a checagem aqui evita a ida ao banco e dá a mensagem certa.
 */
export async function conferirAnomalia(dados: ConferirAnomaliaInput): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para conferir anomalias" };
  }

  const validado = conferirAnomaliaSchema.safeParse(dados);
  if (!validado.success) return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  const { chave, conferida, motivo } = validado.data;

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_comb_conferir_anomalia", {
      p_chave: chave,
      p_conferida: conferida,
      ...(motivo ? { p_motivo: motivo } : {}),
    });
    if (error) {
      return erroDaRpc(
        "combustivel.anomalias.conferir",
        error,
        conferida ? "Não foi possível marcar a anomalia como conferida" : "Não foi possível desmarcar a anomalia",
      );
    }
  } catch (erro) {
    return erroAcao("combustivel.anomalias.conferir", erro, "Não foi possível gravar a conferência. Tente novamente");
  }

  revalidatePath(ROTA);
  revalidatePath("/combustivel");
  return { ok: true };
}

export type ResultadoConferenciaLote = { ok: true; conferidas: number } | { erro: string };

/** Quantas chamadas da RPC vão ao banco ao mesmo tempo no lote. */
const PARALELO_LOTE = 10;

/**
 * Marca várias anomalias como conferidas, todas com o mesmo motivo. Reusa a RPC
 * de uma (ela já é idempotente: conferir de novo só atualiza motivo e data), em
 * blocos pequenos. Se um bloco falha, para ali e diz quantas já foram gravadas.
 */
export async function conferirAnomalias(dados: ConferirAnomaliasInput): Promise<ResultadoConferenciaLote> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para conferir anomalias" };
  }

  const validado = conferirAnomaliasSchema.safeParse(dados);
  if (!validado.success) return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  const chaves = [...new Set(validado.data.chaves)];
  const { motivo } = validado.data;

  let conferidas = 0;
  let falha: { erro: string } | null = null;
  try {
    const supabase = await createClient();
    for (let inicio = 0; inicio < chaves.length && !falha; inicio += PARALELO_LOTE) {
      const bloco = chaves.slice(inicio, inicio + PARALELO_LOTE);
      const respostas = await Promise.all(
        bloco.map((chave) =>
          supabase.rpc("fn_comb_conferir_anomalia", {
            p_chave: chave,
            p_conferida: true,
            ...(motivo ? { p_motivo: motivo } : {}),
          }),
        ),
      );
      for (const { error } of respostas) {
        if (error) {
          falha ??= erroDaRpc(
            "combustivel.anomalias.conferirLote",
            error,
            "Não foi possível marcar as anomalias como conferidas",
          );
        } else {
          conferidas += 1;
        }
      }
    }
  } catch (erro) {
    falha = erroAcao("combustivel.anomalias.conferirLote", erro, "Não foi possível gravar a conferência. Tente novamente");
  }

  if (conferidas > 0) {
    try {
      revalidatePath(ROTA);
      revalidatePath("/combustivel");
    } catch {
      // a gravação já aconteceu
    }
  }
  if (falha) {
    return conferidas > 0 ? { erro: `${falha.erro}. ${conferidas} de ${chaves.length} já foram conferidas` } : falha;
  }
  return { ok: true, conferidas };
}

export type ResultadoAtribuicao = { ok: true; atualizadas: number } | { erro: string };

/**
 * Atribui um equipamento a uma ou várias saídas do sentinela ("Outros"): o
 * AtribuirSentinelModal e a atribuição do drawer de anomalia D1 da origem, cuja
 * permissão era `corrigir_anomalias_combustivel` (aqui combustivel.anomalias/editar).
 *
 * A RPC confere a permissão de novo, só troca o equipamento de saída de equipamento
 * próprio não excluída e devolve quantas mudou: é esse número que a tela mostra.
 */
export async function atribuirEquipamento(dados: AtribuirEquipamentoInput): Promise<ResultadoAtribuicao> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para atribuir equipamento" };
  }

  const validado = atribuirEquipamentoSchema.safeParse(dados);
  if (!validado.success) return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  const saidaIds = [...new Set(validado.data.saidaIds)];
  const { equipamentoId } = validado.data;

  let atualizadas: number;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_comb_atribuir_equipamento", {
      p_saidas: saidaIds,
      p_equipamento: equipamentoId,
    });
    if (error) {
      return erroDaRpc("combustivel.anomalias.atribuirEquipamento", error, "Não foi possível atribuir o equipamento");
    }
    atualizadas = typeof data === "number" ? data : 0;
  } catch (erro) {
    return erroAcao(
      "combustivel.anomalias.atribuirEquipamento",
      erro,
      "Não foi possível atribuir o equipamento. Tente novamente",
    );
  }

  // Depois do commit nada vira falha: revalidar é melhor esforço.
  try {
    revalidatePath(ROTA);
    revalidatePath("/combustivel");
    revalidatePath("/combustivel/abastecimentos");
  } catch {
    // a gravação já aconteceu
  }
  return { ok: true, atualizadas };
}

/** Marca (ou desfaz) a revisão de uma saída sem suprimento. */
export async function revisarSemSuprimento(dados: RevisarSemSuprimentoInput): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para revisar saídas sem suprimento" };
  }

  const validado = revisarSemSuprimentoSchema.safeParse(dados);
  if (!validado.success) return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  const { saidaId, revisado, observacao } = validado.data;

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_comb_revisar_sem_suprimento", {
      p_saida: saidaId,
      p_revisado: revisado,
      ...(observacao ? { p_observacao: observacao } : {}),
    });
    if (error) {
      return erroDaRpc(
        "combustivel.anomalias.revisarSemSuprimento",
        error,
        revisado ? "Não foi possível marcar como revisado" : "Não foi possível desfazer a revisão",
      );
    }
  } catch (erro) {
    return erroAcao("combustivel.anomalias.revisarSemSuprimento", erro, "Não foi possível gravar a revisão. Tente novamente");
  }

  revalidatePath(ROTA);
  revalidatePath("/combustivel");
  return { ok: true };
}
