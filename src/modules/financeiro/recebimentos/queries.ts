import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import {
  ROTULO_BANCO,
  STATUS_PARCELA_ABERTA,
  type BancoConta,
  type StatusParcela,
} from "@/modules/financeiro/_shared/formato";

/**
 * Leitura da aba Financeiro > Recebimentos.
 *
 * Espelha `pagamentos/queries.ts` de propósito, inclusive nos cuidados: a aba "A
 * receber" traz TODAS as linhas (paginando acima do teto de mil do PostgREST)
 * porque os cards do topo somam o conjunto inteiro; a aba "Recebidos" é paginada
 * no banco e por isso TODO filtro dela vai ao banco.
 *
 * Cuidado com o nome: existe uma tabela `recebimentos` no banco, e ela é OUTRA
 * coisa — é o recebimento de MATERIAL de uma ordem de compra (a nota que chega
 * com a mercadoria), do domínio de Compras. Este módulo é recebimento de
 * DINHEIRO: parcelas de lançamentos com `tipo = 'a_receber'`. Nada aqui lê aquela
 * tabela.
 */

/** Parcela a receber, ainda em aberto. */
export interface ParcelaAReceber {
  id: string;
  lancamentoId: string;
  lancamentoNumero: string | null;
  numeroParcela: number;
  descricao: string;
  /** Categoria de receita do lançamento, exibida junto da descrição. */
  categoriaNome: string | null;
  /** Número da nota, medição ou contrato. Obrigatório desde 19/08/2026. */
  numeroDocumento: string | null;
  /** Quem está pagando. */
  clienteId: string | null;
  clienteNome: string;
  /** Conta em que o dinheiro vai entrar, escolhida no lançamento. */
  contaBancariaId: string | null;
  contaBancariaNome: string;
  dataVencimento: string | null;
  valor: number;
  status: StatusParcela;
}

/** Parcela já recebida, para a aba "Recebidos". */
export interface ParcelaRecebida {
  id: string;
  lancamentoId: string;
  lancamentoNumero: string | null;
  numeroParcela: number;
  descricao: string;
  categoriaNome: string | null;
  numeroDocumento: string | null;
  clienteNome: string;
  contaBancariaNome: string;
  dataVencimento: string | null;
  dataRecebimento: string | null;
  /** Valor devido da parcela. Desconto e juros não o reescrevem. */
  valor: number;
  /** Desconto concedido. Zero quando não houve. */
  desconto: number;
  /** Juros e multa cobrados no atraso. Zero quando não houve. */
  juros: number;
  /** Valor menos desconto mais juros: o que ENTROU na conta bancária. */
  valorLiquido: number;
}

/**
 * Filtros da aba "Recebidos". Todos vão ao banco: a paginação é server-side, e
 * filtrar só a página carregada faria a tela mentir sobre quantos recebimentos
 * existem.
 */
export interface FiltrosRecebidas {
  /** Número do lançamento, número do documento ou descrição. */
  busca?: string;
  clienteId?: string;
  contaBancariaId?: string;
  categoriaId?: string;
  /** Faixa de valor da parcela, em reais (comparação gte/lte no banco). */
  valorDe?: number;
  valorAte?: number;
  /** Períodos em yyyy-MM-dd; ponta vazia é sem limite naquele lado. */
  vencimentoDe?: string;
  vencimentoAte?: string;
  recebimentoDe?: string;
  recebimentoAte?: string;
}

/** Página da aba "Recebidos". */
export interface RecebidasPagina {
  itens: ParcelaRecebida[];
  total: number;
}

/** Opção de categoria de receita para o formulário e o filtro. */
export interface CategoriaReceitaOpcao {
  id: string;
  nome: string;
}

/** Nome de exibição do cliente: fantasia quando existe, senão o nome. */
function nomeCliente(
  cliente: { nome: string; nome_fantasia: string | null } | null,
): string {
  if (!cliente) return "-";
  return cliente.nome_fantasia ?? cliente.nome;
}

/** Rótulo da conta: nome + banco (ex: "Conta movimento - Sicredi"). */
function rotuloConta(nome: string, banco: string): string {
  const rotuloBanco = ROTULO_BANCO[banco as BancoConta] ?? banco;
  return `${nome} - ${rotuloBanco}`;
}

/** Linha crua de parcela a receber, como o PostgREST devolve. */
interface LinhaAReceber {
  id: string;
  numero_parcela: number;
  valor: number;
  status: string;
  data_vencimento: string | null;
  lancamento_id: string;
  conta_bancaria_id: string | null;
  contas_bancarias: { nome: string; banco: string } | null;
  lancamentos: {
    numero: string | null;
    descricao: string | null;
    numero_documento: string | null;
    cliente_id: string | null;
    categorias_financeiras: { nome: string } | null;
    clientes: { nome: string; nome_fantasia: string | null } | null;
  } | null;
}

/** Linha crua de parcela recebida. */
interface LinhaRecebida extends LinhaAReceber {
  data_pagamento: string | null;
  desconto: number | null;
  juros: number | null;
  valor_liquido: number | null;
}

const SELECT_A_RECEBER = `id, numero_parcela, valor, status, data_vencimento,
   lancamento_id, conta_bancaria_id,
   contas_bancarias(nome, banco),
   lancamentos!inner(
     numero, descricao, numero_documento, cliente_id, tipo, status,
     categorias_financeiras(nome),
     clientes(nome, nome_fantasia)
   )`;

const SELECT_RECEBIDA = `id, numero_parcela, valor, status, data_vencimento,
   data_pagamento, desconto, juros, valor_liquido,
   lancamento_id, conta_bancaria_id,
   contas_bancarias(nome, banco),
   lancamentos!inner(
     numero, descricao, numero_documento, cliente_id, tipo, status, categoria_id,
     categorias_financeiras(nome),
     clientes(nome, nome_fantasia)
   )`;

/** Converte o status cru do banco num StatusParcela conhecido. */
function comoStatusParcela(status: string): StatusParcela {
  switch (status) {
    case "pendente":
    case "em_revisao":
    case "aprovado":
    case "pago":
    case "cancelado":
      return status;
    default:
      return "pendente";
  }
}

/** Parte comum da conversão de linha crua para a lista da tela. */
function comum(parcela: LinhaAReceber) {
  return {
    id: parcela.id,
    lancamentoId: parcela.lancamento_id,
    lancamentoNumero: parcela.lancamentos?.numero ?? null,
    numeroParcela: parcela.numero_parcela,
    descricao: parcela.lancamentos?.descricao ?? "-",
    categoriaNome: parcela.lancamentos?.categorias_financeiras?.nome ?? null,
    numeroDocumento: parcela.lancamentos?.numero_documento ?? null,
    clienteNome: nomeCliente(parcela.lancamentos?.clientes ?? null),
    contaBancariaNome: parcela.contas_bancarias
      ? rotuloConta(
          parcela.contas_bancarias.nome,
          parcela.contas_bancarias.banco,
        )
      : "-",
    dataVencimento: parcela.data_vencimento,
    valor: parcela.valor,
  };
}

/**
 * Parcelas EM ABERTO de lançamentos a receber.
 *
 * Quem decide o que é "em aberto" é `STATUS_PARCELA_ABERTA`, e não uma lista
 * digitada aqui: status novo entra sozinho, sem esta consulta e os cards do topo
 * passarem a discordar.
 *
 * Lançamento cancelado fica fora: parcela de lançamento cancelado listada como "a
 * receber" é convite para dar como recebido o que não existe, e `fn_pagar_parcela`
 * recusaria de qualquer jeito.
 *
 * Traz TODAS as linhas porque os cards somam o conjunto inteiro e a seleção
 * atravessa as páginas da tabela: somar só a página carregada faria o card mentir
 * sobre quanto a empresa tem a receber.
 */
export async function listarParcelasAReceber(): Promise<ParcelaAReceber[]> {
  const supabase = await createClient();

  const { linhas, erro } = await todasAsLinhas<LinhaAReceber>((de, ate) =>
    supabase
      .from("lancamento_parcelas")
      .select(SELECT_A_RECEBER)
      .in("status", STATUS_PARCELA_ABERTA)
      .eq("lancamentos.tipo", "a_receber")
      .neq("lancamentos.status", "cancelado")
      .order("data_vencimento", { ascending: true, nullsFirst: false })
      // Desempate obrigatório: sem ele, vencimentos iguais mudam de ordem entre
      // uma faixa e a seguinte, repetindo linha numa página e perdendo em outra.
      .order("id", { ascending: true })
      .range(de, ate)
      .returns<LinhaAReceber[]>(),
  );

  if (erro) {
    throw new Error("Não foi possível carregar as contas a receber");
  }

  return linhas.map((parcela) => ({
    ...comum(parcela),
    clienteId: parcela.lancamentos?.cliente_id ?? null,
    contaBancariaId: parcela.conta_bancaria_id,
    status: comoStatusParcela(parcela.status),
  }));
}

/** Máximo de clientes resolvidos por nome numa busca (limite do filtro in). */
const MAX_CLIENTES_BUSCA = 50;

/**
 * Padrão ilike (%termo%) do termo de busca. Remove os caracteres que quebram a
 * sintaxe do or() do PostgREST (vírgula, parênteses, aspas, barra).
 */
function padraoBusca(termo: string): string {
  return `%${termo.replace(/[,()"'\\]/g, "").trim()}%`;
}

/**
 * Ids de clientes cujo nome bate com o padrão. A busca precisa achar por quem
 * pagou, e o or() do PostgREST não mistura colunas de tabelas diferentes: os ids
 * entram como mais um termo do or() em cima de lancamentos.
 */
async function idsClientesPorNome(
  supabase: Awaited<ReturnType<typeof createClient>>,
  padrao: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("clientes")
    .select("id")
    .or(`nome.ilike.${padrao},nome_fantasia.ilike.${padrao}`)
    .limit(MAX_CLIENTES_BUSCA);
  return (data ?? []).map((cliente) => cliente.id);
}

/**
 * Histórico paginado de parcelas recebidas, mais recentes primeiro. Resolve
 * conta, cliente e categoria via join, e aplica TODOS os filtros no banco.
 */
export async function listarParcelasRecebidas({
  pagina,
  tamanho,
  filtros = {},
}: {
  pagina: number;
  tamanho: number;
  filtros?: FiltrosRecebidas;
}): Promise<RecebidasPagina> {
  const supabase = await createClient();

  const de = pagina * tamanho;
  const ate = de + tamanho - 1;

  let consulta = supabase
    .from("lancamento_parcelas")
    .select(SELECT_RECEBIDA, { count: "exact" })
    .eq("status", "pago")
    .eq("lancamentos.tipo", "a_receber");

  if (filtros.busca?.trim()) {
    const padrao = padraoBusca(filtros.busca);
    const idsClientes = await idsClientesPorNome(supabase, padrao);
    const termos = [
      `numero.ilike.${padrao}`,
      `numero_documento.ilike.${padrao}`,
      `descricao.ilike.${padrao}`,
    ];
    if (idsClientes.length > 0) {
      termos.push(`cliente_id.in.(${idsClientes.join(",")})`);
    }
    consulta = consulta.or(termos.join(","), {
      referencedTable: "lancamentos",
    });
  }

  if (filtros.clienteId) {
    consulta = consulta.eq("lancamentos.cliente_id", filtros.clienteId);
  }
  if (filtros.categoriaId) {
    consulta = consulta.eq("lancamentos.categoria_id", filtros.categoriaId);
  }
  if (filtros.contaBancariaId) {
    consulta = consulta.eq("conta_bancaria_id", filtros.contaBancariaId);
  }
  // Dinheiro é NUMERIC(14,2): comparação por gte/lte, nunca por texto.
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
  if (filtros.recebimentoDe) {
    consulta = consulta.gte("data_pagamento", filtros.recebimentoDe);
  }
  if (filtros.recebimentoAte) {
    consulta = consulta.lte("data_pagamento", filtros.recebimentoAte);
  }

  const { data, error, count } = await consulta
    .order("data_pagamento", { ascending: false, nullsFirst: false })
    // Desempate obrigatório: datas de recebimento empatadas mudariam de ordem
    // entre páginas, repetindo linha numa e perdendo em outra.
    .order("id", { ascending: true })
    .range(de, ate)
    .returns<LinhaRecebida[]>();

  if (error) {
    throw new Error("Não foi possível carregar os recebimentos");
  }

  const itens: ParcelaRecebida[] = (data ?? []).map((parcela) => ({
    ...comum(parcela),
    dataRecebimento: parcela.data_pagamento,
    desconto: parcela.desconto ?? 0,
    juros: parcela.juros ?? 0,
    valorLiquido: parcela.valor_liquido ?? parcela.valor,
  }));

  return { itens, total: count ?? 0 };
}

/**
 * Soma, em reais, o que ENTROU nas contas dentro do período, pelo LÍQUIDO.
 *
 * Líquido e não valor da parcela: o card responde "quanto dinheiro entrou", e é o
 * líquido (valor menos desconto mais juros) que bate com o extrato bancário e com
 * a mesma conta que o saldo da conta bancária faz.
 *
 * Lê em páginas porque um mês de recebimentos pode passar de mil parcelas quando
 * o recebível vem parcelado, e o corte do PostgREST é silencioso.
 */
export async function somarRecebidoNoPeriodo(
  de: string,
  ate: string,
): Promise<number> {
  const supabase = await createClient();

  const { linhas, erro } = await todasAsLinhas<{
    valor: number;
    valor_liquido: number | null;
  }>((inicio, fim) =>
    supabase
      .from("lancamento_parcelas")
      .select("valor, valor_liquido, id, lancamentos!inner(tipo, status)")
      .eq("status", "pago")
      .eq("lancamentos.tipo", "a_receber")
      .neq("lancamentos.status", "cancelado")
      .gte("data_pagamento", de)
      .lte("data_pagamento", ate)
      .order("id", { ascending: true })
      .range(inicio, fim),
  );

  // Zero por falha de leitura seria um card afirmando "nada entrou", que é
  // diferente de "não consegui somar": o erro sobe e a página trata.
  if (erro) {
    throw new Error("Não foi possível somar os recebimentos do período");
  }

  // Soma em centavos inteiros para o card não divergir da tabela por
  // arredondamento, igual ao resto do módulo.
  const centavos = linhas.reduce(
    (total, parcela) =>
      total + Math.round(Number(parcela.valor_liquido ?? parcela.valor) * 100),
    0,
  );
  return centavos / 100;
}

/** Categorias de RECEITA ativas, em ordem alfabética. */
export async function listarCategoriasReceita(): Promise<
  CategoriaReceitaOpcao[]
> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("categorias_financeiras")
    .select("id, nome")
    .eq("tipo", "receita")
    .eq("ativo", true)
    .order("nome");

  if (error) {
    throw new Error("Não foi possível carregar as categorias de receita");
  }

  return (data ?? []).map((categoria) => ({
    id: categoria.id,
    nome: categoria.nome,
  }));
}
