import type {
  StatusLancamento,
  TipoLancamento,
} from "@/modules/financeiro/_shared/formato";

/**
 * Leitura do que a RPC `fn_listar_lancamentos` devolve.
 *
 * Mora fora de `queries.ts` (que é "server-only") porque é conversão pura:
 * dá para testar sem banco. E precisa de teste, porque é o ponto onde um
 * campo renomeado no SQL viraria `undefined` numa coluna de dinheiro em vez
 * de erro.
 */

/** Linha da listagem de lançamentos. */
export interface LancamentoLista {
  id: string;
  numero: string | null;
  tipo: TipoLancamento;
  origem: string;
  descricao: string;
  categoriaNome: string | null;
  fornecedorNome: string | null;
  valor: number;
  dataVencimento: string | null;
  status: StatusLancamento;
  qtdParcelas: number;
  /** O fato: data da compra ou do documento. */
  dataCompra: string;
  /** Mês de referência (dia 1): em que mês o custo entra. */
  mesCompetencia: string;
  /** Data de sistema, imutável. */
  criadoEm: string;
  /**
   * Estado da revisão do lançamento, derivado da conta bancária das parcelas.
   * Não é um marcador que alguém liga na mão: selo dizendo "revisado" com a
   * conta vazia seria mentira, e um flag manual sairia de sincronia com o que
   * o banco exige para aprovar.
   *
   * Parcela PAGA conta como resolvida, porque pagar exige conta bancária. Logo
   * lançamento quitado é `revisado`, e é o caso mais resolvido que existe.
   *
   * nao-se-aplica: a receber, ou sem parcela nenhuma.
   *
   * Vem calculado do banco, pela MESMA expressão que o filtro de revisão usa:
   * é isso que impede o selo da coluna e o filtro de discordarem.
   */
  revisao: "sem-conta" | "parcial" | "revisado" | "nao-se-aplica";
}

/** Resultado paginado da listagem. */
export interface LancamentosPagina {
  itens: LancamentoLista[];
  total: number;
  /**
   * Soma do `valor` de TODOS os lançamentos que passaram no filtro, não só os
   * da página. Sem filtro nenhum é o total da base.
   */
  valorTotal: number;
}

const REVISOES = ["sem-conta", "parcial", "revisado", "nao-se-aplica"] as const;

function texto(valor: unknown, campo: string): string {
  if (typeof valor !== "string") {
    throw new Error(`Campo "${campo}" veio fora do formato esperado`);
  }
  return valor;
}

function textoOuNulo(valor: unknown): string | null {
  return typeof valor === "string" ? valor : null;
}

/**
 * Número que aceita string, porque `numeric` do Postgres pode chegar as duas
 * formas dependendo do caminho. Recusa o que não é número em vez de virar
 * NaN silencioso numa coluna de dinheiro.
 */
function numero(valor: unknown, campo: string): number {
  const n = typeof valor === "string" ? Number(valor) : valor;
  if (typeof n !== "number" || !Number.isFinite(n)) {
    throw new Error(`Campo "${campo}" não é um número`);
  }
  return n;
}

function registro(valor: unknown): Record<string, unknown> {
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) {
    throw new Error("A listagem de lançamentos veio fora do formato esperado");
  }
  return valor as Record<string, unknown>;
}

/** Converte uma linha da RPC na linha da listagem. */
export function lerLinha(bruta: unknown): LancamentoLista {
  const l = registro(bruta);
  const revisao = texto(l.revisao, "revisao");
  if (!(REVISOES as readonly string[]).includes(revisao)) {
    throw new Error(`Estado de revisão desconhecido: "${revisao}"`);
  }
  return {
    id: texto(l.id, "id"),
    numero: textoOuNulo(l.numero),
    tipo: texto(l.tipo, "tipo") as TipoLancamento,
    origem: texto(l.origem, "origem"),
    descricao: texto(l.descricao, "descricao"),
    categoriaNome: textoOuNulo(l.categoria_nome),
    fornecedorNome: textoOuNulo(l.fornecedor_nome),
    valor: numero(l.valor, "valor"),
    dataVencimento: textoOuNulo(l.data_vencimento),
    status: texto(l.status, "status") as StatusLancamento,
    qtdParcelas: numero(l.qtd_parcelas, "qtd_parcelas"),
    dataCompra: texto(l.data_compra, "data_compra"),
    mesCompetencia: texto(l.mes_competencia, "mes_competencia"),
    criadoEm: texto(l.created_at, "created_at"),
    revisao: revisao as LancamentoLista["revisao"],
  };
}

/** Converte o retorno inteiro da RPC na página da listagem. */
export function lerPagina(bruta: unknown): LancamentosPagina {
  const p = registro(bruta);
  if (!Array.isArray(p.itens)) {
    throw new Error("A listagem de lançamentos veio sem a lista de itens");
  }
  return {
    total: numero(p.total, "total"),
    valorTotal: numero(p.valor_total, "valor_total"),
    itens: p.itens.map(lerLinha),
  };
}
