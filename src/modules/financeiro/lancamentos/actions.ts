"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Json } from "@/lib/database.types";
import { erroAcao } from "@/lib/erros";
import { idSchema } from "@/lib/id";
import { lerEValidarXlsx } from "@/lib/importacao";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  COLUNAS_LANCAMENTO,
  type LinhaLancamento,
} from "@/modules/financeiro/lancamentos/importacao";
import {
  lancamentoSchema,
  type LancamentoInput,
} from "@/modules/financeiro/lancamentos/schemas";
import {
  LIMITE_LOTE,
  type ResumoLote,
} from "@/modules/financeiro/lancamentos/lote";

const RECURSO = "financeiro.lancamentos" as const;
const ROTA = "/financeiro/lancamentos";

export type ResultadoCriacao = { ok: true; id: string } | { erro: string };

export type ResultadoExclusao = { ok: true } | { erro: string };

/** Cabeçalho do lançamento no formato que a RPC espera (p_dados). */
function dadosParaRpc(dados: LancamentoInput): Json {
  return {
    tipo: dados.tipo,
    fornecedor_id: dados.fornecedorId ?? null,
    categoria_id: dados.categoriaId ?? null,
    forma_pagamento_id: dados.formaPagamentoId ?? null,
    condicao_pagamento_id: dados.condicaoPagamentoId ?? null,
    descricao: dados.descricao,
    valor: dados.valor,
    data_compra: dados.dataCompra,
    mes_competencia: dados.mesCompetencia,
    data_vencimento: dados.dataVencimento ?? null,
    observacoes: dados.observacoes ?? null,
  };
}

/**
 * Parcelas no formato que a RPC espera (p_parcelas).
 *
 * Sem numero_parcela: o número é do banco. fn_salvar_lancamento renumera por
 * vencimento (parcela 1 é a de vencimento mais próximo, desempate por valor),
 * o mesmo critério de fn_salvar_parcelas_oc e de fn_definir_parcelas_lancamento.
 * Mandar a posição da linha do formulário só faria alguém achar que a ordem em
 * que as parcelas foram digitadas decide a numeração, e não decide.
 */
function parcelasParaRpc(dados: LancamentoInput): Json {
  return dados.parcelas.map((parcela) => ({
    valor: parcela.valor,
    data_vencimento: parcela.dataVencimento ?? null,
  }));
}

/** Rateios no formato que a RPC espera (p_rateios). */
function rateiosParaRpc(dados: LancamentoInput): Json {
  return dados.rateios.map((rateio) => ({
    centro_custo_id: rateio.centroCustoId,
    valor: rateio.valor,
  }));
}

/**
 * Cria (id null) ou edita (id) um lançamento manual com suas parcelas e
 * rateios via fn_salvar_lancamento. A RPC valida soma das parcelas = valor e
 * soma do rateio = valor; o erro do banco é repassado direto ao toast.
 *
 * Lançamentos de origem diferente de 'manual' (ex: 'oc', vindos de compras) são
 * somente-leitura aqui: a barreira é tripla (UI esconde o botão, esta action
 * recusa antes de chamar a RPC, e a própria RPC levanta exceção). Editar um
 * lançamento de OC se faz na origem (Compras).
 */
export async function salvarLancamento(
  id: string | null,
  dados: LancamentoInput,
): Promise<ResultadoCriacao> {
  const acao = id === null ? "criar" : "editar";
  try {
    await exigirPermissao(RECURSO, acao);
  } catch {
    return {
      erro:
        id === null
          ? "Sem permissão para criar lançamentos"
          : "Sem permissão para editar lançamentos",
    };
  }

  const supabase = await createClient();

  if (id !== null) {
    const idValido = idSchema.safeParse(id);
    if (!idValido.success) return { erro: "Lançamento inválido" };

    // Só lançamento manual se edita aqui. OC e outras origens editam-se na
    // origem; bloqueamos antes da RPC (que também recusa).
    const { data: existente, error: erroExistente } = await supabase
      .from("lancamentos")
      .select("origem")
      .eq("id", idValido.data)
      .maybeSingle();
    if (erroExistente || !existente) {
      return erroAcao(
        "financeiro.lancamentos.salvarLancamento",
        erroExistente,
        "Lançamento não encontrado",
      );
    }
    if (existente.origem !== "manual") {
      return {
        erro: `Lançamento de origem ${existente.origem} é somente-leitura aqui. Edite na origem.`,
      };
    }
  }

  const validado = lancamentoSchema.safeParse(dados);
  if (!validado.success) {
    return { erro: validado.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const { data, error } = await supabase.rpc("fn_salvar_lancamento", {
    p_id: id as string,
    p_dados: dadosParaRpc(validado.data),
    p_parcelas: parcelasParaRpc(validado.data),
    p_rateios: rateiosParaRpc(validado.data),
  });

  if (error || !data) {
    return erroAcao(
      "financeiro.lancamentos.salvarLancamento",
      error,
      error?.message || "Não foi possível salvar o lançamento",
    );
  }

  revalidatePath(ROTA);
  return { ok: true, id: data };
}

/**
 * Exclui um lançamento com suas parcelas e rateios via fn_excluir_lancamento.
 * A RPC checa a permissão, recusa lançamentos de origem 'oc' ou 'diaria'
 * (que devem ser excluídos pela origem) e lançamentos com parcela paga ou
 * conciliada, sempre com uma mensagem amigável que repassamos direto ao toast.
 */
export async function excluirLancamento(
  id: string,
): Promise<ResultadoExclusao> {
  try {
    await exigirPermissao(RECURSO, "excluir");
  } catch {
    return { erro: "Sem permissão para excluir lançamentos" };
  }

  const idValido = idSchema.safeParse(id);
  if (!idValido.success) return { erro: "Lançamento inválido" };

  const supabase = await createClient();

  const { error } = await supabase.rpc("fn_excluir_lancamento", {
    p_id: idValido.data,
  });

  if (error) {
    return erroAcao(
      "financeiro.lancamentos.excluirLancamento",
      error,
      error.message || "Não foi possível excluir o lançamento. Tente novamente",
    );
  }

  revalidatePath(ROTA);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Definir parcelas de um lançamento que nasceu sem elas
// ---------------------------------------------------------------------------
// É o outro lado das parcelas manuais da OC: quando a ordem não define
// parcelas, o lançamento nasce sem nenhuma e alguém precisa definir aqui.
// fn_salvar_lancamento recusa lançamento de origem <> 'manual' de propósito (o
// cabeçalho pertence à origem), então isso passa por uma função dedicada que só
// mexe nas parcelas.

/** Parcela definida na tela do lançamento. */
const parcelaDefinidaSchema = z.object({
  dataVencimento: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Informe o vencimento da parcela" }),
  valor: z
    .number({ error: "Valor da parcela inválido" })
    .positive({ error: "O valor da parcela precisa ser maior que zero" }),
});

export type ParcelaDefinidaInput = z.infer<typeof parcelaDefinidaSchema>;

/**
 * Troca as parcelas de um lançamento. A função do banco valida o resto: soma
 * igual ao valor do lançamento e nenhuma parcela já aprovada ou paga.
 */
export async function definirParcelasLancamento(
  lancamentoId: string,
  parcelas: ParcelaDefinidaInput[],
): Promise<ResultadoExclusao> {
  await exigirPermissao(RECURSO, "editar");

  const idValido = idSchema.safeParse(lancamentoId);
  if (!idValido.success) return { erro: "Lançamento inválido" };

  const validado = z.array(parcelaDefinidaSchema).min(1).safeParse(parcelas);
  if (!validado.success) {
    return {
      erro: validado.error.issues[0]?.message ?? "Informe ao menos uma parcela",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_definir_parcelas_lancamento", {
    p_lanc_id: idValido.data,
    p_parcelas: validado.data.map((parcela) => ({
      data_vencimento: parcela.dataVencimento,
      valor: parcela.valor,
    })),
  });

  if (error) {
    return erroAcao(
      "financeiro.lancamentos.definirParcelas",
      error,
      error.message ?? "Não foi possível salvar as parcelas",
    );
  }

  revalidatePath(ROTA);
  revalidatePath(`${ROTA}/${idValido.data}`);
  return { ok: true };
}

/** Parcelas sugeridas pela condição de pagamento, ou o motivo de não dar. */
export type ResultadoParcelasSugeridas =
  | { parcelas: { dataVencimento: string; valor: number }[] }
  | { erro: string };

/**
 * Divide um valor pela condição de pagamento escolhida, sem o lançamento
 * precisar existir. É o que o FORMULÁRIO usa: o "Gerar pela condição" roda com
 * o valor e a data da compra que já estão na tela, antes de salvar, igual ao
 * que a OC faz no formulário dela.
 *
 * A divisão inteira (percentual por parcela, dias de vencimento, ajuste do
 * centavo na última) é a função do banco, única implementação do cálculo.
 *
 * Permissão de 'ver': nada é gravado aqui, é só a sugestão. Quem não pode ver
 * lançamento também não vê a divisão; gravar as parcelas ainda passa por
 * criar/editar em salvarLancamento.
 */
export async function parcelasDaCondicaoLancamento(
  condicaoId: string,
  valor: number,
  dataBase: string,
): Promise<ResultadoParcelasSugeridas> {
  try {
    await exigirPermissao(RECURSO, "ver");
  } catch {
    return { erro: "Sem permissão para ver lançamentos" };
  }

  const condicaoValida = idSchema.safeParse(condicaoId);
  if (!condicaoValida.success) {
    return {
      erro: "Escolha a condição de pagamento antes de gerar as parcelas",
    };
  }
  if (!Number.isFinite(valor) || valor <= 0) {
    return { erro: "Informe o valor do lançamento antes de gerar as parcelas" };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataBase)) {
    return { erro: "Informe a data da compra antes de gerar as parcelas" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_parcelas_da_condicao", {
    p_condicao_id: condicaoValida.data,
    p_valor: valor,
    // A base das parcelas é a data da COMPRA, não a data de sistema.
    p_data_base: dataBase,
  });

  if (error) {
    return { erro: error.message ?? "Não foi possível gerar as parcelas" };
  }

  return {
    parcelas: (data ?? []).map((parcela) => ({
      dataVencimento: parcela.data_vencimento,
      valor: parcela.valor,
    })),
  };
}

/**
 * Sugestão de parcelas para um lançamento que já existe (o "Gerar pela
 * condição" do detalhe). De onde sai a condição depende da origem:
 *
 * - origem 'oc': a condição é a da ordem de origem. Ela pertence ao documento
 *   de origem e não é copiada para o lançamento.
 * - avulso: a condição gravada no próprio lançamento.
 *
 * Data base: a data da compra, não a data de sistema.
 */
export async function sugerirParcelasDoLancamento(
  lancamentoId: string,
): Promise<ResultadoParcelasSugeridas> {
  try {
    await exigirPermissao(RECURSO, "ver");
  } catch {
    return { erro: "Sem permissão para ver lançamentos" };
  }

  const idValido = idSchema.safeParse(lancamentoId);
  if (!idValido.success) return { erro: "Lançamento inválido" };

  const supabase = await createClient();
  const { data: lancamento } = await supabase
    .from("lancamentos")
    .select("valor, data_compra, origem, origem_id, condicao_pagamento_id")
    .eq("id", idValido.data)
    .maybeSingle();

  if (!lancamento) return { erro: "Lançamento não encontrado" };

  const veioDeOrdem = lancamento.origem === "oc" && lancamento.origem_id;
  let condicaoId: string | null = lancamento.condicao_pagamento_id;
  if (veioDeOrdem) {
    const { data: ordem } = await supabase
      .from("ordens_compra")
      .select("condicao_pagamento_id")
      .eq("id", lancamento.origem_id as string)
      .maybeSingle();
    condicaoId = ordem?.condicao_pagamento_id ?? null;
  }

  // Sem condição em nenhum dos dois lugares a mensagem diz onde resolver, senão
  // o usuário fica clicando num botão que nunca funciona.
  if (!condicaoId) {
    return {
      erro: veioDeOrdem
        ? "A ordem de origem não tem condição de pagamento. Defina a condição na ordem de compra e gere as parcelas de novo."
        : "Este lançamento não tem condição de pagamento. Edite o lançamento, escolha a condição de pagamento e salve para gerar as parcelas por ela.",
    };
  }

  return parcelasDaCondicaoLancamento(
    condicaoId,
    lancamento.valor,
    lancamento.data_compra,
  );
}

/**
 * Devolve para a fila de aprovação uma parcela que estava em revisão.
 *
 * Fica com quem edita o lançamento, não com quem aprova: é quem corrigiu o que
 * foi apontado que reenvia. Sem isso, mandar para revisão seria beco sem saída.
 * O motivo do pedido e este reenvio ficam na trilha da parcela (parcela_eventos).
 */
export async function reenviarParcela(
  parcelaId: string,
  observacao?: string,
): Promise<ResultadoExclusao> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para reenviar pagamentos para aprovação" };
  }

  const idValido = idSchema.safeParse(parcelaId);
  if (!idValido.success) return { erro: "Parcela inválida" };

  const texto = (observacao ?? "").trim();

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_reenviar_parcela", {
    p_parcela_id: idValido.data,
    p_observacao: texto === "" ? undefined : texto,
  });

  if (error) {
    return erroAcao(
      "financeiro.lancamentos.reenviarParcela",
      error,
      error.message || "Não foi possível reenviar para aprovação",
    );
  }

  revalidatePath(ROTA);
  revalidatePath("/financeiro/aprovacao-pagamentos");
  return { ok: true };
}

/**
 * Define a conta bancária do lançamento, propagando para as parcelas não pagas.
 *
 * É o passo de revisão antes da aprovação: parcela sem conta não entra na fila e
 * o banco recusa aprovar (fn_aprovar_parcela). Escolher a conta aqui é o que
 * libera o pagamento para ser aprovado.
 */
export async function definirContaLancamento(
  lancamentoId: string,
  contaId: string,
): Promise<ResultadoExclusao> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para editar lançamentos" };
  }

  const idValido = idSchema.safeParse(lancamentoId);
  if (!idValido.success) return { erro: "Lançamento inválido" };

  const contaValida = idSchema.safeParse(contaId);
  if (!contaValida.success) return { erro: "Selecione a conta bancária" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_definir_conta_lancamento", {
    p_lanc_id: idValido.data,
    p_conta_id: contaValida.data,
  });

  if (error) {
    return erroAcao(
      "financeiro.lancamentos.definirContaLancamento",
      error,
      error.message || "Não foi possível definir a conta bancária",
    );
  }

  revalidatePath(ROTA);
  revalidatePath("/financeiro/aprovacao-pagamentos");
  return { ok: true };
}

/**
 * Define a mesma conta bancária em vários lançamentos, numa transação.
 *
 * Recebe IDS e não o filtro, de propósito: o que o usuário viu na tela é o que
 * muda, e lançamento criado entre o clique e a execução não entra de carona. O
 * preço é a lista poder envelhecer, e a resposta então diz quantos não foram
 * encontrados em vez de fingir sucesso.
 *
 * Só PREENCHE VAZIO: quem já tem conta é pulado e contado. A trava de verdade
 * está no `where` da função do banco (`conta_bancaria_id is null`); aqui é
 * validação de entrada e tradução do resumo.
 */
export async function definirContaLancamentosLote(
  ids: string[],
  contaId: string,
): Promise<{ ok: true; resumo: ResumoLote } | { erro: string }> {
  try {
    await exigirPermissao(RECURSO, "editar");
  } catch {
    return { erro: "Sem permissão para editar lançamentos" };
  }

  if (!Array.isArray(ids) || ids.length === 0) {
    return { erro: "Selecione ao menos um lançamento" };
  }

  // Deduplica antes de contar: id repetido não pode consumir o teto nem inflar o
  // número que aparece para o usuário.
  const unicos = [...new Set(ids)];
  if (unicos.length > LIMITE_LOTE) {
    return {
      erro: `Selecione no máximo ${LIMITE_LOTE} lançamentos por vez (você selecionou ${unicos.length})`,
    };
  }
  if (unicos.some((id) => !idSchema.safeParse(id).success)) {
    return { erro: "Seleção inválida" };
  }

  const contaValida = idSchema.safeParse(contaId);
  if (!contaValida.success) return { erro: "Selecione a conta bancária" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "fn_definir_conta_lancamentos_lote",
    { p_lanc_ids: unicos, p_conta_id: contaValida.data },
  );

  if (error) {
    return erroAcao(
      "financeiro.lancamentos.definirContaLancamentosLote",
      error,
      error.message || "Não foi possível definir a conta bancária",
    );
  }

  // O jsonb do banco vem em snake_case. Traduzido UMA vez, aqui: daqui para a
  // tela o contrato é o ResumoLote em camelCase.
  const bruto = (data ?? {}) as Record<string, number>;
  revalidatePath(ROTA);
  revalidatePath("/financeiro/aprovacao-pagamentos");
  return {
    ok: true,
    resumo: {
      definidos: bruto.definidos ?? 0,
      puladosComConta: bruto.pulados_com_conta ?? 0,
      puladosSemParcelaPendente: bruto.pulados_sem_parcela_pendente ?? 0,
      naoEncontrados: bruto.nao_encontrados ?? 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Importação por planilha
// ---------------------------------------------------------------------------

function arquivoDoFormData(formData: FormData): File {
  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File)) throw new Error("Nenhum arquivo enviado");
  return arquivo;
}

/** Resumo da prévia de importação, conforme o contrato do ImportDialog. */
export interface ResumoImportacao {
  validas: number;
  invalidas: { linha: number; erros: string[] }[];
  totalLinhas: number;
}

/** Valida a planilha de lançamentos e devolve o resumo para a prévia. */
export async function validarImportLancamentos(
  formData: FormData,
): Promise<ResumoImportacao> {
  await exigirPermissao(RECURSO, "criar");

  const arquivo = arquivoDoFormData(formData);
  const buffer = Buffer.from(await arquivo.arrayBuffer());
  const resultado = await lerEValidarXlsx<LinhaLancamento>(
    buffer,
    COLUNAS_LANCAMENTO,
  );

  return {
    validas: resultado.validas.length,
    invalidas: resultado.invalidas.map((linha) => ({
      linha: linha.linha,
      erros: linha.erros,
    })),
    totalLinhas: resultado.totalLinhas,
  };
}

/**
 * Importa a planilha de lançamentos.
 *
 * A validação de formato é aqui (colunas, data, valor); a de negócio é toda no
 * banco, em fn_importar_lancamentos, que resolve fornecedor, categoria, conta e
 * centro de custo e **só grava se nenhuma linha tiver problema**. Por isso o
 * lote inteiro vai numa chamada: a atomicidade é o ponto, não a performance.
 *
 * Linha com data de pagamento entra já aprovada e paga, o que faz esta mesma
 * planilha carregar histórico financeiro já fechado.
 */
export async function importarLancamentos(
  formData: FormData,
): Promise<{ importadas: number } | { erro: string }> {
  try {
    await exigirPermissao(RECURSO, "criar");
  } catch {
    return { erro: "Sem permissão para importar lançamentos" };
  }

  let buffer: Buffer;
  try {
    const arquivo = arquivoDoFormData(formData);
    buffer = Buffer.from(await arquivo.arrayBuffer());
  } catch (e) {
    return erroAcao(
      "financeiro.lancamentos.importar",
      e,
      "Nenhum arquivo enviado",
    );
  }

  const resultado = await lerEValidarXlsx<LinhaLancamento>(
    buffer,
    COLUNAS_LANCAMENTO,
  );

  if (resultado.invalidas.length > 0) {
    return {
      erro: `${resultado.invalidas.length} linha(s) com problema de formato. Corrija na planilha e importe de novo. Nada foi gravado.`,
    };
  }
  if (resultado.validas.length === 0) {
    return { erro: "Nenhuma linha válida para importar" };
  }

  const linhas = resultado.validas.map((item) => ({
    linha: item.linha,
    tipo: item.dados.tipo,
    valor: item.dados.valor,
    fornecedor: item.dados.fornecedor,
    documento_fornecedor: item.dados.documentoFornecedor,
    descricao: item.dados.descricao,
    categoria: item.dados.categoria,
    centro_custo: item.dados.centroCusto,
    forma_pagamento: item.dados.formaPagamento,
    conta: item.dados.conta,
    data_lancamento: item.dados.dataLancamento,
    competencia: item.dados.competencia,
    vencimentos: item.dados.vencimentos,
    pagamentos: item.dados.pagamentos,
    numero_documento: item.dados.numeroDocumento,
    ordem_compra: item.dados.ordemCompra,
    plano_contas: item.dados.planoContas,
    quem_paga: item.dados.quemPaga,
    observacoes: item.dados.observacoes,
  }));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_importar_lancamentos", {
    p_linhas: linhas as unknown as Json,
  });

  if (error) {
    return erroAcao(
      "financeiro.lancamentos.importar",
      error,
      error.message || "Não foi possível importar os lançamentos",
    );
  }

  const retorno = (data ?? {}) as {
    ok?: boolean;
    criados?: number;
    mensagem?: string;
    erros?: { linha: number; erro: string }[];
  };

  if (retorno.ok === false) {
    // O banco recusou o lote inteiro. Mostramos as primeiras linhas com o
    // motivo exato: é o que a pessoa precisa para corrigir a planilha.
    const erros = retorno.erros ?? [];
    const primeiras = erros
      .slice(0, 5)
      .map((e) => `linha ${e.linha}: ${e.erro}`)
      .join(" | ");
    const resto = erros.length - 5;
    return {
      erro: `${retorno.mensagem ?? "Importação recusada"} ${primeiras}${
        resto > 0 ? ` | e mais ${resto}` : ""
      }`,
    };
  }

  revalidatePath(ROTA);
  revalidatePath("/financeiro/aprovacao-pagamentos");
  return { importadas: retorno.criados ?? 0 };
}
