"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { erroAcao, semLancar } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { traduzErroMovimento } from "@/modules/combustivel/transferencias/erros";
import {
  dataHoraIso,
  transferenciaSchema,
  type TransferenciaInput,
} from "@/modules/combustivel/transferencias/schemas";

/**
 * Mutações das transferências entre tanques (`combustivel.transferencias`).
 *
 * Permissão tripla: a RPC checa `tem_permissao` no banco, aqui
 * `exigirPermissao`, e a tela esconde o botão. A tabela não tem grant de
 * escrita: tudo passa por `fn_comb_salvar_transferencia` (que calcula o valor
 * pelo preço médio do tanque de origem) e `fn_comb_excluir` (lixeira com
 * motivo). Nenhuma action lança: tudo volta `{ erro }`.
 */

const RECURSO = "combustivel.transferencias" as const;
const ROTA = "/combustivel/transferencias";
const ROTA_TANQUES = "/combustivel/tanques";

export type ResultadoAcao = { ok: true } | { erro: string };

const motivoSchema = z.string().trim().min(1);

async function temAcao(acao: "ver" | "criar" | "editar" | "excluir"): Promise<boolean> {
  try {
    await exigirPermissao(RECURSO, acao);
    return true;
  } catch {
    return false;
  }
}

/** Depois do commit nada vira falha: a revalidação que estoura não desfaz o registro. */
function revalidar() {
  for (const rota of [ROTA, ROTA_TANQUES, "/combustivel"]) {
    try {
      revalidatePath(rota);
    } catch {
      // O sucesso já aconteceu.
    }
  }
}

/** Cria (id null) ou edita uma transferência. */
export async function salvarTransferencia(
  id: string | null,
  dados: TransferenciaInput,
): Promise<ResultadoAcao> {
  return semLancar("combustivel.transferencias.salvar", async () => {
    const editando = id !== null;
    if (!(await temAcao(editando ? "editar" : "criar"))) {
      return { erro: editando ? "Sem permissão para editar transferências" : "Sem permissão para lançar transferências" };
    }

    let idValido: string | null = null;
    if (editando) {
      const conferido = idSchema.safeParse(id);
      if (!conferido.success) return { erro: "Transferência inválida" };
      idValido = conferido.data;
    }

    const validado = transferenciaSchema.safeParse(dados);
    if (!validado.success) return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };

    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_comb_salvar_transferencia", {
      // A RPC aceita null para criar; o tipo gerado não sabe disso.
      p_id: idValido as unknown as string,
      p_origem: validado.data.origemId,
      p_destino: validado.data.destinoId,
      p_litros: validado.data.litros,
      p_data_hora: validado.data.dataHora,
      p_observacoes: validado.data.observacoes,
    });

    if (error) {
      return erroAcao(
        "combustivel.transferencias.salvar",
        error,
        traduzErroMovimento(error, "Não foi possível salvar a transferência. Tente novamente"),
      );
    }

    revalidar();
    return { ok: true };
  });
}

/** Move a transferência para a lixeira, com motivo. Os gatilhos refazem nível e PEPS. */
export async function excluirTransferencia(id: string, motivo: string): Promise<ResultadoAcao> {
  return semLancar("combustivel.transferencias.excluir", async () => {
    if (!(await temAcao("excluir"))) return { erro: "Sem permissão para excluir transferências" };

    const idValido = idSchema.safeParse(id);
    if (!idValido.success) return { erro: "Transferência inválida" };

    const motivoValido = motivoSchema.safeParse(motivo);
    if (!motivoValido.success) return { erro: "Informe o motivo da exclusão" };

    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_comb_excluir", {
      p_tabela: "combustivel_transferencias",
      p_id: idValido.data,
      p_motivo: motivoValido.data,
    });

    if (error) {
      return erroAcao(
        "combustivel.transferencias.excluir",
        error,
        traduzErroMovimento(error, "Não foi possível excluir a transferência. Tente novamente"),
      );
    }

    revalidar();
    return { ok: true };
  });
}

/**
 * Litros no tanque até a data, sem contar a própria transferência em edição.
 * É só a dica do formulário: quem decide é a trava do banco ao salvar.
 */
export async function consultarEstoqueTransferencia(
  tanqueId: string,
  dataHora: string,
  excluirId: string | null,
): Promise<{ ok: true; litros: number } | { erro: string }> {
  return semLancar("combustivel.transferencias.estoque", async () => {
    if (!(await temAcao("ver"))) return { erro: "Sem permissão para ver transferências" };

    const tanque = idSchema.safeParse(tanqueId);
    const data = dataHoraIso.safeParse(dataHora);
    if (!tanque.success || !data.success) return { erro: "Tanque ou data inválidos" };
    const excluir = excluirId === null ? null : idSchema.safeParse(excluirId);
    if (excluir && !excluir.success) return { erro: "Transferência inválida" };

    const supabase = await createClient();
    const { data: litros, error } = await supabase.rpc("fn_comb_estoque_na_data", {
      p_tanque: tanque.data,
      p_data: data.data,
      ...(excluir ? { p_excluir: excluir.data } : {}),
    });

    if (error) {
      return erroAcao("combustivel.transferencias.estoque", error, "Não foi possível consultar o estoque do tanque");
    }
    return { ok: true, litros: Number(litros ?? 0) };
  });
}
