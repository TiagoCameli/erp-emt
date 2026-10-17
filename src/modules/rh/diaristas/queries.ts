import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  situacaoDaDiaria,
  type SituacaoDiaria,
} from "@/modules/rh/diaristas/situacao";

/** Filtros opcionais da listagem de diárias. */
export interface FiltrosDiarias {
  /** Competência completa (yyyy-MM-01) para filtrar por mês. */
  competencia?: string;
  colaboradorId?: string;
}

/** Uma linha do rateio da diária: obra (ou centro raiz) e percentual. */
export interface RateioDiaria {
  centroCustoId: string;
  /** Nome do centro raiz (o da obra é o nome da obra). */
  nome: string;
  percentual: number;
}

/** Linha da listagem de diárias. */
export interface DiariaLista {
  id: string;
  colaboradorId: string;
  colaboradorNome: string;
  /** Obra principal (a da linha de maior percentual). Derivada no banco. */
  obraId: string | null;
  obraNome: string | null;
  obraLote: string | null;
  /** Rateio por obra, maior percentual primeiro. Vazio só se o banco falhar. */
  rateio: RateioDiaria[];
  /** Início do período, ou o dia da diária antiga (yyyy-MM-dd). */
  data: string;
  /** Fim do período (yyyy-MM-dd). Null nas diárias antigas, de um dia. */
  dataFim: string | null;
  funcaoId: string | null;
  funcaoNome: string | null;
  /** Valor de uma diária integral. Null nas antigas. */
  valorDiaria: number | null;
  /** Quantidade de diárias do período. Null nas antigas. */
  qtdDiarias: number | null;
  diasMeia: string[];
  diasFalta: string[];
  /** Competência (yyyy-MM-01): primeiro dia do mês. */
  competencia: string;
  valor: number;
  observacao: string | null;
  /** Id do lançamento a pagar, ou null se ainda em aberto. */
  lancamentoId: string | null;
  /** True quando já fechada (virou lançamento a pagar). */
  fechada: boolean;
  /** Em aberto, fechada (a pagar) ou paga. Ver `situacaoDaDiaria`. */
  situacao: SituacaoDiaria;
  /** Dá para editar ou excluir (só esconde o menu; o banco decide). */
  alteravel: boolean;
}

/**
 * Lista diárias com o nome do diarista, a obra e a flag `fechada` (lançamento
 * setado), ordenadas por data (desc). Os filtros são opcionais: a busca fina é
 * no client, mas a query aceita competência e colaborador.
 */
export async function listarDiarias(
  filtros: FiltrosDiarias = {},
): Promise<DiariaLista[]> {
  const supabase = await createClient();

  let consulta = supabase
    .from("rh_diarias")
    .select(
      "id, colaborador_id, obra_id, data, data_fim, funcao_id, valor_diaria, qtd_diarias, dias_meia, dias_falta, competencia, valor, observacao, lancamento_id, folha_id, colaboradores(nome), obras(nome, lote), rh_diaria_rateios(centro_custo_id, percentual)",
    )
    .order("data", { ascending: false });

  if (filtros.competencia) {
    consulta = consulta.eq("competencia", filtros.competencia);
  }
  if (filtros.colaboradorId) {
    consulta = consulta.eq("colaborador_id", filtros.colaboradorId);
  }

  // O status das parcelas vem por RPC: o RLS do lançamento é do Financeiro, e
  // quem é só do RH não o enxerga (ver `fn_diarias_status_parcelas`).
  // O nome da função também vem por RPC: o catálogo `funcoes` só abre para
  // quem tem Cadastros (ver `fn_diaria_funcoes`).
  // O nome do centro do rateio também: `centros_custo` não abre para o RH
  // (ver `fn_diaria_centros`).
  const [{ data, error }, status, funcoes, centros] = await Promise.all([
    consulta,
    supabase.rpc("fn_diarias_status_parcelas"),
    supabase.rpc("fn_diaria_funcoes"),
    supabase.rpc("fn_diaria_centros"),
  ]);

  if (error || status.error || funcoes.error || centros.error) {
    throw new Error("Não foi possível carregar as diárias");
  }

  const nomeDoCentro = new Map(
    (centros.data ?? []).map((c) => [c.id, c.nome]),
  );

  const nomeDaFuncao = new Map((funcoes.data ?? []).map((f) => [f.id, f.nome]));
  const parcelasPorLancamento = new Map(
    (status.data ?? []).map((linha) => [linha.lancamento_id, linha.status]),
  );

  return (data ?? []).map((linha) => ({
    id: linha.id,
    colaboradorId: linha.colaborador_id,
    colaboradorNome: linha.colaboradores?.nome ?? "",
    obraId: linha.obra_id,
    obraNome: linha.obras?.nome ?? null,
    obraLote: linha.obras?.lote ?? null,
    rateio: (linha.rh_diaria_rateios ?? [])
      .map((r) => ({
        centroCustoId: r.centro_custo_id,
        nome: nomeDoCentro.get(r.centro_custo_id) ?? "",
        percentual: r.percentual,
      }))
      // Mesma ordem do banco: maior percentual, depois menor id.
      .sort(
        (a, b) =>
          b.percentual - a.percentual ||
          a.centroCustoId.localeCompare(b.centroCustoId),
      ),
    data: linha.data,
    dataFim: linha.data_fim,
    funcaoId: linha.funcao_id,
    funcaoNome: linha.funcao_id
      ? (nomeDaFuncao.get(linha.funcao_id) ?? null)
      : null,
    valorDiaria: linha.valor_diaria,
    qtdDiarias: linha.qtd_diarias,
    diasMeia: linha.dias_meia,
    diasFalta: linha.dias_falta,
    competencia: linha.competencia,
    valor: linha.valor,
    observacao: linha.observacao,
    lancamentoId: linha.lancamento_id,
    fechada: linha.lancamento_id !== null,
    ...situacaoDaDiaria({
      lancamentoId: linha.lancamento_id,
      folhaId: linha.folha_id,
      statusParcelas: linha.lancamento_id
        ? (parcelasPorLancamento.get(linha.lancamento_id) ?? [])
        : [],
    }),
  }));
}

/** Fechamento pendente: diárias em aberto agregadas por colaborador+competência. */
export interface FechamentoPendente {
  colaboradorId: string;
  colaboradorNome: string;
  /** Competência (yyyy-MM-01): primeiro dia do mês. */
  competencia: string;
  qtdDiarias: number;
  total: number;
}

/**
 * Agrega as diárias EM ABERTO (lancamento_id null) por colaborador+competência.
 * Alimenta o painel "A fechar": cada item vira UM lançamento a pagar ao fechar.
 * Ordenado por competência (desc) e nome do diarista (asc).
 */
export async function listarFechamentosPendentes(
  competencia?: string,
): Promise<FechamentoPendente[]> {
  const supabase = await createClient();

  let consulta = supabase
    .from("rh_diarias")
    .select("colaborador_id, competencia, valor, colaboradores(nome)")
    .is("lancamento_id", null);

  if (competencia) {
    consulta = consulta.eq("competencia", competencia);
  }

  const { data, error } = await consulta;

  if (error) {
    throw new Error("Não foi possível carregar os fechamentos pendentes");
  }

  const grupos = new Map<string, FechamentoPendente>();

  for (const linha of data ?? []) {
    const chave = `${linha.colaborador_id}|${linha.competencia}`;
    const grupo = grupos.get(chave);
    if (grupo) {
      grupo.qtdDiarias += 1;
      grupo.total += linha.valor;
    } else {
      grupos.set(chave, {
        colaboradorId: linha.colaborador_id,
        colaboradorNome: linha.colaboradores?.nome ?? "",
        competencia: linha.competencia,
        qtdDiarias: 1,
        total: linha.valor,
      });
    }
  }

  return [...grupos.values()].sort((a, b) => {
    const porCompetencia = b.competencia.localeCompare(a.competencia);
    if (porCompetencia !== 0) return porCompetencia;
    return a.colaboradorNome.localeCompare(b.colaboradorNome, "pt-BR");
  });
}

/** Função do catálogo com o último valor de diária (null se nunca teve). */
export interface FuncaoDiaria {
  id: string;
  nome: string;
  valor: number | null;
  /** Quando o valor mudou pela última vez (ISO). */
  atualizadoEm: string | null;
  /** Diária de onde veio o valor; null se veio da criação da função. */
  diariaId: string | null;
}

/**
 * Funções ativas com o último valor de diária, pela `fn_diaria_funcoes` (o
 * catálogo só abre para Cadastros). Alimenta o seletor do formulário e a
 * tabela "Valores por função".
 */
export async function listarFuncoesDiaria(): Promise<FuncaoDiaria[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_diaria_funcoes");
  if (error) throw new Error("Não foi possível carregar as funções");
  return (data ?? []).map((f) => ({
    id: f.id,
    nome: f.nome,
    valor: f.valor,
    atualizadoEm: f.atualizado_em,
    diariaId: f.diaria_id,
  }));
}

/** Obra ou centro raiz que a diária aceita no rateio. */
export interface CentroDiaria {
  id: string;
  nome: string;
  /** "obra" | "escritorio" | "manutencao" */
  tipo: string;
  obraId: string | null;
  /** Inativo continua na lista para dar nome à diária antiga; o formulário não oferece. */
  ativo: boolean;
}

/**
 * Obras (pelo centro raiz delas), Escritório Central e Manutenção, pela
 * `fn_diaria_centros`. Alimenta o rateio do formulário e o filtro de obra.
 */
export async function listarCentrosDiaria(): Promise<CentroDiaria[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_diaria_centros");
  if (error) throw new Error("Não foi possível carregar as obras");
  return (data ?? []).map((c) => ({
    id: c.id,
    nome: c.nome,
    tipo: c.tipo,
    obraId: c.obra_id,
    ativo: c.ativo,
  }));
}
