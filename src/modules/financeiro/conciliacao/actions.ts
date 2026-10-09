"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Json } from "@/lib/database.types";
import { erroAcao, logErroServidor } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import {
  contaDoArquivo,
  contaDoArquivoConfere,
  conferirMesFechado,
  conferirMovimentosNoPeriodo,
  decodificarOfx,
  numerarRepetidos,
  parseOfx,
  recortarExtrato,
} from "@/lib/ofx";
import {
  exigirPermissao,
  getUsuarioLogado,
  temPermissao,
} from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { casarTudo } from "@/modules/financeiro/conciliacao/estorno";
import {
  INICIO_DA_CONCILIACAO,
  resolverContaDoArquivo,
} from "@/modules/financeiro/conciliacao/importacoes";
import {
  candidatosDoPainel,
  movimentosLivres,
  precisaConferir,
  vizinhosLivres,
  periodoDoMes,
  periodoDosExtratos,
  TODOS_OS_MESES,
} from "@/modules/financeiro/conciliacao/painel";
import { carregarPainel } from "@/modules/financeiro/conciliacao/queries";
import {
  buscarLancamento,
  type LancamentoDetalhe,
} from "@/modules/financeiro/lancamentos/queries";

const RECURSO = "financeiro.conciliacao" as const;
const ROTA = "/financeiro/conciliacao";

export type ResultadoAcao = { ok: true } | { erro: string };
export type ResultadoImportacao =
  | {
      ok: true;
      inseridas: number;
      ignoradas: number;
      /** Os que já estavam importados, para a pessoa ver quais foram. */
      ignorados: MovimentoIgnorado[];
      /** Quantos movimentos o casamento automático já vinculou. */
      casadas: number;
      /** Quantos as regras automáticas por histórico lançaram (Bloco H). */
      regras: number;
      aviso: string | null;
    }
  | { erro: string };
export type ResultadoLote =
  | {
      ok: true;
      feitos: number;
      falhas: { id: string; erro: string }[];
      /** Quantos as regras automáticas lançaram antes do casamento. */
      regras?: number;
    }
  | { erro: string };

/** Transação no formato que a RPC fn_conciliacao_importar espera no jsonb. */
interface TransacaoImportacao {
  data: string;
  valor: number;
  memo: string | null;
  fitid: string | null;
  /** Posição entre os iguais sem FITID no arquivo (Bloco C). */
  n: number | null;
}

/** Movimento que já estava importado e não entrou de novo. */
export interface MovimentoIgnorado {
  data: string;
  valor: number;
  memo: string | null;
  fitid: string | null;
}

const resultadoImportacaoSchema = z.object({
  inseridas: z.number(),
  ignoradas: z.number(),
  ignorados: z
    .array(
      z.object({
        data: z.string(),
        valor: z.coerce.number(),
        memo: z.string().nullable(),
        fitid: z.string().nullable(),
      }),
    )
    .optional()
    .default([]),
});

const resultadoLoteSchema = z.object({
  casadas: z.number(),
  falhas: z.array(z.object({ transacao: z.string(), erro: z.string() })),
});

const resultadoRegrasSchema = z.object({
  aplicadas: z.number(),
  sugeridas: z.number(),
  porRegra: z.array(z.object({ regraId: z.string(), nome: z.string(), qtd: z.number() })),
  ignoradas: z.array(
    z.object({ transacaoId: z.string(), regra: z.string(), erro: z.string() }),
  ),
});

export type ResultadoRegras = z.infer<typeof resultadoRegrasSchema>;

/**
 * Regras automáticas por histórico (Bloco H): Rende Fácil vira transferência
 * com a subconta, tarifa vira lançamento. Rodam antes do casamento, para o
 * casamento não oferecer parcela a um movimento que a regra já explica.
 * `mes` null = todos os movimentos livres da conta.
 */
async function aplicarRegrasNoServidor(
  contaId: string,
  mes: string | null,
): Promise<ResultadoRegras> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_conciliacao_aplicar_regras", {
    p_conta_id: contaId,
    ...(mes ? { p_mes: mes } : {}),
  });
  if (error) throw error;
  return resultadoRegrasSchema.parse(data);
}

/** Mensagem do Postgres sem o prefixo técnico, para o toast. */
function mensagem(e: unknown, padrao: string): string {
  if (e && typeof e === "object" && "message" in e) {
    const texto = String((e as { message: unknown }).message ?? "");
    if (texto) return texto;
  }
  return padrao;
}

/**
 * Casa sozinho o que bate na conta e no mês. Primeiro os estornos (envio com
 * a devolução, `estorno.ts`), depois as parcelas: valor exato, mesmo sentido,
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
  const { estornos, pares } = casarTudo(
    movimentosLivres(painel),
    vizinhosLivres(painel),
    candidatosDoPainel(painel),
  );
  if (pares.length === 0 && estornos.length === 0) return { casadas: 0, falhas: [] };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_conciliacao_casar_lote", {
    p_pares: [
      // Estornos primeiro: o envio que voltou não pode casar com parcela.
      ...estornos.map((par) => ({
        transacao: par.transacaoId,
        especie: "estorno",
        alvo: par.parId,
      })),
      ...pares.map((par) => ({
        transacao: par.transacaoId,
        especie: par.especie,
        alvo: par.alvoId,
      })),
    ] as unknown as Json,
    // O automático: o banco só aceita parcela paga nesta conta, valor exato.
    p_automatica: true,
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

  // Sem conta no formulário (Bloco M), a conta sai do ACCTID do arquivo.
  const contaInformada = formData.get("contaId");
  if (
    contaInformada !== null &&
    contaInformada !== "" &&
    (typeof contaInformada !== "string" || !idSchema.safeParse(contaInformada).success)
  ) {
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

  const arquivoInteiro = parseOfx(texto);

  // Intervalo escolhido no diálogo: só os movimentos de `de` a `ate` entram, e
  // o período gravado é o intervalo (o BB manda de 30/12 a 31/01; quem concilia
  // janeiro usa de 01/01 a 31/01). Sem intervalo, vale o arquivo inteiro.
  const de = formData.get("de");
  const ate = formData.get("ate");
  const dataIso = /^\d{4}-\d{2}-\d{2}$/;
  let extrato = arquivoInteiro;
  if (typeof de === "string" && typeof ate === "string" && de && ate) {
    if (!dataIso.test(de) || !dataIso.test(ate) || de > ate) {
      return { erro: "Intervalo de datas inválido" };
    }
    extrato = recortarExtrato(arquivoInteiro, de, ate);
    if (extrato.transacoes.length === 0) {
      return { erro: "Nenhum movimento do arquivo cai no intervalo escolhido" };
    }
  }
  if (extrato.transacoes.length === 0) {
    return { erro: "Nenhuma transação encontrada no arquivo OFX" };
  }

  const supabase = await createClient();
  let contaId: string;
  if (typeof contaInformada === "string" && contaInformada) {
    contaId = contaInformada;
  } else {
    const { data: todas } = await supabase
      .from("contas_bancarias")
      .select("id, nome, conta, ativo, tipo, conta_pai_id");
    const achada = resolverContaDoArquivo(
      contaDoArquivo(texto).digitos,
      (todas ?? []).map((c) => ({
        id: c.id,
        nome: c.nome,
        numero: c.conta,
        ativo: c.ativo,
        tipo: c.tipo,
        contaPaiId: c.conta_pai_id,
      })),
    );
    if ("erro" in achada) return { erro: achada.erro };
    contaId = achada.conta.id;
  }
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

  const foraDoPeriodo = conferirMovimentosNoPeriodo(extrato);
  if (foraDoPeriodo) return { erro: foraDoPeriodo };

  const transacoes: TransacaoImportacao[] = numerarRepetidos(
    extrato.transacoes.map((transacao) => ({
      data: transacao.data,
      valor: transacao.valor,
      memo: transacao.memo,
      fitid: transacao.fitid,
    })),
  );

  // Quando o OFX não traz DTSTART/DTEND, derivamos o período pela menor e maior
  // data das transações (a ordem do arquivo não é garantidamente cronológica).
  const datas = transacoes.map((transacao) => transacao.data);
  const inicio =
    extrato.periodoInicio ?? datas.reduce((a, b) => (a < b ? a : b));
  const fim = extrato.periodoFim ?? datas.reduce((a, b) => (a > b ? a : b));

  const { data, error } = await supabase.rpc("fn_conciliacao_importar", {
    p_conta_id: contaId,
    p_nome: arquivo.name,
    p_periodo_inicio: inicio,
    p_periodo_fim: fim,
    // O saldo final do OFX é a prova do mês (Bloco B). Sem ele, null.
    p_saldo_final: extrato.saldoFinal,
    p_saldo_final_data: extrato.saldoFinalData,
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
  let regras = 0;
  const usuario = await getUsuarioLogado();
  if (usuario && temPermissao(usuario, RECURSO, "editar")) {
    try {
      regras = (await aplicarRegrasNoServidor(contaId, null)).aplicadas;
    } catch (e) {
      logErroServidor("financeiro.conciliacao.importarOfx.regras", e);
    }
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
    ignorados: resumo.data.ignorados,
    casadas,
    regras,
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
  let periodo = periodoDoMes(mes);
  if (mes === TODOS_OS_MESES) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("extratos_ofx")
      .select("periodo_inicio, periodo_fim")
      .eq("conta_bancaria_id", contaId);
    periodo = periodoDosExtratos(
      (data ?? []).map((e) => ({ periodoInicio: e.periodo_inicio, periodoFim: e.periodo_fim })),
    );
  }
  if (!periodo) return { erro: "Mês inválido" };

  try {
    // As regras primeiro: pegam movimento importado antes da regra existir.
    const regras = await aplicarRegrasNoServidor(
      contaId,
      mes === TODOS_OS_MESES ? null : `${mes}-01`,
    );
    const { casadas, falhas } = await casarNoServidor(
      contaId,
      periodo.inicio,
      periodo.fim,
    );
    revalidatePath(ROTA);
    return {
      ok: true,
      feitos: casadas,
      falhas: [
        ...regras.ignoradas.map((i) => ({ id: i.transacaoId, erro: `${i.regra}: ${i.erro}` })),
        ...falhas,
      ],
      regras: regras.aplicadas,
    };
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
  /**
   * O que a diferença de até R$ 1,00 é: `financeiro` (juros se o banco saiu a
   * mais, desconto se saiu a menos) ou `custo` (muda o valor do fornecimento,
   * cai no centro de custo). Null quando o valor é exato.
   */
  ajuste: z.enum(["financeiro", "custo"]).nullable(),
  /**
   * A pessoa escolheu um candidato cujo nome não aparece no histórico: o
   * cedente vira apelido bancário do favorecido (Bloco I).
   */
  aprender: z.boolean().optional(),
});

/**
 * Casa um movimento com o que a pessoa escolheu. Conforme o candidato, o banco
 * também muda a conta (paga em outra conta), dá baixa (parcela em aberto) ou
 * ajusta a diferença como financeiro ou custo (`ajuste`), sempre com evento na
 * trilha da parcela.
 */
export async function casar(
  entrada: z.input<typeof casarSchema>,
): Promise<ResultadoAcao> {
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
    p_ajuste: dados.data.ajuste as string,
  });
  if (error) {
    return erroAcao(
      "financeiro.conciliacao.casar",
      error,
      mensagem(error, "Não foi possível casar o movimento"),
    );
  }
  if (dados.data.aprender && dados.data.especie === "parcela") {
    // Aprender é um extra: se falhar, o casamento continua feito.
    const { error: erroApelido } = await supabase.rpc("fn_conciliacao_aprender_apelido", {
      p_transacao_id: dados.data.transacaoId,
    });
    if (erroApelido) logErroServidor("financeiro.conciliacao.aprender_apelido", erroApelido);
  }
  revalidatePath(ROTA);
  return { ok: true };
}

const casarEstornoSchema = z.object({
  transacaoId: idSchema,
  parId: idSchema,
});

/**
 * Casa um movimento com outro do extrato como estorno: o envio e a devolução
 * (PIX rejeitado, TED devolvida). Nenhum dos dois vira lançamento.
 */
export async function casarEstorno(
  entrada: z.input<typeof casarEstornoSchema>,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para conciliar" };
  }
  const dados = casarEstornoSchema.safeParse(entrada);
  if (!dados.success) return { erro: "Dados do estorno inválidos" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_conciliacao_casar_estorno", {
    p_transacao_id: dados.data.transacaoId,
    p_par_id: dados.data.parId,
    p_automatica: false,
  });
  if (error) {
    return erroAcao(
      "financeiro.conciliacao.casar_estorno",
      error,
      mensagem(error, "Não foi possível casar o estorno"),
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
  transacaoIds: z
    .array(idSchema)
    .min(1, "Escolha ao menos um movimento")
    .max(500),
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
      falhas.push({
        id: transacaoId,
        erro: mensagem(error, "Não foi possível lançar"),
      });
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
    const { error } = await supabase.rpc(
      "fn_conciliacao_lancar_transferencia",
      {
        p_transacao_id: transacaoId,
        p_conta_contraparte_id: dados.data.contaContraparteId,
        p_centro_custo_id: dados.data.centroCustoId,
        p_descricao: dados.data.descricao,
      },
    );
    if (error) {
      falhas.push({
        id: transacaoId,
        erro: mensagem(error, "Não foi possível lançar"),
      });
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
  if (!idSchema.safeParse(parcelaId).success)
    return { erro: "Parcela inválida" };
  if (!idSchema.safeParse(contaId).success)
    return { erro: "Escolha a conta certa" };
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
  if (!idSchema.safeParse(parcelaId).success)
    return { erro: "Parcela inválida" };
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

/**
 * Desfaz vários casamentos de uma vez (o "Para conferir" de boletos cujo
 * beneficiário no extrato não é o fornecedor do app, por exemplo). Cada um
 * volta para "faltam no app"; o que falhar não derruba os outros.
 */
export async function desconciliarVarios(
  transacaoIds: string[],
): Promise<ResultadoLote> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para desconciliar transações" };
  }
  const ids = z.array(idSchema).min(1).max(1000).safeParse(transacaoIds);
  if (!ids.success) return { erro: "Escolha ao menos um movimento" };

  const supabase = await createClient();
  const falhas: { id: string; erro: string }[] = [];
  let feitos = 0;
  for (const id of ids.data) {
    const { error } = await supabase.rpc("fn_desconciliar_transacao", {
      p_transacao_id: id,
    });
    if (error) {
      falhas.push({ id, erro: mensagem(error, "Não foi possível desfazer") });
    } else {
      feitos += 1;
    }
  }

  revalidatePath(ROTA);
  return { ok: true, feitos, falhas };
}

const parSchema = z.object({
  transacaoId: idSchema,
  especie: z.enum(["parcela", "transferencia"]),
  alvoId: idSchema,
});

/**
 * Aceita em lote as sugestões seguras que a pessoa revisou (Bloco E). Vai
 * com `p_automatica = false`: é decisão humana, troca a conta ou dá baixa
 * como no casar manual, e nunca ajusta valor.
 */
export async function aceitarSugestoes(
  pares: z.input<typeof parSchema>[],
): Promise<ResultadoLote> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para conciliar" };
  }
  const dados = z.array(parSchema).min(1).max(1000).safeParse(pares);
  if (!dados.success) return { erro: "Escolha ao menos uma sugestão" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_conciliacao_casar_lote", {
    p_pares: dados.data.map((p) => ({
      transacao: p.transacaoId,
      especie: p.especie,
      alvo: p.alvoId,
    })) as unknown as Json,
    p_automatica: false,
  });
  if (error) {
    return erroAcao(
      "financeiro.conciliacao.aceitarSugestoes",
      error,
      mensagem(error, "Não foi possível aceitar as sugestões"),
    );
  }
  const resultado = resultadoLoteSchema.parse(data);
  revalidatePath(ROTA);
  return {
    ok: true,
    feitos: resultado.casadas,
    falhas: resultado.falhas.map((f) => ({ id: f.transacao, erro: f.erro })),
  };
}

/**
 * Fecha o mês da conta (Bloco F). O banco recalcula tudo e recusa se faltar
 * movimento no app, sobrar no app ou o saldo não bater.
 */
export async function fecharMes(
  contaId: string,
  mes: string,
  /** Saldo da subconta no extrato de investimentos no último dia (Bloco K). */
  saldoSubconta: number | null = null,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para fechar o mês" };
  }
  if (!idSchema.safeParse(contaId).success) return { erro: "Conta inválida" };
  const periodo = periodoDoMes(mes);
  if (!periodo) return { erro: "Mês inválido" };

  if (saldoSubconta !== null) {
    if (!Number.isFinite(saldoSubconta)) return { erro: "Saldo da subconta inválido" };
    const supabaseSub = await createClient();
    const { data: sub } = await supabaseSub
      .from("contas_bancarias")
      .select("id")
      .eq("conta_pai_id", contaId)
      .maybeSingle();
    if (sub) {
      const { error: erroAncora } = await supabaseSub.rpc("fn_conciliacao_registrar_ancora", {
        p_conta_id: sub.id,
        p_data: periodo.fim,
        p_saldo: saldoSubconta,
        p_fonte: "extrato_pdf",
        p_observacao: "Informado no fechamento do mês",
      });
      if (erroAncora) {
        return erroAcao(
          "financeiro.conciliacao.fecharMes.subconta",
          erroAncora,
          mensagem(erroAncora, "Não foi possível gravar o saldo da subconta"),
        );
      }
    }
  }

  if (mes < INICIO_DA_CONCILIACAO) {
    return { erro: "A conciliação é exigida a partir de 09/2026: meses anteriores não fecham" };
  }

  // Fechar o mês é a confirmação (Bloco I): os "Confira" do mês, pela mesma
  // regra da tela, são confirmados e ensinam o apelido, tudo ou nada.
  let confira: string[];
  try {
    const painel = await carregarPainel(contaId, periodo.inicio, periodo.fim);
    confira = painel.transacoes.filter(precisaConferir).map((t) => t.id);
  } catch (e) {
    return erroAcao("financeiro.conciliacao.fecharMes", e, "Não foi possível carregar o mês");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_conciliacao_fechar_mes_confirmando", {
    p_conta_id: contaId,
    p_mes: periodo.inicio,
    p_confira_ids: confira,
  });
  if (error) {
    return erroAcao("financeiro.conciliacao.fecharMes", error, mensagem(error, "Não foi possível fechar o mês"));
  }
  revalidatePath(ROTA);
  return { ok: true };
}

/** Reabre um mês fechado, com motivo (fica na auditoria). */
export async function reabrirMes(contaId: string, mes: string, motivo: string): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para reabrir o mês" };
  }
  if (!idSchema.safeParse(contaId).success) return { erro: "Conta inválida" };
  const periodo = periodoDoMes(mes);
  if (!periodo) return { erro: "Mês inválido" };
  const motivoOk = motivoSchema.safeParse(motivo);
  if (!motivoOk.success) return { erro: "Informe o motivo da reabertura" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_conciliacao_reabrir_mes", {
    p_conta_id: contaId,
    p_mes: periodo.inicio,
    p_motivo: motivoOk.data,
  });
  if (error) {
    return erroAcao("financeiro.conciliacao.reabrirMes", error, mensagem(error, "Não foi possível reabrir o mês"));
  }
  revalidatePath(ROTA);
  return { ok: true };
}

/**
 * Exclui uma importação de extrato (Bloco G): pede a ação `excluir` da
 * Conciliação. O banco recusa com movimento conciliado ou mês fechado e
 * guarda cópia no arquivo morto com o motivo.
 */
export async function excluirImportacao(extratoId: string, motivo: string): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "excluir");
  } catch {
    return { erro: "Sem permissão para excluir importações" };
  }
  if (!idSchema.safeParse(extratoId).success) return { erro: "Importação inválida" };
  const motivoOk = motivoSchema.safeParse(motivo);
  if (!motivoOk.success) return { erro: "Informe o motivo da exclusão" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_conciliacao_excluir_extrato", {
    p_extrato_id: extratoId,
    p_motivo: motivoOk.data,
  });
  if (error) {
    return erroAcao(
      "financeiro.conciliacao.excluirImportacao",
      error,
      mensagem(error, "Não foi possível excluir a importação"),
    );
  }
  revalidatePath(ROTA);
  revalidatePath(`${ROTA}/importacoes`);
  return { ok: true };
}

/**
 * Resumo do lançamento para conferir antes de casar (Tiago, 05/10/2026):
 * favorecido, descrição, parcelas, rateio. Lê com a permissão de ver
 * lançamentos, pelo RLS de quem pede.
 */
export async function resumoDoLancamento(
  lancamentoId: string,
): Promise<{ lancamento: LancamentoDetalhe } | { erro: string }> {
  try {
    await exigirPermissao("financeiro.lancamentos", "ver");
  } catch {
    return { erro: "Sem permissão para ver lançamentos" };
  }
  if (!idSchema.safeParse(lancamentoId).success) {
    return { erro: "Lançamento inválido" };
  }
  try {
    const lancamento = await buscarLancamento(lancamentoId);
    if (!lancamento) return { erro: "Lançamento não encontrado" };
    return { lancamento };
  } catch (e) {
    logErroServidor("financeiro.conciliacao.resumo_lancamento", e);
    return { erro: "Não foi possível carregar o lançamento" };
  }
}

const salvarRegraSchema = z.object({
  id: idSchema.nullable(),
  contaBancariaId: idSchema.nullable(),
  nome: z.string().trim().min(1, "Informe o nome da regra").max(120),
  padrao: z.string().trim().min(3, "O texto do histórico precisa ter pelo menos 3 letras").max(200),
  sentido: z.enum(["credito", "debito"]).nullable(),
  acao: z.enum(["transferencia", "lancar"]),
  contaContraparteId: idSchema.nullable(),
  fornecedorId: idSchema.nullable(),
  categoriaId: idSchema.nullable(),
  centroCustoId: idSchema.nullable(),
  automatica: z.boolean(),
  ativa: z.boolean(),
});

export type DadosRegra = z.input<typeof salvarRegraSchema>;

/** Cria ou edita uma regra de conciliação por histórico (Bloco H). */
export async function salvarRegra(
  entrada: DadosRegra,
): Promise<{ ok: true; id: string } | { erro: string }> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para editar regras de conciliação" };
  }
  const dados = salvarRegraSchema.safeParse(entrada);
  if (!dados.success) {
    return { erro: dados.error.issues[0]?.message ?? "Dados da regra inválidos" };
  }
  const { id, ...resto } = dados.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_conciliacao_salvar_regra", {
    p_id: id as string,
    p_dados: resto as unknown as Json,
  });
  if (error) {
    return erroAcao(
      "financeiro.conciliacao.salvar_regra",
      error,
      mensagem(error, "Não foi possível salvar a regra"),
    );
  }
  revalidatePath(ROTA, "layout");
  return { ok: true, id: String(data) };
}

const aplicarRegraSchema = z.object({
  regraId: idSchema,
  transacaoIds: z.array(idSchema).min(1).max(500),
});

/**
 * O "Aplicar" da tela: uma regra (automática ou não) nos movimentos
 * escolhidos. O banco confere de novo se a regra vale para cada um.
 */
export async function aplicarRegra(
  entrada: z.input<typeof aplicarRegraSchema>,
): Promise<ResultadoLote> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para conciliar" };
  }
  const dados = aplicarRegraSchema.safeParse(entrada);
  if (!dados.success) return { erro: "Movimentos inválidos" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_conciliacao_aplicar_regra", {
    p_regra_id: dados.data.regraId,
    p_transacao_ids: dados.data.transacaoIds,
  });
  if (error) {
    return erroAcao(
      "financeiro.conciliacao.aplicar_regra",
      error,
      mensagem(error, "Não foi possível aplicar a regra"),
    );
  }
  const resultado = z
    .object({
      aplicadas: z.number(),
      falhas: z.array(z.object({ transacao: z.string(), erro: z.string() })),
    })
    .parse(data);
  revalidatePath(ROTA);
  return {
    ok: true,
    feitos: resultado.aplicadas,
    falhas: resultado.falhas.map((f) => ({ id: f.transacao, erro: f.erro })),
  };
}

/**
 * "Confirmar" dos Casados (Bloco I): a pessoa conferiu o casamento com selo
 * "Confira". Tira o selo e o cedente vira apelido bancário do favorecido.
 */
export async function confirmarConferencias(
  transacaoIds: string[],
): Promise<{ ok: true; confirmadas: number; aprendidos: number } | { erro: string }> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para conciliar" };
  }
  const ids = z.array(idSchema).min(1).max(1000).safeParse(transacaoIds);
  if (!ids.success) return { erro: "Movimentos inválidos" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_conciliacao_confirmar_conferencia", {
    p_transacao_ids: ids.data,
  });
  if (error) {
    return erroAcao(
      "financeiro.conciliacao.confirmar",
      error,
      mensagem(error, "Não foi possível confirmar"),
    );
  }
  const resultado = z.object({ confirmadas: z.number(), aprendidos: z.number() }).parse(data);
  revalidatePath(ROTA);
  return { ok: true, ...resultado };
}

const parDoGrupoSchema = z.object({
  transacaoId: idSchema,
  alvoId: idSchema,
  nomeBate: z.boolean(),
});

/**
 * "Casar grupo" (Bloco J): N movimentos e N parcelas de mesmo valor e dia,
 * revisados pela pessoa. Os pares de nome batendo vão como manuais; os
 * equivalentes vão como automáticos, para continuarem no filtro "Para
 * conferir" dos Casados (o nome não confere, e alguém pode querer olhar).
 */
export async function casarGrupo(
  pares: z.input<typeof parDoGrupoSchema>[],
): Promise<ResultadoLote> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para conciliar" };
  }
  const dados = z.array(parDoGrupoSchema).min(2).max(500).safeParse(pares);
  if (!dados.success) return { erro: "Grupo inválido" };

  const supabase = await createClient();
  let feitos = 0;
  const falhas: { id: string; erro: string }[] = [];
  for (const automatica of [false, true]) {
    const lote = dados.data.filter((p) => p.nomeBate !== automatica);
    if (lote.length === 0) continue;
    const { data, error } = await supabase.rpc("fn_conciliacao_casar_lote", {
      p_pares: lote.map((p) => ({ transacao: p.transacaoId, especie: "parcela", alvo: p.alvoId })) as unknown as Json,
      p_automatica: automatica,
    });
    if (error) {
      return erroAcao(
        "financeiro.conciliacao.casarGrupo",
        error,
        mensagem(error, "Não foi possível casar o grupo"),
      );
    }
    const resultado = resultadoLoteSchema.parse(data);
    feitos += resultado.casadas;
    falhas.push(...resultado.falhas.map((f) => ({ id: f.transacao, erro: f.erro })));
  }
  revalidatePath(ROTA);
  return { ok: true, feitos, falhas };
}

const ancoraSchema = z.object({
  contaId: idSchema,
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  saldo: z.number().finite(),
  observacao: z.string().trim().max(500).optional(),
});

/**
 * Âncora de saldo (Bloco K): o saldo do extrato em PDF no fim de um dia. O
 * saldo do banco nos outros dias sai dela mais ou menos os movimentos do OFX.
 * A mesma data de novo substitui o valor.
 */
export async function adicionarAncora(
  entrada: z.input<typeof ancoraSchema>,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para conciliar" };
  }
  const dados = ancoraSchema.safeParse(entrada);
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? "Dados inválidos" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_conciliacao_registrar_ancora", {
    p_conta_id: dados.data.contaId,
    p_data: dados.data.data,
    p_saldo: dados.data.saldo,
    p_fonte: "extrato_pdf",
    p_observacao: dados.data.observacao ?? "",
  });
  if (error) {
    return erroAcao(
      "financeiro.conciliacao.ancora",
      error,
      mensagem(error, "Não foi possível gravar a âncora"),
    );
  }
  revalidatePath(ROTA, "layout");
  return { ok: true };
}

/**
 * Apaga uma âncora de saldo. O banco recusa quando o mês dela (ou o mês que
 * ela abre, se for do último dia) está fechado.
 */
export async function excluirAncora(ancoraId: string): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para conciliar" };
  }
  if (!idSchema.safeParse(ancoraId).success) return { erro: "Âncora inválida" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_conciliacao_excluir_ancora", { p_id: ancoraId });
  if (error) {
    return erroAcao(
      "financeiro.conciliacao.excluirAncora",
      error,
      mensagem(error, "Não foi possível excluir a âncora"),
    );
  }
  revalidatePath(ROTA, "layout");
  return { ok: true };
}

const debitoParaDevolucaoSchema = z.object({
  id: z.string(),
  dataMovimento: z.string(),
  valor: z.coerce.number(),
  memo: z.string().nullable(),
  lancamentoNumero: z.string().nullable(),
  descricao: z.string().nullable(),
  origem: z.string(),
  fornecedor: z.string().nullable(),
});

export type DebitoParaDevolucao = z.infer<typeof debitoParaDevolucaoSchema>;

/**
 * Pagamentos que podem ter voltado neste crédito (Bloco L): débitos casados
 * com parcela a pagar da conta, de mesmo valor ou maior, nos 90 dias antes.
 */
export async function debitosParaDevolucao(
  creditoId: string,
): Promise<{ debitos: DebitoParaDevolucao[] } | { erro: string }> {
  try {
    await exigirPermissao(RECURSO, "ver");
  } catch {
    return { erro: "Sem permissão para ver a conciliação" };
  }
  if (!idSchema.safeParse(creditoId).success) return { erro: "Movimento inválido" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_conciliacao_debitos_para_devolucao", {
    p_credito_id: creditoId,
  });
  if (error) {
    return erroAcao(
      "financeiro.conciliacao.debitosParaDevolucao",
      error,
      mensagem(error, "Não foi possível carregar os pagamentos"),
    );
  }
  return { debitos: z.array(debitoParaDevolucaoSchema).parse(data ?? []) };
}

const devolucaoSchema = z.object({
  creditoId: idSchema,
  debitoId: idSchema,
  motivo: z.string().trim().min(3, "Informe o motivo da devolução").max(500),
});

/**
 * "É devolução de um pagamento" (Bloco L). Valor igual: o pagamento volta a
 * aberto e envio e devolução viram estorno. Valor menor: a parcela fica e a
 * parte devolvida vira "Devolução de fornecedor" no centro de custo do
 * lançamento original (reduz custo, não é receita financeira).
 */
export async function devolucaoDeFornecedor(
  entrada: z.input<typeof devolucaoSchema>,
): Promise<{ ok: true; modo: "total" | "parcial" } | { erro: string }> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para conciliar" };
  }
  const dados = devolucaoSchema.safeParse(entrada);
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? "Dados inválidos" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_conciliacao_devolucao_fornecedor", {
    p_credito_id: dados.data.creditoId,
    p_debito_id: dados.data.debitoId,
    p_motivo: dados.data.motivo,
  });
  if (error) {
    return erroAcao(
      "financeiro.conciliacao.devolucao",
      error,
      mensagem(error, "Não foi possível registrar a devolução"),
    );
  }
  const { modo } = z.object({ modo: z.enum(["total", "parcial"]) }).parse(data);
  revalidatePath(ROTA);
  return { ok: true, modo };
}

const compraDoCartaoSchema = z.object({
  parcelaId: z.string(),
  lancamentoId: z.string(),
  lancamentoNumero: z.string().nullable(),
  descricao: z.string().nullable(),
  fornecedor: z.string().nullable(),
  numeroParcela: z.coerce.number(),
  qtdParcelas: z.coerce.number(),
  valor: z.coerce.number(),
  vencimento: z.string(),
  status: z.string(),
  contaNome: z.string().nullable(),
  dataPagamento: z.string().nullable(),
});

export type CompraDoCartao = z.infer<typeof compraDoCartaoSchema>;

/** Compras do cartão que podem estar na fatura paga por este débito. */
export async function comprasDoCartao(
  transacaoId: string,
  cartaoId: string,
): Promise<{ compras: CompraDoCartao[] } | { erro: string }> {
  try {
    await exigirPermissao(RECURSO, "ver");
  } catch {
    return { erro: "Sem permissão para ver a conciliação" };
  }
  if (!idSchema.safeParse(transacaoId).success || !idSchema.safeParse(cartaoId).success) {
    return { erro: "Dados inválidos" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_conciliacao_compras_do_cartao", {
    p_transacao_id: transacaoId,
    p_cartao_id: cartaoId,
  });
  if (error) {
    return erroAcao("financeiro.conciliacao.comprasDoCartao", error, mensagem(error, "Não foi possível carregar as compras"));
  }
  return { compras: z.array(compraDoCartaoSchema).parse(data ?? []) };
}

const faturaSchema = z.object({
  transacaoId: idSchema,
  cartaoId: idSchema,
  parcelaIds: z.array(idSchema).max(500),
  encargos: z
    .object({ valor: z.number().positive(), categoriaId: idSchema, centroCustoId: idSchema })
    .nullable(),
});

/**
 * Casa o débito da fatura com as compras do cartão: as compras ficam pagas
 * na conta e na data do débito, e a diferença (juros, IOF, anuidade) vira
 * "Encargos do cartão".
 */
export async function casarFatura(
  entrada: z.input<typeof faturaSchema>,
): Promise<ResultadoAcao> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para conciliar" };
  }
  const dados = faturaSchema.safeParse(entrada);
  if (!dados.success) return { erro: "Dados da fatura inválidos" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_conciliacao_casar_fatura", {
    p_transacao_id: dados.data.transacaoId,
    p_cartao_id: dados.data.cartaoId,
    p_parcela_ids: dados.data.parcelaIds,
    ...(dados.data.encargos ? { p_encargos: dados.data.encargos as unknown as Json } : {}),
  });
  if (error) {
    return erroAcao("financeiro.conciliacao.casarFatura", error, mensagem(error, "Não foi possível casar a fatura"));
  }
  revalidatePath(ROTA);
  return { ok: true };
}
