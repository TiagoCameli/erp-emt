"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Json } from "@/lib/database.types";
import { erroAcao } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import { parseOfx } from "@/lib/ofx";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  sugerirParcelas,
  sugerirTransferencias,
  type SugestaoConciliacao,
} from "@/modules/financeiro/conciliacao/queries";

const RECURSO = "financeiro.conciliacao" as const;
const ROTA = "/financeiro/conciliacao";

export type ResultadoAcao = { ok: true } | { erro: string };
export type ResultadoImportacao =
  | { ok: true; inseridas: number; ignoradas: number }
  | { erro: string };

/** Transação no formato que a RPC fn_importar_extrato espera no jsonb. */
interface TransacaoImportacao {
  data: string;
  valor: number;
  memo: string | null;
  fitid: string | null;
}

/** Forma do retorno jsonb da RPC fn_importar_extrato. */
const resultadoImportacaoSchema = z.object({
  inseridas: z.number(),
  ignoradas: z.number(),
});

/**
 * Importa um extrato OFX: lê o arquivo do FormData, parseia as transações e
 * chama fn_importar_extrato, que dedup pelos FITIDs já importados. Retorna
 * quantas transações foram inseridas e quantas foram ignoradas (duplicadas).
 */
export async function importarOfx(
  formData: FormData,
): Promise<ResultadoImportacao> {
  try {
    await exigirPermissao(RECURSO, "criar");
  } catch {
    return { erro: "Sem permissão para importar extratos" };
  }

  const contaId = formData.get("contaId");
  if (typeof contaId !== "string" || !idSchema.safeParse(contaId).success) {
    return { erro: "Selecione a conta bancária do extrato" };
  }

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Selecione o arquivo .ofx do extrato" };
  }

  let texto: string;
  try {
    texto = await arquivo.text();
  } catch (e) {
    return erroAcao(
      "financeiro.conciliacao.importarOfx",
      e,
      "Não foi possível ler o arquivo. Tente novamente",
    );
  }

  const extrato = parseOfx(texto);
  if (extrato.transacoes.length === 0) {
    return { erro: "Nenhuma transação encontrada no arquivo OFX" };
  }

  const transacoes: TransacaoImportacao[] = extrato.transacoes.map(
    (transacao) => ({
      data: transacao.data,
      valor: transacao.valor,
      memo: transacao.memo,
      fitid: transacao.fitid,
    }),
  );

  // Quando o OFX não traz DTSTART/DTEND, derivamos o período pela menor e maior
  // data das transações (a ordem do arquivo não é garantidamente cronológica).
  const datas = transacoes.map((transacao) => transacao.data);
  const inicioFallback = datas.reduce((a, b) => (a < b ? a : b));
  const fimFallback = datas.reduce((a, b) => (a > b ? a : b));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_importar_extrato", {
    p_conta_id: contaId,
    p_nome: arquivo.name,
    p_periodo_inicio: extrato.periodoInicio ?? inicioFallback,
    p_periodo_fim: extrato.periodoFim ?? fimFallback,
    p_transacoes: transacoes as unknown as Json,
  });

  if (error) {
    return erroAcao(
      "financeiro.conciliacao.importarOfx",
      error,
      error.message || "Não foi possível importar o extrato",
    );
  }

  const resumo = resultadoImportacaoSchema.safeParse(data);
  if (!resumo.success) {
    return erroAcao(
      "financeiro.conciliacao.importarOfx",
      resumo.error,
      "Não foi possível ler o resultado da importação",
    );
  }

  revalidatePath(ROTA);
  return {
    ok: true,
    inseridas: resumo.data.inseridas,
    ignoradas: resumo.data.ignoradas,
  };
}

export type ResultadoSugestoes =
  | { ok: true; sugestoes: SugestaoConciliacao[] }
  | { erro: string };

/**
 * Busca, sob demanda, o que casa com a transação: parcelas pagas E
 * transferências entre contas (mesma conta, mesmo valor em módulo, data dentro
 * de +/- 3 dias). Usada pelo diálogo de conciliação ao abrir, para não
 * pré-carregar sugestões de toda transação da listagem.
 *
 * As duas buscas vão juntas porque o extrato não distingue: um débito de
 * R$ 450.000,00 tanto pode ser o pagamento de uma parcela quanto o envio de
 * uma transferência, e quem decide é quem está conciliando.
 */
export async function buscarSugestoes(transacao: {
  contaBancariaId: string;
  valor: number;
  dataMovimento: string;
}): Promise<ResultadoSugestoes> {
  try {
    await exigirPermissao(RECURSO, "ver");
  } catch {
    return { erro: "Sem permissão para ver as transações" };
  }

  if (!idSchema.safeParse(transacao.contaBancariaId).success) {
    return { erro: "Conta bancária inválida" };
  }

  try {
    const [parcelas, transferencias] = await Promise.all([
      sugerirParcelas(transacao),
      sugerirTransferencias(transacao),
    ]);
    return {
      ok: true,
      sugestoes: [
        ...parcelas.map(
          (parcela): SugestaoConciliacao => ({
            especie: "parcela",
            id: parcela.id,
            parcela,
          }),
        ),
        ...transferencias.map(
          (transferencia): SugestaoConciliacao => ({
            especie: "transferencia",
            id: transferencia.id,
            transferencia,
          }),
        ),
      ],
    };
  } catch (e) {
    return erroAcao(
      "financeiro.conciliacao.buscarSugestoes",
      e,
      "Não foi possível buscar sugestões para a transação",
    );
  }
}

/**
 * Concilia uma transação de extrato com uma parcela paga, via RPC.
 *
 * A permissão cobrada aqui é `editar`, a MESMA que `fn_conciliar_transacao`
 * exige no banco. Antes a action pedia `criar`: quem tivesse só `criar` via o
 * botão, clicava e levava a recusa crua do Postgres no fim do caminho.
 */
export async function conciliar(
  transacaoId: string,
  parcelaId: string,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para conciliar transações" };
  }

  if (!idSchema.safeParse(transacaoId).success) {
    return { erro: "Transação inválida" };
  }
  if (!idSchema.safeParse(parcelaId).success) {
    return { erro: "Parcela inválida" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_conciliar_transacao", {
    p_transacao_id: transacaoId,
    p_parcela_id: parcelaId,
  });

  if (error) {
    return erroAcao(
      "financeiro.conciliacao.conciliar",
      error,
      error.message || "Não foi possível conciliar a transação",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * Concilia uma transação de extrato com um LADO de uma transferência entre
 * contas, via RPC. O lado sai do sentido do movimento: débito casa com a conta
 * de origem, crédito com a de destino.
 */
export async function conciliarTransferencia(
  transacaoId: string,
  transferenciaId: string,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para conciliar transações" };
  }

  if (!idSchema.safeParse(transacaoId).success) {
    return { erro: "Transação inválida" };
  }
  if (!idSchema.safeParse(transferenciaId).success) {
    return { erro: "Transferência inválida" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_conciliar_transferencia", {
    p_transacao_id: transacaoId,
    p_transferencia_id: transferenciaId,
  });

  if (error) {
    return erroAcao(
      "financeiro.conciliacao.conciliarTransferencia",
      error,
      error.message || "Não foi possível conciliar a transferência",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

/** Desfaz a conciliação de uma transação de extrato, via RPC. */
export async function desconciliar(
  transacaoId: string,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para desconciliar transações" };
  }

  if (!idSchema.safeParse(transacaoId).success) {
    return { erro: "Transação inválida" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_desconciliar_transacao", {
    p_transacao_id: transacaoId,
  });

  if (error) {
    return erroAcao(
      "financeiro.conciliacao.desconciliar",
      error,
      error.message || "Não foi possível desconciliar a transação",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}
