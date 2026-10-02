"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Json } from "@/lib/database.types";
import { erroAcao, logErroServidor } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import {
  contaDoArquivoConfere,
  conferirMesFechado,
  decodificarOfx,
  parseOfx,
} from "@/lib/ofx";
import { exigirPermissao, getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { casarAutomaticamente } from "@/modules/financeiro/conciliacao/casamento";
import {
  candidatosDoPainel,
  movimentosLivres,
  periodoDoMes,
} from "@/modules/financeiro/conciliacao/painel";
import { carregarPainel } from "@/modules/financeiro/conciliacao/queries";

const RECURSO = "financeiro.conciliacao" as const;
const ROTA = "/financeiro/conciliacao";

export type ResultadoAcao = { ok: true } | { erro: string };
export type ResultadoImportacao =
  | {
      ok: true;
      inseridas: number;
      ignoradas: number;
      /** Quantos movimentos o casamento automático já vinculou. */
      casadas: number;
      aviso: string | null;
    }
  | { erro: string };
export type ResultadoLote =
  | { ok: true; feitos: number; falhas: { id: string; erro: string }[] }
  | { erro: string };

/** Transação no formato que a RPC fn_importar_extrato espera no jsonb. */
interface TransacaoImportacao {
  data: string;
  valor: number;
  memo: string | null;
  fitid: string | null;
}

const resultadoImportacaoSchema = z.object({
  inseridas: z.number(),
  ignoradas: z.number(),
});

const resultadoLoteSchema = z.object({
  casadas: z.number(),
  falhas: z.array(z.object({ transacao: z.string(), erro: z.string() })),
});

/** Mensagem do Postgres sem o prefixo técnico, para o toast. */
function mensagem(e: unknown, padrao: string): string {
  if (e && typeof e === "object" && "message" in e) {
    const texto = String((e as { message: unknown }).message ?? "");
    if (texto) return texto;
  }
  return padrao;
}

/**
 * Casa sozinho o que bate na conta e no mês: valor exato, mesmo sentido,
 * janela de 3 dias, desempate pelo nome do favorecido (`casamento.ts`). Só
 * vincula parcela paga NESTA conta ou transferência: o que muda o app (outra
 * conta, baixa, centavo) fica como sugestão para quem concilia.
 */
async function casarNoServidor(
  contaId: string,
  inicio: string,
  fim: string,
): Promise<{ casadas: number; falhas: { id: string; erro: string }[] }> {
  const painel = await carregarPainel(contaId, inicio, fim);
  const pares = casarAutomaticamente(
    movimentosLivres(painel),
    candidatosDoPainel(painel),
  );
  if (pares.length === 0) return { casadas: 0, falhas: [] };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_conciliacao_casar_lote", {
    p_pares: pares.map((par) => ({
      transacao: par.transacaoId,
      especie: par.especie,
      alvo: par.alvoId,
    })) as unknown as Json,
  });
  if (error) throw error;

  const resultado = resultadoLoteSchema.parse(data);
  return {
    casadas: resultado.casadas,
    falhas: resultado.falhas.map((f) => ({ id: f.transacao, erro: f.erro })),
  };
}

/**
 * Importa um extrato OFX para a conta escolhida e já roda o casamento
 * automático no período do arquivo.
 *
 * Recusa arquivo de outra conta (ACCTID contra o número cadastrado): com a
 * conciliação feita uma conta por vez, importar o extrato do BB na Caixa
 * deixaria as duas erradas sem ninguém notar.
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
    texto = decodificarOfx(await arquivo.arrayBuffer());
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

  const supabase = await createClient();
  const { data: conta } = await supabase
    .from("contas_bancarias")
    .select("nome, conta")
    .eq("id", contaId)
    .maybeSingle();
  if (conta && !contaDoArquivoConfere(extrato.contaOfx, conta.conta)) {
    return {
      erro: `Este arquivo é da conta ${extrato.contaOfx ?? "-"}, e não da ${conta.nome}. Escolha a conta certa ou o arquivo certo.`,
    };
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
  const inicio =
    extrato.periodoInicio ?? datas.reduce((a, b) => (a < b ? a : b));
  const fim = extrato.periodoFim ?? datas.reduce((a, b) => (a > b ? a : b));

  const { data, error } = await supabase.rpc("fn_importar_extrato", {
    p_conta_id: contaId,
    p_nome: arquivo.name,
    p_periodo_inicio: inicio,
    p_periodo_fim: fim,
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

  // O casamento automático é parte da importação para quem pode conciliar.
  // Se falhar, o extrato continua importado: a pessoa casa pelo botão.
  let casadas = 0;
  const usuario = await getUsuarioLogado();
  if (usuario && temPermissao(usuario, RECURSO, "editar")) {
    try {
      casadas = (await casarNoServidor(contaId, inicio, fim)).casadas;
    } catch (e) {
      logErroServidor("financeiro.conciliacao.importarOfx.casar", e);
    }
  }

  revalidatePath(ROTA);
  return {
    ok: true,
    inseridas: resumo.data.inseridas,
    ignoradas: resumo.data.ignoradas,
    casadas,
    // A conferência é do MÊS FECHADO e vale sobre o período que o ARQUIVO
    // declara, não sobre o que foi deduzido das transações.
    aviso: conferirMesFechado(extrato.periodoInicio, extrato.periodoFim),
  };
}

/** Roda o casamento automático numa conta e mês ("YYYY-MM"). */
export async function casarAutomatico(
  contaId: string,
  mes: string,
): Promise<ResultadoLote> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para conciliar" };
  }
  if (!idSchema.safeParse(contaId).success) return { erro: "Conta inválida" };
  const periodo = periodoDoMes(mes);
  if (!periodo) return { erro: "Mês inválido" };

  try {
    const { casadas, falhas } = await casarNoServidor(
      contaId,
      periodo.inicio,
      periodo.fim,
    );
    revalidatePath(ROTA);
    return { ok: true, feitos: casadas, falhas };
  } catch (e) {
    return erroAcao(
      "financeiro.conciliacao.casarAutomatico",
      e,
      "Não foi possível casar os movimentos",
    );
  }
}

const casarSchema = z.object({
  transacaoId: idSchema,
  especie: z.enum(["parcela", "transferencia"]),
  alvoId: idSchema,
  ajustar: z.boolean(),
});

/**
 * Casa um movimento com o que a pessoa escolheu. Conforme o candidato, o banco
 * também muda a conta (paga em outra conta), dá baixa (parcela em aberto) ou
 * ajusta a diferença como juros/desconto (`ajustar`), sempre com evento na
 * trilha da parcela.
 */
export async function casar(entrada: z.input<typeof casarSchema>): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para conciliar" };
  }
  const dados = casarSchema.safeParse(entrada);
  if (!dados.success) return { erro: "Dados do casamento inválidos" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_conciliacao_casar", {
    p_transacao_id: dados.data.transacaoId,
    p_especie: dados.data.especie,
    p_alvo_id: dados.data.alvoId,
    p_automatica: false,
    p_ajustar: dados.data.ajustar,
  });
  if (error) {
    return erroAcao(
      "financeiro.conciliacao.casar",
      error,
      mensagem(error, "Não foi possível casar o movimento"),
    );
  }
  revalidatePath(ROTA);
  return { ok: true };
}

/** Desfaz a conciliação de um movimento: ele volta para "faltam no app". */
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

const mesCompetenciaSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-01$/, "Informe o mês de referência");

const lancarSchema = z.object({
  transacaoIds: z.array(idSchema).min(1, "Escolha ao menos um movimento").max(500),
  /** Só vale quando é um movimento: no lote cada um leva o próprio histórico. */
  descricao: z.string().trim().max(500).optional(),
  centroCustoId: idSchema,
  mesCompetencia: mesCompetenciaSchema,
  categoriaId: idSchema.optional(),
  fornecedorId: idSchema.optional(),
  clienteId: idSchema.optional(),
  numeroDocumento: z.string().trim().max(60).optional(),
  observacoes: z.string().trim().max(2000).optional(),
});

export type LancarEntrada = z.input<typeof lancarSchema>;

/**
 * Lança o que está no banco e falta no app: cada movimento vira um lançamento
 * já pago nesta conta e já conciliado, com o centro de custo (ou etapa) e o
 * mês de referência que a pessoa informou. Em lote, os mesmos dados valem
 * para todos (as tarifas do mês, por exemplo) e cada um leva o histórico do
 * banco como descrição.
 */
export async function lancarMovimentos(
  entrada: LancarEntrada,
): Promise<ResultadoLote> {
  let usuario;
  try {
    usuario = await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para conciliar" };
  }
  if (
    !temPermissao(usuario, "financeiro.lancamentos", "criar") &&
    !temPermissao(usuario, "financeiro.recebimentos", "criar")
  ) {
    return { erro: "Sem permissão para criar lançamentos" };
  }

  const dados = lancarSchema.safeParse(entrada);
  if (!dados.success) {
    return { erro: dados.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const { transacaoIds, descricao, ...comuns } = dados.data;
  const supabase = await createClient();
  const falhas: { id: string; erro: string }[] = [];
  let feitos = 0;
  for (const transacaoId of transacaoIds) {
    const { error } = await supabase.rpc("fn_conciliacao_lancar", {
      p_transacao_id: transacaoId,
      p_dados: {
        ...comuns,
        descricao: transacaoIds.length === 1 ? descricao : undefined,
      } as unknown as Json,
    });
    if (error) {
      falhas.push({ id: transacaoId, erro: mensagem(error, "Não foi possível lançar") });
    } else {
      feitos += 1;
    }
  }

  revalidatePath(ROTA);
  return { ok: true, feitos, falhas };
}

const transferirSchema = z.object({
  transacaoIds: z.array(idSchema).min(1).max(500),
  contaContraparteId: idSchema,
  centroCustoId: idSchema.optional(),
  descricao: z.string().trim().max(500).optional(),
});

/**
 * Lança como transferência entre contas (aplicação e resgate do Rende Fácil,
 * envio para outra conta da empresa). O sentido sai do movimento: débito sai
 * desta conta, crédito entra nela.
 */
export async function transferirMovimentos(
  entrada: z.input<typeof transferirSchema>,
): Promise<ResultadoLote> {
  let usuario;
  try {
    usuario = await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para conciliar" };
  }
  if (!temPermissao(usuario, "financeiro.transferencias", "criar")) {
    return { erro: "Sem permissão para criar transferências" };
  }

  const dados = transferirSchema.safeParse(entrada);
  if (!dados.success) return { erro: "Escolha a outra conta da transferência" };

  const supabase = await createClient();
  const falhas: { id: string; erro: string }[] = [];
  let feitos = 0;
  for (const transacaoId of dados.data.transacaoIds) {
    const { error } = await supabase.rpc("fn_conciliacao_lancar_transferencia", {
      p_transacao_id: transacaoId,
      p_conta_contraparte_id: dados.data.contaContraparteId,
      p_centro_custo_id: dados.data.centroCustoId,
      p_descricao: dados.data.descricao,
    });
    if (error) {
      falhas.push({ id: transacaoId, erro: mensagem(error, "Não foi possível lançar") });
    } else {
      feitos += 1;
    }
  }

  revalidatePath(ROTA);
  return { ok: true, feitos, falhas };
}

const motivoSchema = z.string().trim().min(3, "Informe o motivo").max(500);

/**
 * No app e fora do banco: o pagamento foi registrado na conta errada. Muda a
 * conta da parcela paga, com motivo na trilha.
 */
export async function trocarContaParcela(
  parcelaId: string,
  contaId: string,
  motivo: string,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para conciliar" };
  }
  if (!idSchema.safeParse(parcelaId).success) return { erro: "Parcela inválida" };
  if (!idSchema.safeParse(contaId).success) return { erro: "Escolha a conta certa" };
  const motivoOk = motivoSchema.safeParse(motivo);
  if (!motivoOk.success) return { erro: "Informe o motivo da troca de conta" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_conciliacao_trocar_conta", {
    p_parcela_id: parcelaId,
    p_conta_id: contaId,
    p_motivo: motivoOk.data,
  });
  if (error) {
    return erroAcao(
      "financeiro.conciliacao.trocarConta",
      error,
      mensagem(error, "Não foi possível trocar a conta"),
    );
  }
  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * No app e fora do banco: o pagamento não existiu. Exclui o lançamento
 * (manual) com motivo; a cópia fica no arquivo morto para restaurar.
 */
export async function excluirLancamentoDaConciliacao(
  parcelaId: string,
  motivo: string,
): Promise<ResultadoAcao> {
  let usuario;
  try {
    usuario = await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para conciliar" };
  }
  if (!temPermissao(usuario, "financeiro.lancamentos", "excluir")) {
    return { erro: "Sem permissão para excluir lançamentos" };
  }
  if (!idSchema.safeParse(parcelaId).success) return { erro: "Parcela inválida" };
  const motivoOk = motivoSchema.safeParse(motivo);
  if (!motivoOk.success) return { erro: "Informe o motivo da exclusão" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_conciliacao_excluir_lancamento", {
    p_parcela_id: parcelaId,
    p_motivo: motivoOk.data,
  });
  if (error) {
    return erroAcao(
      "financeiro.conciliacao.excluirLancamento",
      error,
      mensagem(error, "Não foi possível excluir o lançamento"),
    );
  }
  revalidatePath(ROTA);
  return { ok: true };
}
