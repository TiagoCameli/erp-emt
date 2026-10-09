import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { DesvioDoFechamento } from "@/modules/financeiro/conciliacao/desvios";
import type { RegraConciliacao } from "@/modules/financeiro/conciliacao/regras";
import {
  ROTULO_BANCO,
  type BancoConta,
} from "@/modules/financeiro/_shared/formato";
import {
  importacoesSchema,
  type Importacao,
} from "@/modules/financeiro/conciliacao/importacoes";
import {
  painelSchema,
  type MesDaConta,
  type PainelConciliacao,
} from "@/modules/financeiro/conciliacao/painel";

/** Linha da lista de extratos importados. */
export interface ExtratoLista {
  id: string;
  contaBancariaId: string;
  contaBancariaNome: string;
  nomeArquivo: string | null;
  periodoInicio: string | null;
  periodoFim: string | null;
  importadoEm: string;
  qtdTransacoes: number;
  qtdConciliadas: number;
}

/** Conta bancária para o seletor e para trocar conta / transferir. */
export interface ContaBancariaOpcao {
  id: string;
  nome: string;
  banco: BancoConta;
  bancoRotulo: string;
  ativo: boolean;
  /** Número da conta como cadastrado ("102.124-9"); confere com o OFX. */
  numero: string | null;
  tipo: string;
  /** Conta-mãe da subconta de investimentos. */
  contaPaiId: string | null;
}

/** Resumo de uma conta na escolha "qual conta vou conciliar". */
export interface ResumoConta {
  contaId: string;
  qtdExtratos: number;
  ultimoMes: string | null;
  qtdPendentes: number;
  /** Os três últimos meses com extrato, do mais recente ao mais antigo. */
  meses: MesDaConta[];
}

/** Tipo bruto de banco do Postgres normalizado para o union conhecido. */
function bancoConhecido(banco: string): BancoConta {
  return banco === "caixa" || banco === "bb" || banco === "sicredi"
    ? banco
    : "outro";
}

/**
 * Lista os extratos OFX importados, com a conta, o período e a contagem de
 * transações e conciliadas. Mais recentes (por importação) primeiro.
 */
export async function listarExtratos(): Promise<ExtratoLista[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("extratos_ofx")
    .select(
      "id, conta_bancaria_id, nome_arquivo, periodo_inicio, periodo_fim, importado_em, contas_bancarias(nome), extrato_transacoes(conciliada)",
    )
    .order("importado_em", { ascending: false });

  if (error) {
    throw new Error("Não foi possível carregar os extratos importados");
  }

  return (data ?? []).map((extrato) => {
    const transacoes = extrato.extrato_transacoes ?? [];
    return {
      id: extrato.id,
      contaBancariaId: extrato.conta_bancaria_id,
      contaBancariaNome: extrato.contas_bancarias?.nome ?? "-",
      nomeArquivo: extrato.nome_arquivo,
      periodoInicio: extrato.periodo_inicio,
      periodoFim: extrato.periodo_fim,
      importadoEm: extrato.importado_em,
      qtdTransacoes: transacoes.length,
      qtdConciliadas: transacoes.filter((t) => t.conciliada).length,
    };
  });
}

/**
 * Meses ("YYYY-MM") que os extratos importados de uma conta cobrem, do mais
 * recente para o mais antigo. Um extrato que atravessa a virada (o BB já
 * mandou de 30/12 a 31/01) conta nos dois meses.
 */
export function mesesDosExtratos(
  extratos: readonly ExtratoLista[],
  contaId: string,
): string[] {
  const meses = new Set<string>();
  for (const extrato of extratos) {
    if (extrato.contaBancariaId !== contaId) continue;
    if (!extrato.periodoInicio || !extrato.periodoFim) continue;
    let [ano, mes] = extrato.periodoInicio.slice(0, 7).split("-").map(Number);
    const fim = extrato.periodoFim.slice(0, 7);
    for (let guarda = 0; guarda < 36; guarda += 1) {
      const atual = `${ano}-${String(mes).padStart(2, "0")}`;
      meses.add(atual);
      if (atual >= fim) break;
      mes += 1;
      if (mes > 12) {
        mes = 1;
        ano += 1;
      }
    }
  }
  return [...meses].sort().reverse();
}

/** Contas bancárias ativas, em ordem alfabética. */
export async function listarContasBancarias(): Promise<ContaBancariaOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("contas_bancarias")
    .select("id, nome, banco, ativo, conta, tipo, conta_pai_id")
    .eq("ativo", true)
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar as contas bancárias");
  }

  return (data ?? []).map((conta) => {
    const banco = bancoConhecido(conta.banco);
    return {
      id: conta.id,
      nome: conta.nome,
      banco,
      bancoRotulo: ROTULO_BANCO[banco],
      ativo: conta.ativo,
      numero: conta.conta,
      tipo: conta.tipo,
      contaPaiId: conta.conta_pai_id,
    };
  });
}

/**
 * Movimentos pendentes por conta e por mês ("YYYY-MM"), para a escolha da
 * conta mostrar onde está o trabalho.
 */
export async function contarPendentesPorConta(): Promise<
  Map<string, Map<string, number>>
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("extrato_transacoes")
    .select("conta_bancaria_id, data_movimento")
    .eq("conciliada", false)
    .limit(20000);

  if (error) {
    throw new Error("Não foi possível contar os movimentos pendentes");
  }

  const contagem = new Map<string, Map<string, number>>();
  for (const linha of data ?? []) {
    const mes = linha.data_movimento.slice(0, 7);
    const daConta = contagem.get(linha.conta_bancaria_id) ?? new Map<string, number>();
    daConta.set(mes, (daConta.get(mes) ?? 0) + 1);
    contagem.set(linha.conta_bancaria_id, daConta);
  }
  return contagem;
}

/**
 * Cartões de crédito ativos, para casar a fatura na conciliação. Cada um traz a
 * conta dele: a fatura só se casa com débito dessa conta (o banco recusa as
 * outras), então a tela oferece só os cartões da conta do extrato.
 */
export async function listarCartoes(): Promise<
  { id: string; nome: string; contaBancariaId: string }[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cartoes_credito")
    .select("id, nome, ultimos_digitos, conta_bancaria_id")
    .eq("ativo", true)
    .order("nome");
  if (error) throw new Error("Não foi possível carregar os cartões");
  return (data ?? []).map((c) => ({
    id: c.id,
    nome: c.ultimos_digitos ? `${c.nome} (final ${c.ultimos_digitos})` : c.nome,
    contaBancariaId: c.conta_bancaria_id,
  }));
}

/** Saldo conhecido de uma conta no fim de um dia (Bloco K). */
export interface AncoraSaldo {
  id: string;
  contaId: string;
  data: string;
  saldo: number;
  fonte: "extrato_pdf" | "ledgerbal_fim_periodo" | "informado";
  observacao: string | null;
}

/** Âncoras de saldo das contas que a pessoa pode ver (o RLS filtra). */
export async function listarAncoras(): Promise<AncoraSaldo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conciliacao_saldos_ancora")
    .select("id, conta_bancaria_id, data, saldo, fonte, observacao")
    .order("data", { ascending: false });
  if (error) {
    throw new Error("Não foi possível carregar as âncoras de saldo");
  }
  return (data ?? []).map((a) => ({
    id: a.id,
    contaId: a.conta_bancaria_id,
    data: a.data,
    saldo: Number(a.saldo),
    fonte: a.fonte as AncoraSaldo["fonte"],
    observacao: a.observacao,
  }));
}

/** Regras de conciliação por histórico (Bloco H), todas as contas. */
export async function listarRegras(): Promise<RegraConciliacao[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conciliacao_regras")
    .select(
      "id, conta_bancaria_id, nome, padrao, sentido, acao, conta_contraparte_id, fornecedor_id, categoria_id, centro_custo_id, automatica, ativa, vezes_aplicada, ultima_aplicacao",
    )
    .order("nome");
  if (error) {
    throw new Error("Não foi possível carregar as regras de conciliação");
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    contaBancariaId: r.conta_bancaria_id,
    nome: r.nome,
    padrao: r.padrao,
    sentido: r.sentido === "credito" || r.sentido === "debito" ? r.sentido : null,
    acao: r.acao as RegraConciliacao["acao"],
    contaContraparteId: r.conta_contraparte_id,
    fornecedorId: r.fornecedor_id,
    categoriaId: r.categoria_id,
    centroCustoId: r.centro_custo_id,
    automatica: r.automatica,
    ativa: r.ativa,
    vezesAplicada: r.vezes_aplicada,
    ultimaAplicacao: r.ultima_aplicacao,
  }));
}

/** Meses fechados (ativos) por conta: conjunto de "YYYY-MM". */
export async function listarMesesFechados(): Promise<Map<string, Set<string>>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conciliacao_fechamentos")
    .select("conta_bancaria_id, mes")
    .is("reaberto_em", null);

  if (error) {
    throw new Error("Não foi possível carregar os meses fechados");
  }

  const fechados = new Map<string, Set<string>>();
  for (const linha of data ?? []) {
    const daConta = fechados.get(linha.conta_bancaria_id) ?? new Set<string>();
    daConta.add(linha.mes.slice(0, 7));
    fechados.set(linha.conta_bancaria_id, daConta);
  }
  return fechados;
}

/**
 * O painel de UMA conta num período: movimentos do extrato (com o vínculo) e
 * os candidatos do app (pagas nesta conta, pagas em outra com o mesmo valor,
 * em aberto com o mesmo valor, transferências com o lado livre).
 */
export async function carregarPainel(
  contaId: string,
  inicio: string,
  fim: string,
): Promise<PainelConciliacao> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_conciliacao_painel", {
    p_conta_id: contaId,
    p_inicio: inicio,
    p_fim: fim,
  });

  if (error) {
    throw new Error("Não foi possível carregar a conciliação da conta");
  }

  const painel = painelSchema.safeParse(data);
  if (!painel.success) {
    throw new Error("A conciliação da conta veio num formato inesperado");
  }
  return painel.data;
}

/** O histórico de importações de extrato, mais recentes primeiro (Bloco G). */
export async function listarImportacoes(): Promise<Importacao[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_conciliacao_importacoes");
  if (error) {
    throw new Error("Não foi possível carregar as importações");
  }
  const lista = importacoesSchema.safeParse(data);
  if (!lista.success) {
    throw new Error("As importações vieram num formato inesperado");
  }
  return lista.data;
}

/**
 * Meses fechados desta conta cujo saldo do app mudou depois do fechamento. Erro
 * na leitura vira lista vazia com log: o aviso é extra, não pode derrubar a tela.
 */
export async function listarDesvios(contaId: string): Promise<DesvioDoFechamento[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_conciliacao_desvios", { p_conta_id: contaId });
  if (error) {
    console.error("[conciliacao.listarDesvios]", error.message);
    return [];
  }
  return (data ?? []).map((d) => ({
    mes: d.mes,
    saldoFechamento: Number(d.saldo_fechamento),
    saldoAgora: Number(d.saldo_agora),
    diferenca: Number(d.diferenca),
  }));
}
