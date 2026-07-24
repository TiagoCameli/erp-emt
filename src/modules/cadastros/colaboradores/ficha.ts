import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  TipoConta,
  Vinculo,
} from "@/modules/cadastros/colaboradores/schemas";
import { listarDocumentos } from "@/modules/rh/documentos/queries";
import type { DocumentoLista } from "@/modules/rh/documentos/queries";
import { listarFerias } from "@/modules/rh/ferias/queries";
import type { FeriasLista } from "@/modules/rh/ferias/queries";
import type { TipoOcorrencia } from "@/modules/rh/ocorrencias/schemas";
import type {
  StatusPonto,
  TipoApontamento,
} from "@/modules/rh/_shared/formato";

/**
 * Queries de resumo por colaborador para a ficha unificada (#13). Cada uma é
 * enxuta: últimos N registros (ordenados) + contagem/alerta, nunca a listagem
 * inteira. Ponto e diárias são lançamentos de alta frequência (diários), por
 * isso usam LIMIT no banco; as demais fontes (férias, documentos, EPI,
 * ocorrências, adiantamentos) já são naturalmente pequenas por colaborador e
 * reaproveitam a query filtrada do módulo de origem, evitando duplicar regra
 * de vencimento/situação (ferias/queries.ts, documentos/queries.ts).
 */

/** Quantos itens recentes cada bloco da ficha traz. */
const LIMITE_RECENTES = 5;

/** Dados do colaborador para o cabeçalho da ficha (mesmo shape da listagem). */
export interface ColaboradorFicha {
  id: string;
  nome: string;
  cpf: string | null;
  funcao: string | null;
  vinculo: Vinculo;
  obraId: string | null;
  obraNome: string | null;
  obraLote: string | null;
  centroCustoId: string | null;
  centroCustoNome: string | null;
  dataAdmissao: string | null;
  telefone: string | null;
  ativo: boolean;
  salario: number | null;
  valorDiaria: number | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  tipoConta: TipoConta | null;
  chavePix: string | null;
}

/** Busca o colaborador para o cabeçalho da ficha. Retorna null se não achar. */
export async function buscarColaboradorFicha(
  id: string,
): Promise<ColaboradorFicha | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("colaboradores")
    .select(
      "id, nome, cpf, funcao, vinculo, obra_id, centro_custo_id, data_admissao, telefone, ativo, salario, valor_diaria, banco, agencia, conta, tipo_conta, chave_pix, obras(nome, lote), centros_custo(nome)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    nome: data.nome,
    cpf: data.cpf,
    funcao: data.funcao,
    vinculo: data.vinculo as Vinculo,
    obraId: data.obra_id,
    obraNome: data.obras?.nome ?? null,
    obraLote: data.obras?.lote ?? null,
    centroCustoId: data.centro_custo_id,
    centroCustoNome: data.centros_custo?.nome ?? null,
    dataAdmissao: data.data_admissao,
    telefone: data.telefone,
    ativo: data.ativo,
    salario: data.salario,
    valorDiaria: data.valor_diaria,
    banco: data.banco,
    agencia: data.agencia,
    conta: data.conta,
    tipoConta: data.tipo_conta as TipoConta | null,
    chavePix: data.chave_pix,
  };
}

/** Item recente de ponto (apontamento do dia + dados do dia). */
export interface FichaPontoItem {
  pontoId: string;
  data: string;
  obraNome: string;
  status: StatusPonto;
  tipo: TipoApontamento;
  horasNormais: number;
  horasExtras: number;
}

export interface FichaPonto {
  itens: FichaPontoItem[];
  totalRegistros: number;
}

/**
 * Últimos apontamentos do colaborador (ponto é lançamento diário, então usa
 * LIMIT no banco) + contagem total via count exato sem trazer linhas.
 */
export async function resumoPonto(colaboradorId: string): Promise<FichaPonto> {
  const supabase = await createClient();

  const [{ data, error }, { count, error: erroContagem }] = await Promise.all([
    supabase
      .from("rh_apontamentos")
      .select(
        "horas_normais, horas_extras, tipo, rh_pontos(id, data, status, obras(nome))",
      )
      .eq("colaborador_id", colaboradorId)
      .order("created_at", { ascending: false })
      .limit(LIMITE_RECENTES),
    supabase
      .from("rh_apontamentos")
      .select("id", { count: "exact", head: true })
      .eq("colaborador_id", colaboradorId),
  ]);

  if (error || erroContagem) {
    throw new Error("Não foi possível carregar o ponto do colaborador");
  }

  const itens: FichaPontoItem[] = (data ?? [])
    .filter((linha) => linha.rh_pontos !== null)
    .map((linha) => {
      const ponto = linha.rh_pontos!;
      return {
        pontoId: ponto.id,
        data: ponto.data,
        obraNome: ponto.obras?.nome ?? "-",
        status: ponto.status as StatusPonto,
        tipo: linha.tipo as TipoApontamento,
        horasNormais: linha.horas_normais,
        horasExtras: linha.horas_extras,
      };
    });

  return { itens, totalRegistros: count ?? 0 };
}

export interface FichaFerias {
  itens: FeriasLista[];
  vencidas: number;
  aVencer: number;
}

/**
 * Férias do colaborador (reaproveita `listarFerias` filtrada, que já calcula
 * a situação de vencimento). Por colaborador o total é sempre pequeno
 * (~1 período aquisitivo/ano), então os 5 mais urgentes (ordenados por limite
 * de gozo) bastam de itens; os contadores vêm da mesma leitura filtrada.
 */
export async function resumoFerias(colaboradorId: string): Promise<FichaFerias> {
  const todas = await listarFerias({ colaboradorId });

  return {
    itens: todas.slice(0, LIMITE_RECENTES),
    vencidas: todas.filter((item) => item.situacao === "vencida").length,
    aVencer: todas.filter((item) => item.situacao === "a_vencer").length,
  };
}

export interface FichaDocumentos {
  itens: DocumentoLista[];
  vencidos: number;
  aVencer: number;
}

/**
 * Documentos/ASO do colaborador (reaproveita `listarDocumentos` filtrada, que
 * já calcula a situação de vencimento). Volume por colaborador é pequeno.
 */
export async function resumoDocumentos(
  colaboradorId: string,
): Promise<FichaDocumentos> {
  const todos = await listarDocumentos({ colaboradorId });

  return {
    itens: todos.slice(0, LIMITE_RECENTES),
    vencidos: todos.filter((item) => item.situacao === "vencido").length,
    aVencer: todos.filter((item) => item.situacao === "a_vencer").length,
  };
}

export interface FichaEpiItem {
  id: string;
  descricao: string;
  ca: string | null;
  quantidade: number;
  dataEntrega: string;
  dataDevolucao: string | null;
}

export interface FichaEpis {
  itens: FichaEpiItem[];
  pendentesDevolucao: number;
}

/**
 * Últimas entregas de EPI do colaborador + contagem dos ainda pendentes de
 * devolução (data_devolucao nula), via count exato sem trazer linhas.
 */
export async function resumoEpis(colaboradorId: string): Promise<FichaEpis> {
  const supabase = await createClient();

  const [{ data, error }, { count, error: erroPendentes }] = await Promise.all([
    supabase
      .from("rh_epis")
      .select("id, descricao, ca, quantidade, data_entrega, data_devolucao")
      .eq("colaborador_id", colaboradorId)
      .order("data_entrega", { ascending: false })
      .limit(LIMITE_RECENTES),
    supabase
      .from("rh_epis")
      .select("id", { count: "exact", head: true })
      .eq("colaborador_id", colaboradorId)
      .is("data_devolucao", null),
  ]);

  if (error || erroPendentes) {
    throw new Error("Não foi possível carregar os EPIs do colaborador");
  }

  return {
    itens: (data ?? []).map((linha) => ({
      id: linha.id,
      descricao: linha.descricao,
      ca: linha.ca,
      quantidade: linha.quantidade,
      dataEntrega: linha.data_entrega,
      dataDevolucao: linha.data_devolucao,
    })),
    pendentesDevolucao: count ?? 0,
  };
}

export interface FichaOcorrenciaItem {
  id: string;
  data: string;
  tipo: TipoOcorrencia;
  descricao: string;
}

export interface FichaOcorrencias {
  itens: FichaOcorrenciaItem[];
  totalRegistros: number;
}

/** Últimas ocorrências do colaborador + contagem total (count exato). */
export async function resumoOcorrencias(
  colaboradorId: string,
): Promise<FichaOcorrencias> {
  const supabase = await createClient();

  const [{ data, error }, { count, error: erroContagem }] = await Promise.all([
    supabase
      .from("rh_ocorrencias")
      .select("id, data, tipo, descricao")
      .eq("colaborador_id", colaboradorId)
      .order("data", { ascending: false })
      .limit(LIMITE_RECENTES),
    supabase
      .from("rh_ocorrencias")
      .select("id", { count: "exact", head: true })
      .eq("colaborador_id", colaboradorId),
  ]);

  if (error || erroContagem) {
    throw new Error("Não foi possível carregar as ocorrências do colaborador");
  }

  return {
    itens: (data ?? []).map((linha) => ({
      id: linha.id,
      data: linha.data,
      tipo: linha.tipo as TipoOcorrencia,
      descricao: linha.descricao,
    })),
    totalRegistros: count ?? 0,
  };
}

export interface FichaAdiantamentoItem {
  id: string;
  competencia: string;
  data: string;
  valor: number;
  naFolha: boolean;
}

export interface FichaAdiantamentos {
  itens: FichaAdiantamentoItem[];
  qtdEmAberto: number;
  totalEmAberto: number;
}

/**
 * Últimos adiantamentos do colaborador + total em aberto (folha_id nulo:
 * ainda não entrou em nenhuma folha). A soma dos em aberto exige as linhas
 * (não dá para agregar SUM no PostgREST), mas o conjunto em aberto é sempre
 * pequeno (só a competência corrente costuma estar sem folha fechada).
 */
export async function resumoAdiantamentos(
  colaboradorId: string,
): Promise<FichaAdiantamentos> {
  const supabase = await createClient();

  const [{ data, error }, { data: abertos, error: erroAbertos }] =
    await Promise.all([
      supabase
        .from("rh_adiantamentos")
        .select("id, competencia, data, valor, folha_id")
        .eq("colaborador_id", colaboradorId)
        .order("competencia", { ascending: false })
        .order("data", { ascending: false })
        .limit(LIMITE_RECENTES),
      supabase
        .from("rh_adiantamentos")
        .select("valor")
        .eq("colaborador_id", colaboradorId)
        .is("folha_id", null),
    ]);

  if (error || erroAbertos) {
    throw new Error("Não foi possível carregar os adiantamentos do colaborador");
  }

  return {
    itens: (data ?? []).map((linha) => ({
      id: linha.id,
      competencia: linha.competencia,
      data: linha.data,
      valor: linha.valor,
      naFolha: linha.folha_id !== null,
    })),
    qtdEmAberto: (abertos ?? []).length,
    totalEmAberto: (abertos ?? []).reduce((soma, linha) => soma + linha.valor, 0),
  };
}

export interface FichaDiariaItem {
  id: string;
  data: string;
  obraNome: string | null;
  valor: number;
  fechada: boolean;
}

export interface FichaDiarias {
  itens: FichaDiariaItem[];
  qtdEmAberto: number;
  totalEmAberto: number;
}

/**
 * Últimas diárias do colaborador (lançamento diário, por isso LIMIT no banco)
 * + total em aberto (lancamento_id nulo: ainda não fechada num pagamento).
 */
export async function resumoDiarias(
  colaboradorId: string,
): Promise<FichaDiarias> {
  const supabase = await createClient();

  const [{ data, error }, { data: abertas, error: erroAbertas }] =
    await Promise.all([
      supabase
        .from("rh_diarias")
        .select("id, data, valor, lancamento_id, obras(nome)")
        .eq("colaborador_id", colaboradorId)
        .order("data", { ascending: false })
        .limit(LIMITE_RECENTES),
      supabase
        .from("rh_diarias")
        .select("valor")
        .eq("colaborador_id", colaboradorId)
        .is("lancamento_id", null),
    ]);

  if (error || erroAbertas) {
    throw new Error("Não foi possível carregar as diárias do colaborador");
  }

  return {
    itens: (data ?? []).map((linha) => ({
      id: linha.id,
      data: linha.data,
      obraNome: linha.obras?.nome ?? null,
      valor: linha.valor,
      fechada: linha.lancamento_id !== null,
    })),
    qtdEmAberto: (abertas ?? []).length,
    totalEmAberto: (abertas ?? []).reduce((soma, linha) => soma + linha.valor, 0),
  };
}
