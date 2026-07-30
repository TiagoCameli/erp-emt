"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Acao } from "@/config/recursos";
import { erroAcao, logErroServidor } from "@/lib/erros";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";

const RECURSO = "financeiro.aprovacao-pagamentos" as const;
const ROTA = "/financeiro/aprovacao-pagamentos";
/** A aprovação muda a fila de pagamentos e a projeção de caixa junto. */
const ROTAS_AFETADAS = [
  ROTA,
  "/financeiro/pagamentos",
  "/financeiro/programados",
  "/financeiro/lancamentos",
] as const;

export type ResultadoAcao = { ok: true } | { erro: string };

const uuidSchema = z.uuid();
const dataSchema = z.iso.date();

/** Converte o throw de exigirPermissao no contrato { erro } das actions. */
async function checarPermissao(acao: Acao): Promise<boolean> {
  try {
    await exigirPermissao(RECURSO, acao);
    return true;
  } catch {
    return false;
  }
}

function revalidar(): void {
  for (const rota of ROTAS_AFETADAS) revalidatePath(rota);
}

/**
 * Valida a data programada opcional. Vazio significa "usa o vencimento da
 * parcela", que é o fallback do banco, não erro: devolve `undefined` para o
 * parâmetro sair da chamada e o default da RPC valer.
 */
function normalizarData(
  data: string | null | undefined,
): { ok: true; valor: string | undefined } | { ok: false } {
  if (data === null || data === undefined || data === "") {
    return { ok: true, valor: undefined };
  }
  const valida = dataSchema.safeParse(data);
  return valida.success ? { ok: true, valor: valida.data } : { ok: false };
}

/**
 * Aprova uma parcela a pagar e autoriza o pagamento para uma data.
 *
 * Sem data informada, o banco grava a data programada = vencimento da parcela
 * (item 8): parcela aprovada nunca fica sem data autorizada, e o check da tabela
 * garante isso mesmo se alguém chamar a RPC por fora daqui.
 */
export async function aprovarParcela(
  id: string,
  dataProgramada?: string | null,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("aprovar"))) {
    return { erro: "Sem permissão para aprovar pagamentos" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Parcela inválida" };

  const data = normalizarData(dataProgramada);
  if (!data.ok) return { erro: "Informe uma data programada válida" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_aprovar_parcela", {
    p_parcela_id: idValido.data,
    p_data_programada: data.valor,
  });

  if (error) {
    return erroAcao(
      "financeiro.aprovacao-pagamentos.aprovarParcela",
      error,
      error.message || "Não foi possível aprovar o pagamento",
    );
  }

  revalidar();
  return { ok: true };
}

/**
 * Manda a parcela para revisão: sai da fila e volta para quem lançou ajustar.
 *
 * Substitui o antigo "Rejeitar", que nunca funcionou: a fila lista parcela
 * `pendente` e a RPC de desaprovar exige `aprovado`, então todo clique
 * devolvia erro. Aqui nada é cancelado, o lançamento continua vivo e continua
 * contando na previsão de caixa, e o motivo vai para a trilha da parcela.
 */
export async function revisarParcela(
  id: string,
  motivo: string,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("desaprovar"))) {
    return { erro: "Sem permissão para enviar pagamentos para revisão" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Parcela inválida" };

  const motivoLimpo = motivo.trim();
  if (motivoLimpo === "") return { erro: "Informe o motivo da revisão" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_revisar_parcela", {
    p_parcela_id: idValido.data,
    p_motivo: motivoLimpo,
  });

  if (error) {
    return erroAcao(
      "financeiro.aprovacao-pagamentos.revisarParcela",
      error,
      error.message || "Não foi possível enviar o pagamento para revisão",
    );
  }

  revalidar();
  return { ok: true };
}

/**
 * Reprograma a data autorizada de uma parcela já aprovada, com motivo.
 *
 * Só quem aprova pagamento pode (item 12). Substitui a antiga programação da aba
 * Programados, que era dica opcional com permissão de editar programados: agora
 * a data é autorização de pagamento, então mudar a data é mudar a autorização.
 */
export async function reprogramarParcela(
  id: string,
  dataProgramada: string,
  motivo: string,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("aprovar"))) {
    return { erro: "Sem permissão para reprogramar a data de pagamento" };
  }

  const idValido = uuidSchema.safeParse(id);
  if (!idValido.success) return { erro: "Parcela inválida" };

  const dataValida = dataSchema.safeParse(dataProgramada);
  if (!dataValida.success) return { erro: "Informe a nova data programada" };

  const motivoLimpo = motivo.trim();
  if (motivoLimpo === "") return { erro: "Informe o motivo da reprogramação" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_reprogramar_parcela", {
    p_parcela_id: idValido.data,
    p_data_programada: dataValida.data,
    p_motivo: motivoLimpo,
  });

  if (error) {
    return erroAcao(
      "financeiro.aprovacao-pagamentos.reprogramarParcela",
      error,
      error.message || "Não foi possível reprogramar a data",
    );
  }

  revalidar();
  return { ok: true };
}

/**
 * Aprova várias parcelas de uma vez. `dataProgramada` nula aplica o vencimento
 * de cada parcela (o default); com data informada, todas ficam autorizadas para
 * a mesma data.
 *
 * Para cada parcela aprovada incrementa o contador; se alguma falhar, interrompe
 * e devolve a mensagem do banco junto da contagem do que já passou, para o toast
 * informar o parcial. Revalida uma única vez no fim.
 */
export async function aprovarParcelasEmLote(
  ids: string[],
  dataProgramada?: string | null,
): Promise<{ ok: true; aprovadas: number } | { erro: string; aprovadas: number }> {
  if (!(await checarPermissao("aprovar"))) {
    return { erro: "Sem permissão para aprovar pagamentos", aprovadas: 0 };
  }

  const idsValidos = z.array(uuidSchema).min(1).safeParse(ids);
  if (!idsValidos.success) {
    return { erro: "Selecione ao menos um pagamento", aprovadas: 0 };
  }

  const data = normalizarData(dataProgramada);
  if (!data.ok) {
    return { erro: "Informe uma data programada válida", aprovadas: 0 };
  }

  const supabase = await createClient();
  let aprovadas = 0;

  for (const id of idsValidos.data) {
    const { error } = await supabase.rpc("fn_aprovar_parcela", {
      p_parcela_id: id,
      p_data_programada: data.valor,
    });
    if (error) {
      revalidar();
      logErroServidor(
        "financeiro.aprovacao-pagamentos.aprovarParcelasEmLote",
        error,
      );
      return {
        erro: error.message || "Não foi possível aprovar o pagamento",
        aprovadas,
      };
    }
    aprovadas += 1;
  }

  revalidar();
  return { ok: true, aprovadas };
}
