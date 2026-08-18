import type { EventoTrilha, TipoEventoTrilha } from "@/components/canonicos";
import { formatarData } from "@/lib/formatadores";
import { emLotes, LOTE_IDS_POSTGREST } from "@/lib/lotes-de-ids";
import { createClient } from "@/lib/supabase/server";
import type {
  StatusLancamento,
  StatusParcela,
  TipoLancamento,
} from "@/modules/financeiro/_shared/formato";

export interface EspelhoPagamentoRateio {
  centroNome: string;
  centroCodigo: string | null;
  valor: number;
}

export interface EspelhoPagamento {
  /** Id da PARCELA: é ele que a rota recebe. */
  id: string;
  /** "LAN-2026-0001 parcela 2". Vai no cabeçalho do papel. */
  titulo: string;
  numeroParcela: number;
  dataVencimento: string | null;
  valor: number;
  desconto: number;
  juros: number;
  /** valor - desconto + juros: o que de fato saiu da conta. */
  valorLiquido: number;
  status: StatusParcela;
  dataPagamento: string | null;
  contaNome: string | null;
  /** O lançamento pai, achatado: o papel imprime tudo em um bloco. */
  lancamentoId: string | null;
  lancamentoNumero: string | null;
  lancamentoDescricao: string | null;
  lancamentoValor: number;
  lancamentoStatus: StatusLancamento | null;
  /**
   * Necessário para o rótulo do status do lançamento:
   * `rotuloStatusLancamento(status, tipo)` inverte "a_pagar" para "A receber"
   * quando o lançamento é a receber. Sem o tipo, um recebível em aberto
   * imprimiria o código cru e, pior, de trás para frente (parece uma dívida a
   * pagar quando é dinheiro a receber) — num papel que vai para contador ou
   * processo.
   */
  lancamentoTipo: TipoLancamento | null;
  lancamentoObservacoes: string | null;
  mesCompetencia: string | null;
  fornecedorNome: string | null;
  categoriaNome: string | null;
  formaPagamentoNome: string | null;
  rateios: EspelhoPagamentoRateio[];
}

/** A linha crua do PostgREST. `numeric` chega como string. */
export interface LinhaEspelhoPagamento {
  id: string;
  numero_parcela: number;
  data_vencimento: string | null;
  valor: string | number;
  desconto: string | number | null;
  juros: string | number | null;
  valor_liquido: string | number;
  status: string;
  data_pagamento: string | null;
  contas_bancarias: { nome: string } | null;
  lancamentos: {
    id: string;
    numero: string | null;
    descricao: string | null;
    valor: string | number;
    status: string;
    /** Cru do banco (texto); vira `TipoLancamento` na montagem. */
    tipo: string;
    mes_competencia: string | null;
    observacoes: string | null;
    fornecedores: { razao_social: string } | null;
    categorias_financeiras: { nome: string } | null;
    formas_pagamento: { nome: string } | null;
    lancamento_rateios: {
      valor: string | number;
      centros_custo: { nome: string; codigo: string | null } | null;
    }[];
  } | null;
}

/** Conversão única de dinheiro: sobre o texto exato que o banco mandou. */
function dinheiro(valor: string | number | null | undefined): number {
  return Number(valor ?? 0);
}

/**
 * Monta o espelho do pagamento. Pura, testável sem banco.
 *
 * Achata o lançamento pai para o topo: a página imprime parcela e lançamento em
 * um bloco só, e navegar dois níveis de objeto dentro do JSX daria linha
 * ilegível e um `?.` em cada campo.
 */
export function montarEspelhoPagamento(
  linha: LinhaEspelhoPagamento,
): EspelhoPagamento {
  const pai = linha.lancamentos;
  return {
    id: linha.id,
    titulo: `${pai?.numero ?? "sem número"} parcela ${linha.numero_parcela}`,
    numeroParcela: linha.numero_parcela,
    dataVencimento: linha.data_vencimento,
    valor: dinheiro(linha.valor),
    desconto: dinheiro(linha.desconto),
    juros: dinheiro(linha.juros),
    valorLiquido: dinheiro(linha.valor_liquido),
    status: linha.status as StatusParcela,
    dataPagamento: linha.data_pagamento,
    contaNome: linha.contas_bancarias?.nome ?? null,
    lancamentoId: pai?.id ?? null,
    lancamentoNumero: pai?.numero ?? null,
    lancamentoDescricao: pai?.descricao ?? null,
    lancamentoValor: dinheiro(pai?.valor),
    lancamentoStatus: pai ? (pai.status as StatusLancamento) : null,
    lancamentoTipo: pai ? (pai.tipo as TipoLancamento) : null,
    lancamentoObservacoes: pai?.observacoes ?? null,
    mesCompetencia: pai?.mes_competencia ?? null,
    fornecedorNome: pai?.fornecedores?.razao_social ?? null,
    categoriaNome: pai?.categorias_financeiras?.nome ?? null,
    formaPagamentoNome: pai?.formas_pagamento?.nome ?? null,
    rateios: (pai?.lancamento_rateios ?? []).map((rateio) => ({
      // "Sem centro de custo", igual ao fallback do espelho de lançamento e do
      // de OC: os três descrevem a mesma ausência e não podem divergir entre si.
      centroNome: rateio.centros_custo?.nome ?? "Sem centro de custo",
      centroCodigo: rateio.centros_custo?.codigo ?? null,
      valor: dinheiro(rateio.valor),
    })),
  };
}

/**
 * Busca os pagamentos para o espelho, na ordem em que os ids vieram.
 *
 * Parte de `lancamento_parcelas` e SOBE para o pai, porque é a parcela que o
 * usuário marcou na listagem. Em lotes de LOTE_IDS_POSTGREST: `in` vai na query
 * string de um GET. Parcela que a RLS não deixa ver não volta, e quem chama
 * conta a diferença.
 */
export async function buscarPagamentosParaEspelho(
  ids: string[],
): Promise<EspelhoPagamento[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();

  const linhas: LinhaEspelhoPagamento[] = [];
  for (const lote of emLotes(ids, LOTE_IDS_POSTGREST)) {
    const { data, error } = await supabase
      .from("lancamento_parcelas")
      .select(
        `id, numero_parcela, data_vencimento, valor, desconto, juros,
         valor_liquido, status, data_pagamento,
         contas_bancarias(nome),
         lancamentos(id, numero, tipo, descricao, valor, status, mes_competencia,
           observacoes,
           fornecedores(razao_social),
           categorias_financeiras(nome),
           formas_pagamento(nome),
           lancamento_rateios(valor, centros_custo(nome, codigo)))`,
      )
      .in("id", lote);

    if (error) {
      throw new Error(
        `Não foi possível carregar o espelho do pagamento: ${error.message}`,
      );
    }
    linhas.push(...((data ?? []) as unknown as LinhaEspelhoPagamento[]));
  }

  const porId = new Map(
    linhas.map((linha) => [linha.id, montarEspelhoPagamento(linha)]),
  );
  return ids
    .map((id) => porId.get(id))
    .filter((espelho): espelho is EspelhoPagamento => espelho !== undefined);
}

/**
 * Rótulo de evento de parcela e o tipo canônico da Trilha para a cor do ponto.
 *
 * Os valores de `tipo` são os que o CHECK de `parcela_eventos` realmente aceita
 * (conferido em supabase/migrations/20260730120001_revisao_e_janela_pagamento.sql,
 * linha 91): 'aprovou', 'revisou', 'reenviou', 'desaprovou', 'reprogramou'. Não
 * existe evento de 'pagamento' nesta tabela — `fn_pagar_parcela` só atualiza a
 * parcela e propaga os anexos, sem gravar trilha própria —, então quem lê aqui
 * já tem a data e o status de pagamento na própria `EspelhoPagamento`.
 */
const EVENTO_PARCELA: Record<string, { titulo: string; tipo: TipoEventoTrilha }> = {
  aprovou: { titulo: "Aprovada", tipo: "aprovacao" },
  revisou: { titulo: "Enviada para revisão", tipo: "edicao" },
  reenviou: { titulo: "Reenviada para aprovação", tipo: "edicao" },
  desaprovou: { titulo: "Desaprovada", tipo: "desaprovacao" },
  reprogramou: { titulo: "Data reprogramada", tipo: "edicao" },
};

/**
 * Trilha de várias parcelas de uma vez, agrupada por id de parcela.
 *
 * Não existia trilha de parcela no projeto (há de OC, cotação, folha e
 * lançamento). Nasce aqui em versão de N ids porque o espelho imprime vários
 * pagamentos, e uma consulta por parcela seria uma ida ao banco por folha.
 *
 * `tipo` desconhecido cai no próprio texto do banco em vez de sumir: no papel,
 * evento sem rótulo é melhor que evento invisível.
 */
export async function trilhaDeParcelas(
  ids: string[],
): Promise<Record<string, EventoTrilha[]>> {
  if (ids.length === 0) return {};
  const supabase = await createClient();

  const porParcela: Record<string, EventoTrilha[]> = {};
  for (const lote of emLotes(ids, LOTE_IDS_POSTGREST)) {
    const { data, error } = await supabase
      .from("parcela_eventos")
      .select("id, parcela_id, tipo, motivo, data_de, data_para, created_at")
      .in("parcela_id", lote)
      .order("created_at", { ascending: true });

    // Trilha ausente não derruba o espelho: o documento vale sem ela, e um
    // erro aqui não pode impedir de imprimir o comprovante do pagamento.
    if (error || !data) continue;

    for (const evento of data) {
      const reprogramacao =
        evento.data_de && evento.data_para
          ? `de ${formatarData(evento.data_de)} para ${formatarData(evento.data_para)}`
          : null;
      const rotulo = EVENTO_PARCELA[evento.tipo];
      (porParcela[evento.parcela_id] ??= []).push({
        id: evento.id,
        data: evento.created_at,
        titulo: rotulo?.titulo ?? evento.tipo,
        descricao:
          [evento.motivo, reprogramacao].filter(Boolean).join(" — ") ||
          undefined,
        tipo: rotulo?.tipo ?? "outro",
      });
    }
  }
  return porParcela;
}
