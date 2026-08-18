import "server-only";

import type { EventoTrilha } from "@/components/canonicos/trilha";
import { createClient } from "@/lib/supabase/server";
import { ROTULO_BANCO, type BancoConta } from "@/modules/financeiro/_shared/formato";
import type { OrigemDataProgramada } from "@/modules/financeiro/_shared/janela-pagamento";
import {
  eventoParcelaParaTrilha,
  type ParcelaEvento,
  type TipoParcelaEvento,
} from "@/modules/financeiro/pagamentos/eventos";

/** Parcela a pagar já aprovada, pronta para registrar o pagamento. */
export interface ParcelaAprovada {
  id: string;
  lancamentoId: string;
  lancamentoNumero: string | null;
  numeroParcela: number;
  descricao: string;
  /** Categoria financeira do lançamento, exibida junto da descrição. */
  categoriaNome: string | null;
  fornecedorNome: string;
  /**
   * Fornecedor e conta bancária como id, para os filtros da fila. Opcionais
   * porque a interface também é o contrato de entrada do drawer de pagamento, e
   * quem só quer abrir o drawer (aba Programados) não tem esses ids em mão.
   */
  fornecedorId?: string | null;
  contaBancariaId?: string | null;
  dataVencimento: string | null;
  /** Data em que o pagamento está autorizado. É ela que a trava do banco usa. */
  dataProgramada: string | null;
  dataProgramadaOrigem: OrigemDataProgramada | null;
  valor: number;
  aprovadoEm: string | null;
}

/** Parcela já paga, para o histórico. */
export interface ParcelaPaga {
  id: string;
  lancamentoNumero: string | null;
  numeroParcela: number;
  descricao: string;
  /** Categoria financeira do lançamento, exibida junto da descrição. */
  categoriaNome: string | null;
  fornecedorNome: string;
  contaNome: string;
  dataPagamento: string | null;
  /** Valor devido da parcela. O desconto não o reescreve. */
  valor: number;
  /** Desconto concedido no pagamento. Zero quando não houve. */
  desconto: number;
  /** Valor menos desconto: o que saiu da conta bancária. */
  valorLiquido: number;
}

/**
 * Filtros do histórico de pagamentos. Todos vão ao banco: a paginação da aba
 * "Pagas" é server-side, e filtrar só a página carregada faria a tela mentir
 * sobre quantos pagamentos existem.
 */
export interface FiltrosParcelasPagas {
  /** Número do lançamento, descrição ou nome do fornecedor. */
  busca?: string;
  fornecedorId?: string;
  contaBancariaId?: string;
  /** Faixa de valor da parcela, em reais (comparação gte/lte no banco). */
  valorDe?: number;
  valorAte?: number;
  /** Períodos em yyyy-MM-dd; ponta vazia significa sem limite naquele lado. */
  vencimentoDe?: string;
  vencimentoAte?: string;
  programadaDe?: string;
  programadaAte?: string;
  pagamentoDe?: string;
  pagamentoAte?: string;
}

/** Histórico paginado de pagamentos. */
export interface ParcelasPagasPagina {
  itens: ParcelaPaga[];
  total: number;
}

/** Opção de conta bancária ativa para o select do pagamento. */
export interface ContaBancariaOpcao {
  id: string;
  nome: string;
  banco: string;
}

/** Nome de exibição do fornecedor: fantasia quando existe, senão razão social. */
function nomeFornecedor(
  fornecedor: { razao_social: string; nome_fantasia: string | null } | null,
): string {
  if (!fornecedor) return "-";
  return fornecedor.nome_fantasia ?? fornecedor.razao_social;
}

/** Rótulo da conta: nome + banco (ex: "Conta movimento - Sicredi"). */
function rotuloConta(nome: string, banco: string): string {
  const rotuloBanco = ROTULO_BANCO[banco as BancoConta] ?? banco;
  return `${nome} - ${rotuloBanco}`;
}

/**
 * Parcelas aprovadas de lançamentos a pagar, prontas para pagamento.
 * Só status='aprovado' e do tipo a_pagar (a_receber baixa em contas a
 * receber, não aqui). Ordena por vencimento mais próximo primeiro.
 */
export async function listarParcelasAprovadas(): Promise<ParcelaAprovada[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("lancamento_parcelas")
    .select(
      `id, numero_parcela, valor, data_vencimento, data_programada,
       data_programada_origem, aprovado_em, lancamento_id, conta_bancaria_id,
       lancamentos!inner(
         numero, descricao, tipo, fornecedor_id,
         categorias_financeiras(nome),
         fornecedores(razao_social, nome_fantasia)
       )`,
    )
    .eq("status", "aprovado")
    .eq("lancamentos.tipo", "a_pagar")
    // Parcela de lançamento cancelado não é pagável. O banco recusa
    // (fn_pagar_parcela), e ela também não aparece aqui: parcela de lançamento
    // cancelado listada como "a pagar" é convite para pagar o que não existe.
    .neq("lancamentos.status", "cancelado")
    .order("data_vencimento", { ascending: true, nullsFirst: false });

  if (error) {
    throw new Error("Não foi possível carregar as parcelas a pagar");
  }

  return (data ?? []).map((parcela) => ({
    id: parcela.id,
    lancamentoId: parcela.lancamento_id,
    lancamentoNumero: parcela.lancamentos?.numero ?? null,
    numeroParcela: parcela.numero_parcela,
    descricao: parcela.lancamentos?.descricao ?? "-",
    categoriaNome: parcela.lancamentos?.categorias_financeiras?.nome ?? null,
    fornecedorId: parcela.lancamentos?.fornecedor_id ?? null,
    fornecedorNome: nomeFornecedor(parcela.lancamentos?.fornecedores ?? null),
    contaBancariaId: parcela.conta_bancaria_id,
    dataVencimento: parcela.data_vencimento,
    dataProgramada: parcela.data_programada,
    dataProgramadaOrigem:
      (parcela.data_programada_origem as OrigemDataProgramada | null) ?? null,
    valor: parcela.valor,
    aprovadoEm: parcela.aprovado_em,
  }));
}

/** Máximo de fornecedores resolvidos por nome numa busca (limite do filtro in). */
const MAX_FORNECEDORES_BUSCA = 50;

/**
 * Padrão ilike (%termo%) do termo de busca. Remove os caracteres que quebram a
 * sintaxe do or() do PostgREST (vírgula, parênteses, aspas, barra).
 */
function padraoBusca(termo: string): string {
  return `%${termo.replace(/[,()"'\\]/g, "").trim()}%`;
}

/**
 * Ids de fornecedores cujo nome bate com o padrão. A busca do histórico precisa
 * achar por fornecedor, e o or() do PostgREST não mistura colunas de tabelas
 * diferentes: os ids entram como mais um termo do or() em cima de lancamentos.
 */
async function idsFornecedoresPorNome(
  supabase: Awaited<ReturnType<typeof createClient>>,
  padrao: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("fornecedores")
    .select("id")
    .or(`razao_social.ilike.${padrao},nome_fantasia.ilike.${padrao}`)
    .limit(MAX_FORNECEDORES_BUSCA);
  return (data ?? []).map((fornecedor) => fornecedor.id);
}

/**
 * Histórico paginado de parcelas pagas, mais recentes primeiro. Resolve a
 * conta bancária do pagamento e o fornecedor do lançamento via join, e aplica
 * todos os filtros no banco.
 */
export async function listarParcelasPagas({
  pagina,
  tamanho,
  filtros = {},
}: {
  pagina: number;
  tamanho: number;
  filtros?: FiltrosParcelasPagas;
}): Promise<ParcelasPagasPagina> {
  const supabase = await createClient();

  const de = pagina * tamanho;
  const ate = de + tamanho - 1;

  let consulta = supabase
    .from("lancamento_parcelas")
    .select(
      `id, numero_parcela, valor, desconto, valor_liquido, data_pagamento,
       contas_bancarias(nome, banco),
       lancamentos!inner(
         numero, descricao,
         categorias_financeiras(nome),
         fornecedores(razao_social, nome_fantasia)
       )`,
      { count: "exact" },
    )
    .eq("status", "pago")
    .order("data_pagamento", { ascending: false, nullsFirst: false })
    .order("pago_em", { ascending: false, nullsFirst: false })
    .range(de, ate);

  if (filtros.contaBancariaId) {
    consulta = consulta.eq("conta_bancaria_id", filtros.contaBancariaId);
  }
  if (filtros.valorDe !== undefined) {
    consulta = consulta.gte("valor", filtros.valorDe);
  }
  if (filtros.valorAte !== undefined) {
    consulta = consulta.lte("valor", filtros.valorAte);
  }
  if (filtros.vencimentoDe) {
    consulta = consulta.gte("data_vencimento", filtros.vencimentoDe);
  }
  if (filtros.vencimentoAte) {
    consulta = consulta.lte("data_vencimento", filtros.vencimentoAte);
  }
  if (filtros.programadaDe) {
    consulta = consulta.gte("data_programada", filtros.programadaDe);
  }
  if (filtros.programadaAte) {
    consulta = consulta.lte("data_programada", filtros.programadaAte);
  }
  if (filtros.pagamentoDe) {
    consulta = consulta.gte("data_pagamento", filtros.pagamentoDe);
  }
  if (filtros.pagamentoAte) {
    consulta = consulta.lte("data_pagamento", filtros.pagamentoAte);
  }
  // Fornecedor e busca moram no lançamento. O join já é !inner, então filtrar a
  // tabela embutida filtra as parcelas de verdade (não só o que aparece nela).
  if (filtros.fornecedorId) {
    consulta = consulta.eq("lancamentos.fornecedor_id", filtros.fornecedorId);
  }
  const termo = filtros.busca?.trim() ?? "";
  if (termo !== "") {
    const padrao = padraoBusca(termo);
    const idsFornecedores = await idsFornecedoresPorNome(supabase, padrao);
    const partes = [`numero.ilike.${padrao}`, `descricao.ilike.${padrao}`];
    if (idsFornecedores.length > 0) {
      partes.push(`fornecedor_id.in.(${idsFornecedores.join(",")})`);
    }
    consulta = consulta.or(partes.join(","), {
      referencedTable: "lancamentos",
    });
  }

  const { data, error, count } = await consulta;

  if (error) {
    throw new Error("Não foi possível carregar o histórico de pagamentos");
  }

  const itens: ParcelaPaga[] = (data ?? []).map((parcela) => ({
    id: parcela.id,
    lancamentoNumero: parcela.lancamentos?.numero ?? null,
    numeroParcela: parcela.numero_parcela,
    descricao: parcela.lancamentos?.descricao ?? "-",
    categoriaNome: parcela.lancamentos?.categorias_financeiras?.nome ?? null,
    fornecedorNome: nomeFornecedor(parcela.lancamentos?.fornecedores ?? null),
    contaNome: parcela.contas_bancarias
      ? rotuloConta(parcela.contas_bancarias.nome, parcela.contas_bancarias.banco)
      : "-",
    dataPagamento: parcela.data_pagamento,
    valor: parcela.valor,
    desconto: parcela.desconto ?? 0,
    valorLiquido: parcela.valor_liquido ?? parcela.valor,
  }));

  return { itens, total: count ?? 0 };
}

/** Contas bancárias ativas para o select do pagamento, em ordem alfabética. */
export async function listarContasBancarias(): Promise<ContaBancariaOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("contas_bancarias")
    .select("id, nome, banco")
    .eq("ativo", true)
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar as contas bancárias");
  }

  return (data ?? []).map((conta) => ({
    id: conta.id,
    nome: conta.nome,
    banco: conta.banco,
  }));
}

/**
 * Trilha das parcelas do lançamento: lê `parcela_eventos` das parcelas
 * daquele lançamento numa leitura só (embed de `lancamento_parcelas` para o
 * número da parcela e o filtro pelo lançamento), resolve o nome do autor em
 * lote via `nomes_usuarios_financeiro` e converte cada linha para o
 * `EventoTrilha` do componente canônico, mais recente primeiro.
 *
 * `nomes_usuarios_financeiro` (não `nomes_usuarios_auditoria`) de propósito:
 * é gated na mesma permissão de quem já pode ver o lançamento/a fila de
 * aprovação, não na de auditoria/lixeira — Financeiro e Gestor não têm essa
 * segunda, e veriam "Sistema" em vez do nome de quem aprovou/reprogramou.
 */
export async function trilhaParcelasDoLancamento(
  lancamentoId: string,
): Promise<EventoTrilha[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("parcela_eventos")
    .select(
      `id, tipo, motivo, data_de, data_para, valor_de, valor_para,
       created_at, created_by,
       lancamento_parcelas!inner(numero_parcela, lancamento_id)`,
    )
    .eq("lancamento_parcelas.lancamento_id", lancamentoId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (error || !data) return [];

  const idsUsuarios = [
    ...new Set(
      data
        .map((linha) => linha.created_by)
        .filter((id): id is string => id !== null),
    ),
  ];

  const nomesPorId = new Map<string, string>();
  if (idsUsuarios.length > 0) {
    const { data: usuarios } = await supabase.rpc("nomes_usuarios_financeiro", {
      p_ids: idsUsuarios,
    });
    for (const usuario of usuarios ?? []) {
      nomesPorId.set(usuario.id, usuario.nome);
    }
  }

  return data.map((linha) => {
    const evento: ParcelaEvento = {
      id: linha.id,
      tipo: linha.tipo as TipoParcelaEvento,
      motivo: linha.motivo,
      dataDe: linha.data_de,
      dataPara: linha.data_para,
      valorDe: linha.valor_de,
      valorPara: linha.valor_para,
      criadoEm: linha.created_at,
      usuarioNome:
        linha.created_by === null
          ? "Sistema"
          : (nomesPorId.get(linha.created_by) ?? "Sistema"),
    };
    return eventoParcelaParaTrilha(
      evento,
      linha.lancamento_parcelas?.numero_parcela ?? 0,
    );
  });
}
