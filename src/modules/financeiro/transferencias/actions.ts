"use server";

import { revalidatePath } from "next/cache";

import type { Acao } from "@/config/recursos";
import { erroAcao } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  transferenciaSchema,
  type TransferenciaInput,
} from "@/modules/financeiro/transferencias/schemas";

const RECURSO = "financeiro.transferencias" as const;
const ROTA = "/financeiro/transferencias";

/**
 * As outras telas que mostram saldo de conta precisam ser revalidadas junto:
 * uma transferência muda o saldo em Contas bancárias e em Relatórios > Posição
 * bancária. Sem isto, criar a transferência aqui deixaria as duas telas
 * mostrando o saldo velho até alguém dar F5.
 */
const ROTAS_QUE_MOSTRAM_SALDO = [
  ROTA,
  "/financeiro/contas-bancarias",
  "/financeiro/relatorios",
];

export type ResultadoAcao = { ok: true } | { erro: string };

/** Converte o throw de exigirPermissao no contrato { erro } das actions. */
async function checarPermissao(acao: Acao): Promise<boolean> {
  try {
    await exigirPermissao(RECURSO, acao);
    return true;
  } catch {
    return false;
  }
}

function revalidarSaldos() {
  for (const rota of ROTAS_QUE_MOSTRAM_SALDO) revalidatePath(rota);
}

/**
 * Cria ou edita uma transferência pela RPC transacional.
 *
 * A permissão é conferida duas vezes de propósito (regra de ouro 2): aqui, para
 * a tela receber uma mensagem em português, e dentro de
 * `fn_salvar_transferencia`, que é quem realmente barra — a RPC é security
 * definer e não pode confiar em quem a chamou.
 */
export async function salvarTransferencia(
  id: string | null,
  dados: TransferenciaInput,
): Promise<ResultadoAcao> {
  const acao: Acao = id === null ? "criar" : "editar";

  if (!(await checarPermissao(acao))) {
    return {
      erro:
        id === null
          ? "Sem permissão para criar transferências"
          : "Sem permissão para editar transferências",
    };
  }

  if (id !== null && !idSchema.safeParse(id).success) {
    return { erro: "Transferência inválida" };
  }

  const validado = transferenciaSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_salvar_transferencia", {
    p_id: id,
    p_conta_origem_id: validado.data.contaOrigemId,
    p_conta_destino_id: validado.data.contaDestinoId,
    p_data: validado.data.dataTransferencia,
    p_valor: validado.data.valor,
    p_tarifa: validado.data.tarifa,
    p_descricao: validado.data.descricao ?? undefined,
    p_observacoes: validado.data.observacoes ?? undefined,
  });

  if (error) {
    // A mensagem da RPC é escrita para ser lida por quem está na tela
    // ("A conta de origem e a de destino precisam ser diferentes"), então ela
    // sobe inteira em vez de virar um "tente novamente" genérico.
    return erroAcao(
      "financeiro.transferencias.salvarTransferencia",
      error,
      error.message || "Não foi possível salvar a transferência",
    );
  }

  revalidarSaldos();
  return { ok: true };
}

/**
 * Exclui uma transferência. Vai para a lixeira com motivo, como manda a regra
 * de ouro 7 — o dinheiro volta a contar nas duas contas no mesmo instante.
 */
export async function excluirTransferencia(
  id: string,
  motivo: string,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("excluir"))) {
    return { erro: "Sem permissão para excluir transferências" };
  }

  if (!idSchema.safeParse(id).success) {
    return { erro: "Transferência inválida" };
  }

  const motivoLimpo = motivo.trim();
  if (motivoLimpo === "") {
    return { erro: "Informe o motivo da exclusão" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_excluir_transferencia", {
    p_id: id,
    p_motivo: motivoLimpo,
  });

  if (error) {
    return erroAcao(
      "financeiro.transferencias.excluirTransferencia",
      error,
      error.message || "Não foi possível excluir a transferência",
    );
  }

  revalidarSaldos();
  return { ok: true };
}
