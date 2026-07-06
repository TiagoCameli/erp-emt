"use server";

import { revalidatePath } from "next/cache";

import type { EventoTrilha } from "@/components/canonicos";
import type { Acao } from "@/config/recursos";
import { erroAcao } from "@/lib/erros";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  buscarRecebimento,
  trilhaRecebimento,
  type RecebimentoDetalhe,
} from "@/modules/compras/recebimentos/queries";
import {
  recebimentoSchema,
  type RecebimentoInput,
} from "@/modules/compras/recebimentos/schemas";

const RECURSO = "compras.recebimentos" as const;
const ROTA = "/compras/recebimentos";

export type ResultadoRecebimento =
  | { ok: true; recebimentoId: string }
  | { erro: string };

/** Converte o throw de exigirPermissao no contrato { erro } das actions. */
async function checarPermissao(acao: Acao): Promise<boolean> {
  try {
    await exigirPermissao(RECURSO, acao);
    return true;
  } catch {
    return false;
  }
}

/**
 * Registra o recebimento de uma OC via RPC fn_registrar_recebimento.
 *
 * A RPC é a dona da regra: confere a NF contra o esperado (trava com mensagem
 * clara se divergir além da tolerância), atualiza o status da OC para recebido
 * ou recebido_parcial e confirma o lançamento previsto como a_pagar. Aqui só
 * validamos a entrada, montamos o p_itens jsonb com os itens que têm quantidade
 * maior que zero e repassamos a mensagem do banco em caso de erro.
 *
 * Fase 2 não tem editar nem excluir recebimento. Cancelar (estorno) fica para
 * uma fase futura: por ora um recebimento gravado é definitivo.
 */
export async function registrarRecebimento(
  dados: RecebimentoInput,
): Promise<ResultadoRecebimento> {
  if (!(await checarPermissao("criar"))) {
    return { erro: "Sem permissão para registrar recebimentos" };
  }

  const validado = recebimentoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const entrada = validado.data;

  // Só vão para a RPC os itens efetivamente recebidos (quantidade > 0).
  const pItens = entrada.itens
    .filter((item) => item.quantidadeRecebida > 0)
    .map((item) => ({
      oc_item_id: item.ocItemId,
      quantidade_recebida: item.quantidadeRecebida,
    }));

  if (pItens.length === 0) {
    return { erro: "Informe a quantidade recebida em ao menos um item" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_registrar_recebimento", {
    p_oc_id: entrada.ordemCompraId,
    p_numero_nf: entrada.numeroNf,
    p_valor_nf: entrada.valorNf,
    p_data_recebimento: entrada.dataRecebimento,
    p_data_vencimento: entrada.dataVencimento,
    p_itens: pItens,
    p_observacoes: entrada.observacoes,
  });

  if (error) {
    // A RPC manda mensagens de negócio prontas (divergência de NF, OC fora do
    // status, sem permissão). Repassa direto para o toast.
    return erroAcao(
      "compras.recebimentos.registrarRecebimento",
      error,
      error.message,
    );
  }

  revalidatePath(ROTA);
  return { ok: true, recebimentoId: data };
}

/**
 * Carrega o detalhe de um recebimento já gravado, para a tela de detalhe que
 * abre a partir da listagem. Exige ver recebimentos; a RLS é a última barreira.
 */
export async function carregarRecebimento(
  id: string,
): Promise<RecebimentoDetalhe | null> {
  if (!(await checarPermissao("ver"))) return null;
  return buscarRecebimento(id);
}

/**
 * Carrega a trilha (audit_log) de um recebimento para a tela de detalhe.
 * Exige ver recebimentos.
 */
export async function carregarTrilhaRecebimento(
  id: string,
): Promise<EventoTrilha[]> {
  if (!(await checarPermissao("ver"))) return [];
  return trilhaRecebimento(id);
}
