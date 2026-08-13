import "server-only";

import { createClient } from "@/lib/supabase/server";
import { resumirParcelas } from "@/modules/rh/adiantamentos/parcelamento";

/** Filtros opcionais da listagem de adiantamentos. */
export interface FiltrosAdiantamentos {
  /** Competência completa (yyyy-MM-01) para filtrar por mês. */
  competencia?: string;
  colaboradorId?: string;
}

/**
 * Uma parcela do plano de desconto, para a tela mostrar competência,
 * previsto, descontado e a folha que descontou. Ordenada por competência (e
 * `id` como critério de desempate): `numero` NÃO é identidade estável (é
 * recalculado a cada sobra — ver `comment on function` da `fn_gerar_folha`),
 * então não é usado nem para exibir, nem para ordenar.
 */
export interface AdiantamentoParcela {
  id: string;
  /** Competência (yyyy-MM-01). */
  competencia: string;
  valorPrevisto: number;
  valorDescontado: number;
  /**
   * Folha que processou (fechou) esta parcela, ou null se ainda está aberta.
   * Uma parcela fechada pode ter `valorDescontado = 0` (não coube nem
   * centavo naquele mês): é "processada sem descontar nada", diferente de
   * "ainda não processada" — a UI distingue os dois pelos dois campos juntos,
   * nunca só por `valorDescontado > 0`.
   */
  folhaId: string | null;
}

/** Linha da listagem de adiantamentos. */
export interface AdiantamentoLista {
  id: string;
  colaboradorId: string;
  colaboradorNome: string;
  /** Competência (yyyy-MM-01): primeiro dia do mês. */
  competencia: string;
  valor: number;
  /** Data do adiantamento (yyyy-MM-dd). */
  data: string;
  descricao: string | null;
  /**
   * True quando alguma parcela do adiantamento já foi descontada em folha:
   * linha travada (sem editar/excluir). O vínculo com a folha vive na parcela
   * (`rh_adiantamento_parcelas.folha_id`); `rh_adiantamentos.folha_id` não
   * existe mais.
   */
  naFolha: boolean;
  /** Id do lançamento a_pagar gerado na concessão, ou null (registro antigo). */
  lancamentoId: string | null;
  /** Número do lançamento (ex. LAN-2026-0001), para o link no Financeiro. */
  lancamentoNumero: string | null;
  /**
   * True quando o lançamento já tem parcela aprovada, paga ou conciliada:
   * linha travada (sem editar/excluir), mesmo fora da folha.
   */
  pagamentoComprometido: boolean;
  criadoEm: string;
  /** Plano de desconto, ordenado por competência (ver `AdiantamentoParcela`). */
  parcelas: AdiantamentoParcela[];
  /** `parcelas.length`: quantidade de linhas do plano hoje (cresce com sobra). */
  parcelasTotal: number;
  /** Quantas parcelas já foram processadas por uma folha (`folhaId` preenchido). */
  parcelasDescontadas: number;
  /**
   * Saldo em aberto: `valor - soma(valorDescontado das parcelas)`. NUNCA
   * `soma(valorPrevisto) - soma(valorDescontado)` — ver `resumirParcelas`.
   *
   * ATENÇÃO para quem chamar `listarAdiantamentos` (ou reusar `saldo`/
   * `parcelas`/`parcelasTotal`/`parcelasDescontadas`): diferente de
   * `naFolha`/`pagamentoComprometido` (que vêm de RPC security definer,
   * fail-closed), estes campos vêm de um embed comum, sujeito à RLS de
   * `rh_adiantamento_parcelas` (exige `rh.adiantamentos:ver`). Sem essa
   * permissão o embed volta vazio e `saldo` sai igual a `valor` —
   * silenciosamente otimista, não fail-closed (o tipo `number` não expressa
   * essa condição; corrigir isso de verdade exigiria uma RPC que devolva
   * `null` quando falta a permissão, virando `saldo: number | null` — não
   * feito ainda, é item de backlog).
   *
   * Os dois chamadores hoje CHECAM `rh.adiantamentos:ver` antes de ler estes
   * campos: a tela de adiantamentos (`app/(app)/rh/adiantamentos/page.tsx`) e
   * a ficha do colaborador (`resumoAdiantamentos` em
   * `cadastros/colaboradores/ficha.ts`, só chamada quando
   * `app/(app)/cadastros/colaboradores/[id]/page.tsx` já verificou
   * `podeAdiantamentos`). Qualquer chamador NOVO precisa fazer o mesmo antes
   * de confiar nestes campos — a RLS não faz essa garantia sozinha aqui.
   */
  saldo: number;
}

/**
 * Lista adiantamentos com o nome do colaborador e a flag `naFolha`, ordenados
 * por competência (desc) e por criação (desc). Os filtros são opcionais: o
 * filtro fino é feito no client, mas a query aceita competência e colaborador.
 */
export async function listarAdiantamentos(
  filtros: FiltrosAdiantamentos = {},
): Promise<AdiantamentoLista[]> {
  const supabase = await createClient();

  let consulta = supabase
    .from("rh_adiantamentos")
    .select(
      `id, colaborador_id, competencia, valor, data, descricao, lancamento_id,
       created_at, colaboradores(nome), lancamentos(numero),
       rh_adiantamento_parcelas(id, competencia, valor_previsto, valor_descontado, folha_id)`,
    )
    .order("competencia", { ascending: false })
    .order("created_at", { ascending: false });

  if (filtros.competencia) {
    consulta = consulta.eq("competencia", filtros.competencia);
  }
  if (filtros.colaboradorId) {
    consulta = consulta.eq("colaborador_id", filtros.colaboradorId);
  }

  const { data, error } = await consulta;

  if (error) {
    throw new Error("Não foi possível carregar os adiantamentos");
  }

  const linhas = data ?? [];

  // Checa o pagamento em lote (1 RPC, não 1 por linha): security definer
  // porque um perfil só-rh.adiantamentos não enxerga lancamento_parcelas /
  // extrato_transacoes pela RLS.
  const idsLancamento = linhas
    .map((linha) => linha.lancamento_id)
    .filter((id): id is string => id !== null);

  let comprometidos = new Set<string>();
  if (idsLancamento.length > 0) {
    const { data: idsComprometidos, error: erroComprometidos } =
      await supabase.rpc("fn_adiantamentos_comprometidos", {
        p_lancamento_ids: idsLancamento,
      });
    if (erroComprometidos) {
      throw new Error("Não foi possível conferir o pagamento dos adiantamentos");
    }
    comprometidos = new Set(idsComprometidos ?? []);
  }

  // `naFolha` também em lote, e também por RPC definer: a policy de select de
  // rh_adiantamento_parcelas exige rh.adiantamentos:ver, então um perfil sem
  // `ver` leria vazio e a listagem mostraria como editável um adiantamento já
  // descontado. A função é fail-closed: sem permissão devolve todos os ids.
  let emFolha = new Set<string>();
  if (linhas.length > 0) {
    const { data: idsEmFolha, error: erroEmFolha } = await supabase.rpc(
      "fn_adiantamentos_em_folha",
      { p_adiantamento_ids: linhas.map((linha) => linha.id) },
    );
    if (erroEmFolha) {
      throw new Error(
        "Não foi possível conferir se os adiantamentos já entraram em folha",
      );
    }
    emFolha = new Set(idsEmFolha ?? []);
  }

  return linhas.map((linha) => {
    // Ordem por competência (e id como desempate), nunca por `numero`: ver o
    // comentário de `AdiantamentoParcela`. Duas parcelas podem coexistir na
    // mesma competência (plano + sobra empurrada), e a ordenação por id
    // desempata as duas de forma estável, sem depender de `numero`.
    const parcelas: AdiantamentoParcela[] = (linha.rh_adiantamento_parcelas ?? [])
      .map((parcela) => ({
        id: parcela.id,
        competencia: parcela.competencia,
        valorPrevisto: parcela.valor_previsto,
        valorDescontado: parcela.valor_descontado,
        folhaId: parcela.folha_id,
      }))
      .sort((a, b) =>
        a.competencia === b.competencia
          ? a.id.localeCompare(b.id)
          : a.competencia.localeCompare(b.competencia),
      );

    // Uma leitura só: plano e saldo vêm do MESMO embed acima, agregados aqui
    // pela função pura `resumirParcelas` — não uma consulta de contagem e
    // outra de soma.
    const resumo = resumirParcelas(linha.valor, parcelas);

    return {
      id: linha.id,
      colaboradorId: linha.colaborador_id,
      colaboradorNome: linha.colaboradores?.nome ?? "",
      competencia: linha.competencia,
      valor: linha.valor,
      data: linha.data,
      descricao: linha.descricao,
      naFolha: emFolha.has(linha.id),
      lancamentoId: linha.lancamento_id,
      lancamentoNumero: linha.lancamentos?.numero ?? null,
      pagamentoComprometido: linha.lancamento_id
        ? comprometidos.has(linha.lancamento_id)
        : false,
      criadoEm: linha.created_at,
      parcelas,
      parcelasTotal: resumo.parcelasTotal,
      parcelasDescontadas: resumo.parcelasDescontadas,
      saldo: resumo.saldo,
    };
  });
}
