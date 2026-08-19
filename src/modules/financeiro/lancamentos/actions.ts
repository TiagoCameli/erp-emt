"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Json } from "@/lib/database.types";
import { erroAcao } from "@/lib/erros";
import { dataHojeISO } from "@/lib/formatadores";
import { idSchema } from "@/lib/id";
import { exigirPermissao } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import {
  lerFiltrosLancamentos,
  parametrosDaQueryString,
} from "@/modules/financeiro/lancamentos/filtros";
import {
  lancamentoSchema,
  type LancamentoInput,
} from "@/modules/financeiro/lancamentos/schemas";
import {
  LIMITE_LOTE,
  type ResumoLote,
} from "@/modules/financeiro/lancamentos/lote";
import { lerLancamentosEmPaginas } from "@/modules/financeiro/lancamentos/leitura-completa";
import {
  montarPlanilhaLancamentos,
  nomeArquivoPlanilhaLancamentos,
} from "@/modules/financeiro/lancamentos/planilha";
import {
  detalharLancamentosParaPlanilha,
  listarLancamentos,
  type LancamentoPlanilha,
} from "@/modules/financeiro/lancamentos/queries";

const RECURSO = "financeiro.lancamentos" as const;
const ROTA = "/financeiro/lancamentos";
/** A outra tela em que um recebível aparece. */
const ROTA_RECEBIMENTOS = "/financeiro/recebimentos";

export type ResultadoCriacao = { ok: true; id: string } | { erro: string };

export type ResultadoExclusao = { ok: true } | { erro: string };

/** Cabeçalho do lançamento no formato que a RPC espera (p_dados). */
function dadosParaRpc(dados: LancamentoInput): Json {
  return {
    tipo: dados.tipo,
    fornecedor_id: dados.fornecedorId ?? null,
    cliente_id: dados.clienteId ?? null,
    numero_documento: dados.numeroDocumento ?? null,
    // A RPC só olha este campo quando o tipo é a_receber. No a pagar a conta é
    // escolhida na revisão, e mandar uma aqui faria o lançamento nascer
    // aprovado (dinheiro) ou quitado (cartão) sem ninguém ter revisado.
    conta_bancaria_id: dados.contaBancariaId ?? null,
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
  /**
   * Recebível também se lança de dentro de Financeiro > Recebimentos, e quem só
   * tem essa aba precisa conseguir. Aceitar os dois recursos aqui é a metade da
   * checagem na Server Action; a outra metade é fn_pode_lancar_tipo no banco,
   * que na EDIÇÃO ainda confere o tipo GRAVADO, e é ela que impede alguém de
   * converter um lançamento a pagar em receita para passar por esta porta.
   */
  const recursoDoTipo =
    dados.tipo === "a_receber"
      ? ([RECURSO, "financeiro.recebimentos"] as const)
      : ([RECURSO] as const);
  let permitido = false;
  for (const recurso of recursoDoTipo) {
    try {
      await exigirPermissao(recurso, acao);
      permitido = true;
      break;
    } catch {
      // Tenta o recurso seguinte; a mensagem de recusa é dada depois do laço.
    }
  }
  if (!permitido) {
    const oQue = dados.tipo === "a_receber" ? "recebimentos" : "lançamentos";
    return {
      erro:
        id === null
          ? `Sem permissão para criar ${oQue}`
          : `Sem permissão para editar ${oQue}`,
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
  // Recebível aparece nas duas telas, e a de Recebimentos é justamente de onde
  // ele costuma ser lançado: sem isto a lista de lá ficaria com a página em
  // cache e o recebimento novo só apareceria no próximo refresh cheio.
  if (validado.data.tipo === "a_receber") {
    revalidatePath(ROTA_RECEBIMENTOS);
  }
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
 * Troca as parcelas EM ABERTO de um lançamento, preservando as pagas e as
 * aprovadas.
 *
 * A lista pode vir VAZIA quando o lançamento tem parcela paga: nesse caso ele
 * fica valendo só o que já foi pago. Sem nenhuma parcela paga, o banco recusa a
 * lista vazia — lançamento sem parcela não entra na fila de pagamento.
 *
 * O resto é o banco que valida: valor maior que zero, data em toda parcela,
 * parcela conciliada com o extrato, e a regra do total (em lançamento manual o
 * valor passa a ser a soma das parcelas; em lançamento de origem a soma tem que
 * fechar com o valor, porque o cabeçalho pertence à origem).
 */
export async function definirParcelasLancamento(
  lancamentoId: string,
  parcelas: ParcelaDefinidaInput[],
  /**
   * Por que as parcelas mudaram. O banco EXIGE quando o lançamento já tinha
   * parcela (aí é alteração de algo combinado), e ignora quando o lançamento
   * nasceu sem nenhuma (aí é a definição inicial, não há o que explicar).
   * Quem decide é o banco, que sabe quantas parcelas existem; aqui só repassa.
   */
  motivo?: string,
): Promise<ResultadoExclusao> {
  await exigirPermissao(RECURSO, "editar");

  const idValido = idSchema.safeParse(lancamentoId);
  if (!idValido.success) return { erro: "Lançamento inválido" };

  // Sem `.min(1)`: quem decide se a lista pode estar vazia é o banco, que sabe se
  // existe parcela paga para sobrar. Barrar aqui tiraria do Tiago a única forma de
  // deixar um parcelamento valendo só o que já foi pago.
  const validado = z.array(parcelaDefinidaSchema).safeParse(parcelas);
  if (!validado.success) {
    return {
      erro: validado.error.issues[0]?.message ?? "Parcela inválida",
    };
  }

  const supabase = await createClient();
  const motivoLimpo = motivo?.trim() ?? "";
  const { error } = await supabase.rpc("fn_definir_parcelas_lancamento", {
    p_lanc_id: idValido.data,
    p_parcelas: validado.data.map((parcela) => ({
      data_vencimento: parcela.dataVencimento,
      valor: parcela.valor,
    })),
    p_motivo: motivoLimpo === "" ? undefined : motivoLimpo,
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
// Exportar a listagem para Excel
// ---------------------------------------------------------------------------

export type ResultadoPlanilha =
  | { ok: true; base64: string; nomeArquivo: string }
  | { erro: string };

/**
 * Freio de disparada, não regra de negócio.
 *
 * A exportação leva TUDO que está no filtro, e sem filtro nenhum leva a base
 * inteira (hoje da ordem de 8 mil lançamentos, com a carga do Mais Controle
 * dentro). O número existe só porque o arquivo é montado inteiro na memória do
 * servidor e volta em base64 pela resposta da Server Action: sem teto algum, um
 * dia a exportação viraria um erro genérico de memória em vez de um aviso.
 *
 * 25.000 é umas três vezes a base de hoje, então não é para ele encostar em uso
 * normal. Se encostar, a mensagem diz o número real e o que fazer, em vez de
 * cortar a planilha em silêncio.
 */
const LIMITE_PLANILHA = 25_000;

/** Teto da query string aceita, para ninguém mandar uma URL de 1 MB. */
const TETO_QUERY = 4000;

/**
 * Gera a planilha (.xlsx) dos lançamentos que estão no filtro da tela e devolve
 * em base64 para o navegador baixar.
 *
 * Recebe a QUERY STRING da listagem, não uma cópia dos filtros: a página e a
 * planilha passam pelo mesmo `lerFiltrosLancamentos`, então o que sai no arquivo
 * é exatamente o conjunto que está na tela. Um segundo lugar montando filtro
 * divergiria no primeiro filtro novo, e a planilha começaria a contradizer a
 * lista sem ninguém perceber.
 *
 * Exporta o conjunto FILTRADO inteiro, e não a página aberta: quem exporta quer
 * fechar o mês, não as 25 linhas que couberam na tela. A paginação da tela não
 * tem nada a ver com o recorte do relatório. Sem filtro nenhum na tela, sai a
 * base inteira.
 *
 * A leitura vai em páginas de mil, e não numa requisição só: o PostgREST corta a
 * resposta num teto invisível, então pedir tudo de uma vez pode devolver menos e
 * a planilha sairia faltando lançamento sem ninguém perceber (é o mesmo motivo do
 * `lerEmPaginas` nas consultas de filtro). No fim a contagem lida é conferida
 * contra o `count` do banco: se não fechar, a resposta é erro, não um arquivo
 * pela metade.
 */
export async function gerarPlanilhaLancamentos(
  query: string,
): Promise<ResultadoPlanilha> {
  // Exportar é ler: mesma permissão que abre a tela. Sem ela, nem a lista existe.
  try {
    await exigirPermissao(RECURSO, "ver");
  } catch {
    return { erro: "Sem permissão para exportar lançamentos" };
  }

  if (typeof query !== "string" || query.length > TETO_QUERY) {
    return { erro: "Filtro inválido para exportar" };
  }

  const { filtros } = lerFiltrosLancamentos(parametrosDaQueryString(query));

  let itens: LancamentoPlanilha[];
  let total: number;
  try {
    const leitura = await lerLancamentosEmPaginas<LancamentoPlanilha>(
      // Enriquece PÁGINA POR PÁGINA, não a exportação toda de uma vez: o teto é
      // 25.000 lançamentos, e um `in` com 25 mil uuids é uma query que o Postgres
      // aceita mas ninguém quer depurar. Aqui o `in` tem no máximo o tamanho da
      // página, e cada uma paga uma consulta a mais para trazer observações,
      // rateio, forma, condição, conta e o número da OC de origem.
      async (pagina, tamanho) => {
        const lote = await listarLancamentos({ ...filtros, pagina, tamanho });
        // Acima do teto a leitura para na primeira página: não vale enriquecer
        // uma página que vai ser descartada.
        if (lote.total > LIMITE_PLANILHA)
          return { itens: [], total: lote.total };
        const detalhes = await detalharLancamentosParaPlanilha(
          lote.itens.map((item) => item.id),
        );
        return {
          total: lote.total,
          itens: lote.itens.map((item) => ({
            ...item,
            // Lançamento sem detalhe é lançamento que saiu da lista entre as duas
            // consultas. Cai em branco em vez de derrubar a exportação: a checagem
            // de `itens.length < total` mais abaixo é quem recusa leitura parcial.
            ...(detalhes.get(item.id) ?? {
              observacoes: null,
              formaPagamentoNome: null,
              condicaoPagamentoDescricao: null,
              contaBancariaNome: null,
              origemNumero: null,
              rateios: [],
            }),
          })),
        };
      },
      LIMITE_PLANILHA,
    );
    itens = leitura.itens;
    total = leitura.total;
  } catch (erro) {
    return erroAcao(
      "financeiro.lancamentos.gerarPlanilhaLancamentos",
      erro,
      "Não foi possível ler os lançamentos para exportar. Tente novamente",
    );
  }

  if (total === 0) {
    return { erro: "O filtro atual não tem nenhum lançamento para exportar" };
  }
  if (total > LIMITE_PLANILHA) {
    return {
      erro: `O filtro atual tem ${total.toLocaleString("pt-BR")} lançamentos, acima do limite de ${LIMITE_PLANILHA.toLocaleString("pt-BR")} por arquivo. Filtre por mês de referência e exporte em partes`,
    };
  }
  // Leu menos do que o banco disse que existe: alguém mexeu na lista no meio da
  // leitura. Melhor recusar e pedir de novo do que entregar planilha incompleta
  // com cara de completa, que é o tipo de erro que ninguém confere.
  if (itens.length < total) {
    return erroAcao(
      "financeiro.lancamentos.gerarPlanilhaLancamentos",
      new Error(`leitura incompleta: ${itens.length} de ${total}`),
      `Li ${itens.length.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")} lançamentos porque a lista mudou durante a exportação. Exporte de novo`,
    );
  }

  const workbook = montarPlanilhaLancamentos(itens);
  workbook.created = new Date();
  const conteudo = await workbook.xlsx.writeBuffer();

  return {
    ok: true,
    base64: Buffer.from(conteudo).toString("base64"),
    nomeArquivo: nomeArquivoPlanilhaLancamentos(dataHojeISO()),
  };
}
