"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Acao } from "@/config/recursos";
import { erroAcao, logErroServidor } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import type { EventoTrilha } from "@/components/canonicos";
import { listarAnexosDoDocumento } from "@/modules/_shared/anexos/queries";
import type { AnexoDoDocumento } from "@/modules/_shared/anexos/queries";
import { buscarOrdem } from "@/modules/compras/ordens/queries";
import type { OrdemItem } from "@/modules/compras/ordens/queries";
import {
  buscarLancamento,
  trilhaLancamento,
} from "@/modules/financeiro/lancamentos/queries";
import type { LancamentoDetalhe } from "@/modules/financeiro/lancamentos/queries";

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
 * Valida a conta bancária opcional da aprovação. Vazio significa "mantém a conta
 * escolhida no lançamento", que é o fallback do banco: devolve `undefined` para o
 * parâmetro sair da chamada e o default da RPC valer.
 */
function normalizarConta(
  contaId: string | null | undefined,
): { ok: true; valor: string | undefined } | { ok: false } {
  if (contaId === null || contaId === undefined || contaId === "") {
    return { ok: true, valor: undefined };
  }
  const valida = idSchema.safeParse(contaId);
  return valida.success ? { ok: true, valor: valida.data } : { ok: false };
}

/**
 * Aprova uma parcela a pagar e autoriza o pagamento para uma data.
 *
 * Sem data informada, o banco grava a data programada = vencimento da parcela
 * (item 8): parcela aprovada nunca fica sem data autorizada, e o check da tabela
 * garante isso mesmo se alguém chamar a RPC por fora daqui.
 *
 * `contaId` só vem quando quem aprova troca a conta no modal, e a troca vale
 * apenas para esta parcela: sem ele o banco mantém a conta que veio do
 * lançamento, que é o portão da aprovação.
 */
export async function aprovarParcela(
  id: string,
  dataProgramada?: string | null,
  contaId?: string | null,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("aprovar"))) {
    return { erro: "Sem permissão para aprovar pagamentos" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Parcela inválida" };

  const data = normalizarData(dataProgramada);
  if (!data.ok) return { erro: "Informe uma data programada válida" };

  const conta = normalizarConta(contaId);
  if (!conta.ok) return { erro: "Conta bancária inválida" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_aprovar_parcela", {
    p_parcela_id: idValido.data,
    p_data_programada: data.valor,
    p_conta_id: conta.valor,
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

  const idValido = idSchema.safeParse(id);
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

  const idValido = idSchema.safeParse(id);
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
 * a mesma data. `contaId` segue a mesma ideia: sem ele cada parcela mantém a
 * conta do próprio lançamento, com ele todas as selecionadas passam a sair da
 * mesma conta.
 *
 * Para cada parcela aprovada incrementa o contador; se alguma falhar, interrompe
 * e devolve a mensagem do banco junto da contagem do que já passou, para o toast
 * informar o parcial. Revalida uma única vez no fim.
 */
export async function aprovarParcelasEmLote(
  ids: string[],
  dataProgramada?: string | null,
  contaId?: string | null,
): Promise<{ ok: true; aprovadas: number } | { erro: string; aprovadas: number }> {
  if (!(await checarPermissao("aprovar"))) {
    return { erro: "Sem permissão para aprovar pagamentos", aprovadas: 0 };
  }

  const idsValidos = z.array(idSchema).min(1).safeParse(ids);
  if (!idsValidos.success) {
    return { erro: "Selecione ao menos um pagamento", aprovadas: 0 };
  }

  const data = normalizarData(dataProgramada);
  if (!data.ok) {
    return { erro: "Informe uma data programada válida", aprovadas: 0 };
  }

  const conta = normalizarConta(contaId);
  if (!conta.ok) {
    return { erro: "Conta bancária inválida", aprovadas: 0 };
  }

  const supabase = await createClient();
  let aprovadas = 0;

  for (const id of idsValidos.data) {
    const { error } = await supabase.rpc("fn_aprovar_parcela", {
      p_parcela_id: id,
      p_data_programada: data.valor,
      p_conta_id: conta.valor,
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

/**
 * Manda várias parcelas para revisão com um motivo único. Mesmo contrato do
 * lote de aprovação: para na primeira que falhar e devolve quantas passaram,
 * para o toast dizer o parcial em vez de mentir "tudo certo".
 */
export async function revisarParcelasEmLote(
  ids: string[],
  motivo: string,
): Promise<{ ok: true; revisadas: number } | { erro: string; revisadas: number }> {
  if (!(await checarPermissao("desaprovar"))) {
    return {
      erro: "Sem permissão para enviar pagamentos para revisão",
      revisadas: 0,
    };
  }

  const idsValidos = z.array(idSchema).min(1).safeParse(ids);
  if (!idsValidos.success) {
    return { erro: "Selecione ao menos um pagamento", revisadas: 0 };
  }

  const motivoLimpo = motivo.trim();
  if (motivoLimpo === "") {
    return { erro: "Informe o motivo da revisão", revisadas: 0 };
  }

  const supabase = await createClient();
  let revisadas = 0;

  for (const id of idsValidos.data) {
    const { error } = await supabase.rpc("fn_revisar_parcela", {
      p_parcela_id: id,
      p_motivo: motivoLimpo,
    });
    if (error) {
      revalidar();
      logErroServidor(
        "financeiro.aprovacao-pagamentos.revisarParcelasEmLote",
        error,
      );
      return {
        erro: error.message || "Não foi possível enviar para revisão",
        revisadas,
      };
    }
    revisadas += 1;
  }

  revalidar();
  return { ok: true, revisadas };
}

/**
 * Marca (ou desmarca) uma parcela de dinheiro ou cartão como conferida.
 *
 * Carimbo de conferência, não etapa de processo. Não muda status, não libera e
 * não trava pagamento nenhum: dinheiro continua indo direto para Pagamentos e
 * cartão continua nascendo quitado, conferido ou não. Serve para quem responde
 * pela aprovação registrar que conferiu um pagamento que nunca passou pela
 * fila, quase sempre depois de já pago.
 *
 * Não confundir com `revisarParcela` deste mesmo arquivo: lá "revisão" é
 * DEVOLVER a parcela para ajuste, o oposto disto.
 *
 * Permissão de aprovar, a mesma de aprovar pagamento: é a mesma pessoa e a
 * mesma responsabilidade. O banco recusa de novo por dentro da RPC.
 */
export async function marcarParcelaConferida(
  id: string,
  conferido: boolean,
): Promise<ResultadoAcao> {
  if (!(await checarPermissao("aprovar"))) {
    return { erro: "Sem permissão para marcar pagamentos como conferidos" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Parcela inválida" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_marcar_parcela_conferida", {
    // Sempre explícito nos dois sentidos: o toggle não pode depender do default
    // da função no banco.
    p_parcela_id: idValido.data,
    p_conferido: conferido,
  });

  if (error) {
    return erroAcao(
      "financeiro.aprovacao-pagamentos.marcarParcelaConferida",
      error,
      error.message || "Não foi possível registrar a conferência",
    );
  }

  // Só esta tela muda. Revalidar Pagamentos, Programados ou Lançamentos daria a
  // entender que a conferência mexe no caminho do dinheiro, e ela não mexe.
  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * Marca ou desmarca várias parcelas de uma vez, mesmo contrato dos outros lotes
 * da tela: para na primeira que falhar e devolve quantas passaram, para o toast
 * dizer o parcial em vez de mentir "tudo certo".
 */
export async function marcarParcelasConferidasEmLote(
  ids: string[],
  conferido: boolean,
): Promise<
  { ok: true; marcadas: number } | { erro: string; marcadas: number }
> {
  if (!(await checarPermissao("aprovar"))) {
    return {
      erro: "Sem permissão para marcar pagamentos como conferidos",
      marcadas: 0,
    };
  }

  const idsValidos = z.array(idSchema).min(1).safeParse(ids);
  if (!idsValidos.success) {
    return { erro: "Selecione ao menos um pagamento", marcadas: 0 };
  }

  const supabase = await createClient();
  let marcadas = 0;

  for (const id of idsValidos.data) {
    const { error } = await supabase.rpc("fn_marcar_parcela_conferida", {
      p_parcela_id: id,
      p_conferido: conferido,
    });
    if (error) {
      revalidatePath(ROTA);
      logErroServidor(
        "financeiro.aprovacao-pagamentos.marcarParcelasConferidasEmLote",
        error,
      );
      return {
        erro: error.message || "Não foi possível registrar a conferência",
        marcadas,
      };
    }
    marcadas += 1;
  }

  revalidatePath(ROTA);
  return { ok: true, marcadas };
}

/**
 * Carrega o lançamento inteiro para o painel de conferência da fila, sob
 * demanda: só quando alguém clica na linha.
 *
 * É leitura pura e serve a um painel 100% read-only. Não vem pronto na página
 * porque seriam N lançamentos completos (com parcelas, rateio, itens da OC,
 * anexos e trilha) para uma fila em que normalmente se abre um ou dois.
 */
export async function detalheDaFila(lancamentoId: string): Promise<
  | {
      lancamento: LancamentoDetalhe;
      anexos: AnexoDoDocumento[];
      trilha: EventoTrilha[];
      itensOrigem: OrdemItem[];
    }
  | { erro: string }
> {
  if (!(await checarPermissao("ver"))) {
    return { erro: "Sem permissão para ver a aprovação de pagamentos" };
  }

  const idValido = idSchema.safeParse(lancamentoId);
  if (!idValido.success) return { erro: "Lançamento inválido" };

  const lancamento = await buscarLancamento(idValido.data);
  if (!lancamento) return { erro: "Lançamento não encontrado" };

  const [anexos, trilha, ordem] = await Promise.all([
    listarAnexosDoDocumento("lancamento", lancamento.id),
    trilhaLancamento(lancamento.id),
    lancamento.origem === "oc" && lancamento.origemId
      ? buscarOrdem(lancamento.origemId)
      : Promise.resolve(null),
  ]);

  return {
    lancamento,
    anexos,
    trilha,
    itensOrigem: ordem?.itens ?? [],
  };
}
