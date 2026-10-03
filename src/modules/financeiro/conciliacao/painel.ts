import { z } from "zod";

import type {
  CandidatoCasavel,
  MovimentoCasavel,
} from "@/modules/financeiro/conciliacao/casamento";

/**
 * O que `fn_conciliacao_painel` devolve para UMA conta num período, e como
 * isso vira as três visões da tela:
 *
 * - **Casados**: movimento do extrato já vinculado a parcela ou transferência.
 * - **Faltam no app**: movimento do extrato sem par.
 * - **No app, fora do banco**: parcela paga nesta conta (ou lado de
 *   transferência) DENTRO do período que nenhum movimento do extrato cobriu.
 *
 * Módulo puro (o schema do Zod e funções), usado pela página no servidor e pela
 * tela no cliente. O painel vem por RPC porque quem só tem a Conciliação não lê
 * `lancamento_parcelas` pelo RLS.
 */

const numero = z.coerce.number();
const texto = z.string().nullable();

const parcelaVinculadaSchema = z.object({
  id: z.string(),
  lancamentoId: z.string(),
  lancamentoNumero: texto,
  descricao: texto,
  nome: texto,
  numeroParcela: numero,
  valorLiquido: numero,
  dataPagamento: texto,
});

const transferenciaVinculadaSchema = z.object({
  id: z.string(),
  numero: texto,
  descricao: texto,
  origemNome: texto,
  destinoNome: texto,
  data: z.string(),
});

const transacaoSchema = z.object({
  id: z.string(),
  extratoId: z.string(),
  dataMovimento: z.string(),
  valor: numero,
  tipo: z.enum(["credito", "debito"]),
  memo: texto,
  conciliada: z.boolean(),
  automatica: z.boolean(),
  parcela: parcelaVinculadaSchema.nullable(),
  transferencia: transferenciaVinculadaSchema.nullable(),
});

const parcelaLivreSchema = z.object({
  id: z.string(),
  lancamentoId: z.string(),
  lancamentoNumero: texto,
  descricao: texto,
  nome: texto,
  razaoSocial: texto,
  tipo: z.enum(["a_pagar", "a_receber"]),
  origem: z.string(),
  numeroParcela: numero,
  qtdParcelas: numero,
  valor: numero,
  valorLiquido: numero,
  /** Paga: data do pagamento. Aberta: data programada ou vencimento. */
  dataPagamento: texto.optional(),
  dataVencimento: texto.optional(),
  numeroDocumento: texto,
  status: z.string(),
  contaNome: texto,
  contaId: texto,
});

const transferenciaLivreSchema = z.object({
  id: z.string(),
  numero: texto,
  descricao: texto,
  data: z.string(),
  valor: numero,
  lado: z.enum(["saida", "entrada"]),
  origemNome: texto,
  destinoNome: texto,
});

/**
 * Saldo do banco contra o do app no último dia do período. Valores nulos para
 * quem não vê saldo da conta; `bate` vem calculado no servidor mesmo assim.
 */
const saldoSchema = z.object({
  data: z.string(),
  temSaldoNoArquivo: z.boolean(),
  podeVer: z.boolean(),
  banco: numero.nullable(),
  app: numero.nullable(),
  diferenca: numero.nullable(),
  /** Null quando o OFX não trouxe saldo. */
  bate: z.boolean().nullable(),
  /** Data do saldo inicial da conta (corte da migração). */
  corte: z.string().nullable().optional().transform((c) => c ?? null),
  /**
   * A data é anterior ao corte: o saldo do app foi calculado para trás a
   * partir do saldo inicial, e a diferença pode vir de qualquer mês até o corte.
   */
  antesDoCorte: z.boolean().optional().transform((a) => a ?? false),
});

export type SaldoPainel = z.infer<typeof saldoSchema>;

const fechamentoSchema = z.object({
  fechadoEm: z.string(),
  fechadoPor: z.string().nullable(),
  /** Null para quem não vê saldo da conta. */
  saldoBanco: numero.nullable(),
});

export type FechamentoPainel = z.infer<typeof fechamentoSchema>;

export const painelSchema = z.object({
  /** O fechamento ativo do mês, quando o mês está conciliado e fechado. */
  fechamento: fechamentoSchema.nullable().optional().transform((f) => f ?? null),
  /** Null quando nenhum extrato importado cobre o último dia do período. */
  saldo: saldoSchema
    .nullable()
    .optional()
    .transform((s) => s ?? null),
  transacoes: z.array(transacaoSchema),
  pagasNaConta: z.array(parcelaLivreSchema),
  pagasEmOutraConta: z.array(parcelaLivreSchema),
  abertas: z.array(parcelaLivreSchema),
  transferencias: z.array(transferenciaLivreSchema),
});

export type PainelConciliacao = z.infer<typeof painelSchema>;
export type TransacaoPainel = z.infer<typeof transacaoSchema>;
export type ParcelaLivre = z.infer<typeof parcelaLivreSchema>;
export type TransferenciaLivre = z.infer<typeof transferenciaLivreSchema>;

/** Um candidato com o registro de origem, para a tela desenhar a linha. */
export type CandidatoDoPainel = CandidatoCasavel &
  (
    | { registro: ParcelaLivre; transferencia?: undefined }
    | { registro?: undefined; transferencia: TransferenciaLivre }
  );

/** Valor do seletor de mês que abre todos os meses importados juntos. */
export const TODOS_OS_MESES = "todos";

/**
 * Período de "todos os meses": do início do primeiro extrato importado ao fim
 * do último. Null quando a conta não tem extrato com período.
 */
export function periodoDosExtratos(
  extratos: readonly { periodoInicio: string | null; periodoFim: string | null }[],
): { inicio: string; fim: string } | null {
  const inicios = extratos.map((e) => e.periodoInicio).filter((d): d is string => !!d).sort();
  const fins = extratos.map((e) => e.periodoFim).filter((d): d is string => !!d).sort();
  if (inicios.length === 0 || fins.length === 0) return null;
  return { inicio: inicios[0], fim: fins[fins.length - 1] };
}

/** Período fechado de um mês "YYYY-MM": do dia 1 ao último dia. */
export function periodoDoMes(
  mes: string,
): { inicio: string; fim: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(mes);
  if (!m) return null;
  const ano = Number(m[1]);
  const mesNumero = Number(m[2]);
  if (mesNumero < 1 || mesNumero > 12) return null;
  const ultimo = new Date(Date.UTC(ano, mesNumero, 0)).getUTCDate();
  return {
    inicio: `${m[1]}-${m[2]}-01`,
    fim: `${m[1]}-${m[2]}-${String(ultimo).padStart(2, "0")}`,
  };
}

function sentidoDaParcela(parcela: ParcelaLivre): "credito" | "debito" {
  return parcela.tipo === "a_receber" ? "credito" : "debito";
}

/** Todo candidato do painel no formato do motor de casamento. */
export function candidatosDoPainel(
  painel: PainelConciliacao,
): CandidatoDoPainel[] {
  const daParcela = (
    parcela: ParcelaLivre,
    grupo: "paga_na_conta" | "paga_outra_conta" | "aberta",
  ): CandidatoDoPainel => ({
    especie: "parcela",
    grupo,
    id: parcela.id,
    data:
      (grupo === "aberta" ? parcela.dataVencimento : parcela.dataPagamento) ??
      "",
    valor: parcela.valorLiquido,
    sentido: sentidoDaParcela(parcela),
    nomes: [parcela.nome, parcela.razaoSocial, parcela.descricao],
    // A conciliação só dá baixa em parcela a pagar já aprovada.
    podeBaixar: !(grupo === "aberta" && parcela.tipo === "a_pagar" && parcela.status !== "aprovado"),
    registro: parcela,
  });

  return [
    ...painel.pagasNaConta.map((p) => daParcela(p, "paga_na_conta")),
    ...painel.transferencias.map(
      (t): CandidatoDoPainel => ({
        especie: "transferencia",
        grupo: "transferencia",
        id: t.id,
        data: t.data,
        valor: t.valor,
        sentido: t.lado === "saida" ? "debito" : "credito",
        nomes: [t.descricao, t.origemNome, t.destinoNome],
        transferencia: t,
      }),
    ),
    ...painel.pagasEmOutraConta.map((p) => daParcela(p, "paga_outra_conta")),
    ...painel.abertas.map((p) => daParcela(p, "aberta")),
  ];
}

/** Movimentos sem par, no formato do motor. */
export function movimentosLivres(
  painel: PainelConciliacao,
): MovimentoCasavel[] {
  return painel.transacoes
    .filter((t) => !t.conciliada)
    .map((t) => ({
      id: t.id,
      dataMovimento: t.dataMovimento,
      valor: t.valor,
      memo: t.memo,
    }));
}

/** Linha do "no app, fora do banco": parcela paga ou lado de transferência. */
export type ItemForaDoBanco =
  | {
      especie: "parcela";
      id: string;
      data: string;
      valor: number;
      parcela: ParcelaLivre;
    }
  | {
      especie: "transferencia";
      id: string;
      data: string;
      valor: number;
      transferencia: TransferenciaLivre;
    };

export interface VisoesConciliacao {
  casados: TransacaoPainel[];
  faltamNoApp: TransacaoPainel[];
  foraDoBanco: ItemForaDoBanco[];
}

/**
 * Separa as três visões. O "fora do banco" é só o que cai DENTRO do período:
 * o painel traz alguns dias de folga nas bordas para o casamento (boleto pago
 * dia 30 que compensa dia 1), mas cobrar essas parcelas aqui acusaria o mês
 * vizinho.
 */
export function montarVisoes(
  painel: PainelConciliacao,
  periodo: { inicio: string; fim: string },
): VisoesConciliacao {
  const dentro = (data: string | null | undefined) =>
    !!data && data >= periodo.inicio && data <= periodo.fim;

  const foraDoBanco: ItemForaDoBanco[] = [
    ...painel.pagasNaConta
      .filter((p) => dentro(p.dataPagamento))
      .map(
        (p): ItemForaDoBanco => ({
          especie: "parcela",
          id: p.id,
          data: p.dataPagamento ?? "",
          // Com sinal, como o extrato: pagamento sai (negativo).
          valor: p.tipo === "a_receber" ? p.valorLiquido : -p.valorLiquido,
          parcela: p,
        }),
      ),
    ...painel.transferencias
      .filter((t) => dentro(t.data))
      .map(
        (t): ItemForaDoBanco => ({
          especie: "transferencia",
          id: t.id,
          data: t.data,
          valor: t.lado === "entrada" ? t.valor : -t.valor,
          transferencia: t,
        }),
      ),
  ].sort((a, b) => a.data.localeCompare(b.data));

  return {
    casados: painel.transacoes.filter((t) => t.conciliada),
    faltamNoApp: painel.transacoes.filter((t) => !t.conciliada),
    foraDoBanco,
  };
}

/** Soma com sinal, em centavos, para não acumular erro de ponto flutuante. */
export function somar(valores: readonly number[]): number {
  return (
    valores.reduce((total, valor) => total + Math.round(valor * 100), 0) / 100
  );
}

/** Situação do mês na conta. */
export type StatusDoMes =
  /** Faltam e fora zerados e o saldo do banco bate com o do app. */
  | "conciliado"
  /** Listas zeradas, mas o saldo não bate. */
  | "falta_saldo"
  /** Listas zeradas, mas o OFX não trouxe saldo: nunca se declara fechado sozinho. */
  | "sem_saldo"
  /** Ainda tem movimento sem par em algum dos lados. */
  | "aberto";

/**
 * "Mês conciliado" só com as três condições: nada faltando no app, nada
 * sobrando no app e o saldo do banco igual ao do app. Duas listas zeradas não
 * provam nada sozinhas (dois lançamentos de mesmo valor trocados zeram as
 * duas); o saldo prova.
 */
export function statusDoMes(
  visoes: Pick<VisoesConciliacao, "faltamNoApp" | "foraDoBanco">,
  saldo: SaldoPainel | null,
): StatusDoMes {
  if (visoes.faltamNoApp.length > 0 || visoes.foraDoBanco.length > 0)
    return "aberto";
  if (!saldo || saldo.bate === null) return "sem_saldo";
  return saldo.bate ? "conciliado" : "falta_saldo";
}

/** Situação de um mês na escolha de conta. */
export interface MesDaConta {
  mes: string;
  fechado: boolean;
  pendentes: number;
}

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-09" → "set/26". */
export function mesCurto(mes: string): string {
  const [ano, m] = mes.split("-");
  return `${MESES_CURTOS[Number(m) - 1] ?? m}/${ano.slice(2)}`;
}

/**
 * A linha de status da conta na escolha: "set/26 fechado · ago/26 fechado ·
 * jul/26 12 pendentes". Mês sem pendência e sem fechamento é "aberto": falta
 * bater o saldo e fechar.
 */
export function resumoUltimosMeses(meses: readonly MesDaConta[]): string {
  return meses
    .map((m) => {
      if (m.fechado) return `${mesCurto(m.mes)} fechado`;
      if (m.pendentes > 0) return `${mesCurto(m.mes)} ${m.pendentes} ${m.pendentes === 1 ? "pendente" : "pendentes"}`;
      return `${mesCurto(m.mes)} aberto`;
    })
    .join(" · ");
}
