import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  CnhCategoria,
  Escolaridade,
  EstadoCivil,
  RacaCor,
  TipoConta,
  Vinculo,
} from "@/modules/cadastros/colaboradores/schemas";
import { listarAdiantamentos } from "@/modules/rh/adiantamentos/queries";
import type { AdiantamentoLista } from "@/modules/rh/adiantamentos/queries";
import { listarDocumentos } from "@/modules/rh/documentos/queries";
import type { DocumentoLista } from "@/modules/rh/documentos/queries";
import { listarEpis } from "@/modules/rh/epis/queries";
import type { EpiLista } from "@/modules/rh/epis/queries";
import { listarFerias } from "@/modules/rh/ferias/queries";
import type { FeriasLista } from "@/modules/rh/ferias/queries";
import { listarOcorrencias } from "@/modules/rh/ocorrencias/queries";
import type { OcorrenciaLista } from "@/modules/rh/ocorrencias/queries";
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
 * de vencimento/situação/flag (ferias/queries.ts, documentos/queries.ts,
 * epis/queries.ts, ocorrencias/queries.ts, adiantamentos/queries.ts).
 */

/** Quantos itens recentes cada bloco da ficha traz. */
const LIMITE_RECENTES = 5;

/** Dados do colaborador para o cabeçalho da ficha (mesmo shape da listagem). */
export interface ColaboradorFicha {
  id: string;
  nome: string;
  cpf: string | null;
  funcaoId: string | null;
  /** Nome da função, vindo do join com `funcoes` (Bloco 3, Task 3). */
  funcao: string | null;
  /** Salário base cadastrado na função. */
  funcaoSalarioBase: number | null;
  jornadaId: string | null;
  /**
   * Nome da jornada, vindo do join com `jornadas` (Bloco 4, Task 3). Null
   * quando o colaborador não tem jornada explícita (usa a "Padrão EMT").
   */
  jornadaNome: string | null;
  vinculo: Vinculo;
  obraId: string | null;
  obraNome: string | null;
  centroCustoId: string | null;
  centroCustoNome: string | null;
  dataAdmissao: string | null;
  telefone: string | null;
  ativo: boolean;
  salario: number | null;
  valorDiaria: number | null;
  /** Gratificação salarial fixa mensal, fora da base de encargos da folha. */
  gratificacao: number;
  /** % de encargo próprio. null = usa os encargos configurados na folha. */
  encargosPercentual: number | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  tipoConta: TipoConta | null;
  chavePix: string | null;

  // Dados pessoais / documentação / eSocial (Bloco 2), mesmos 19 campos de
  // `ColaboradorLista` (queries.ts) — a ficha mostra o cadastro completo.
  rg: string | null;
  rgOrgao: string | null;
  rgUf: string | null;
  ctpsNumero: string | null;
  ctpsSerie: string | null;
  ctpsUf: string | null;
  pis: string | null;
  cnhNumero: string | null;
  cnhCategoria: CnhCategoria | null;
  cnhValidade: string | null;
  escolaridade: Escolaridade | null;
  dataNascimento: string | null;
  nomeMae: string | null;
  nacionalidade: string | null;
  estadoCivil: EstadoCivil | null;
  racaCor: RacaCor | null;
  tituloEleitor: string | null;
  reservista: string | null;
  /** CBO da função vinculada, vindo do join com `funcoes` (Task 3). */
  cbo: string | null;
}

/**
 * Busca o colaborador para o cabeçalho da ficha. Retorna null se não achar.
 *
 * A função (Bloco 3, Task 3) é resolvida via join com `funcoes`: nome, CBO e
 * salário base vêm de lá — o colaborador guarda só `funcao_id`. A jornada
 * (Bloco 4, Task 3) segue o mesmo padrão via join com `jornadas`.
 */
export async function buscarColaboradorFicha(
  id: string,
): Promise<ColaboradorFicha | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("colaboradores")
    .select(
      "id, nome, cpf, funcao_id, jornada_id, vinculo, obra_id, centro_custo_id, data_admissao, telefone, ativo, salario, valor_diaria, gratificacao, encargos_percentual, banco, agencia, conta, tipo_conta, chave_pix, rg, rg_orgao, rg_uf, ctps_numero, ctps_serie, ctps_uf, pis, cnh_numero, cnh_categoria, cnh_validade, escolaridade, data_nascimento, nome_mae, nacionalidade, estado_civil, raca_cor, titulo_eleitor, reservista, obras(nome), centros_custo(nome), funcoes(nome, cbo, salario_base), jornadas(nome)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    nome: data.nome,
    cpf: data.cpf,
    funcaoId: data.funcao_id,
    funcao: data.funcoes?.nome ?? null,
    funcaoSalarioBase: data.funcoes?.salario_base ?? null,
    jornadaId: data.jornada_id,
    jornadaNome: data.jornadas?.nome ?? null,
    vinculo: data.vinculo as Vinculo,
    obraId: data.obra_id,
    obraNome: data.obras?.nome ?? null,
    centroCustoId: data.centro_custo_id,
    centroCustoNome: data.centros_custo?.nome ?? null,
    dataAdmissao: data.data_admissao,
    telefone: data.telefone,
    ativo: data.ativo,
    salario: data.salario,
    valorDiaria: data.valor_diaria,
    gratificacao: data.gratificacao,
    encargosPercentual: data.encargos_percentual,
    banco: data.banco,
    agencia: data.agencia,
    conta: data.conta,
    tipoConta: data.tipo_conta as TipoConta | null,
    chavePix: data.chave_pix,
    rg: data.rg,
    rgOrgao: data.rg_orgao,
    rgUf: data.rg_uf,
    ctpsNumero: data.ctps_numero,
    ctpsSerie: data.ctps_serie,
    ctpsUf: data.ctps_uf,
    pis: data.pis,
    cnhNumero: data.cnh_numero,
    cnhCategoria: data.cnh_categoria as CnhCategoria | null,
    cnhValidade: data.cnh_validade,
    escolaridade: data.escolaridade as Escolaridade | null,
    dataNascimento: data.data_nascimento,
    nomeMae: data.nome_mae,
    nacionalidade: data.nacionalidade,
    estadoCivil: data.estado_civil as EstadoCivil | null,
    racaCor: data.raca_cor as RacaCor | null,
    tituloEleitor: data.titulo_eleitor,
    reservista: data.reservista,
    cbo: data.funcoes?.cbo ?? null,
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
 * Últimos pontos do colaborador (ponto é lançamento diário, então usa LIMIT
 * no banco) + contagem total via count exato sem trazer linhas.
 *
 * A consulta parte de `rh_pontos` (não de `rh_apontamentos`, que é a tabela
 * de origem do colaborador): o PostgREST não ordena o registro pai por uma
 * coluna do embed, então ordenar pela data do dia de trabalho só é possível
 * fazendo dela a tabela de topo. O embed `rh_apontamentos!inner` filtra só os
 * pontos em que este colaborador tem apontamento (unique(ponto_id,
 * colaborador_id), então é no máximo 1 por ponto). Mesmo critério de
 * ordenação de `listarPontos` (apontamentos/queries.ts): data desc, depois
 * created_at desc como desempate.
 */
export async function resumoPonto(colaboradorId: string): Promise<FichaPonto> {
  const supabase = await createClient();

  const [{ data, error }, { count, error: erroContagem }] = await Promise.all([
    supabase
      .from("rh_pontos")
      .select(
        "id, data, status, obras(nome), rh_apontamentos!inner(horas_normais, horas_extras, tipo, colaborador_id)",
      )
      .eq("rh_apontamentos.colaborador_id", colaboradorId)
      .order("data", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(LIMITE_RECENTES),
    supabase
      .from("rh_pontos")
      .select("id, rh_apontamentos!inner(colaborador_id)", {
        count: "exact",
        head: true,
      })
      .eq("rh_apontamentos.colaborador_id", colaboradorId),
  ]);

  if (error || erroContagem) {
    throw new Error("Não foi possível carregar o ponto do colaborador");
  }

  const itens: FichaPontoItem[] = (data ?? [])
    .filter((ponto) => ponto.rh_apontamentos.length > 0)
    .map((ponto) => {
      const apontamento = ponto.rh_apontamentos[0];
      return {
        pontoId: ponto.id,
        data: ponto.data,
        obraNome: ponto.obras?.nome ?? "-",
        status: ponto.status as StatusPonto,
        tipo: apontamento.tipo as TipoApontamento,
        horasNormais: apontamento.horas_normais,
        horasExtras: apontamento.horas_extras,
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

export interface FichaEpis {
  itens: EpiLista[];
  pendentesDevolucao: number;
}

/**
 * EPIs do colaborador (reaproveita `listarEpis` filtrada, que já ordena por
 * data de entrega). Volume por colaborador é pequeno: os 5 mais recentes e a
 * contagem dos pendentes de devolução (dataDevolucao nula) vêm da mesma
 * leitura filtrada.
 */
export async function resumoEpis(colaboradorId: string): Promise<FichaEpis> {
  const todos = await listarEpis({ colaboradorId });

  return {
    itens: todos.slice(0, LIMITE_RECENTES),
    pendentesDevolucao: todos.filter((item) => item.dataDevolucao === null)
      .length,
  };
}

export interface FichaOcorrencias {
  itens: OcorrenciaLista[];
  totalRegistros: number;
}

/**
 * Ocorrências do colaborador (reaproveita `listarOcorrencias` filtrada).
 * Volume por colaborador é pequeno: os 5 mais recentes e a contagem total
 * vêm da mesma leitura filtrada.
 */
export async function resumoOcorrencias(
  colaboradorId: string,
): Promise<FichaOcorrencias> {
  const todas = await listarOcorrencias({ colaboradorId });

  return {
    itens: todas.slice(0, LIMITE_RECENTES),
    totalRegistros: todas.length,
  };
}

export interface FichaAdiantamentos {
  itens: AdiantamentoLista[];
  qtdEmAberto: number;
  totalEmAberto: number;
}

/**
 * Adiantamentos do colaborador (reaproveita `listarAdiantamentos` filtrada,
 * que já traz `saldo` — Task 6 do parcelamento). Volume por colaborador é
 * pequeno: os 5 mais recentes vêm da mesma leitura filtrada; "em aberto" é
 * agregado em JS porque o PostgREST não soma no servidor.
 *
 * "Em aberto" é `saldo > 0` (dívida real), NÃO `!naFolha`. Antes do
 * parcelamento, um adiantamento só saía de "aberto" quando entrava em
 * folha por inteiro, e as duas noções coincidiam; com parcelamento,
 * `naFolha` vira `true` assim que UMA parcela tem `folha_id` preenchido —
 * mesmo que o adiantamento ainda deva a maior parte. Filtrar por `!naFolha` e
 * somar `valor` (o concedido) fazia o `totalEmAberto` da ficha zerar a
 * contribuição de qualquer adiantamento parcelado que já teve um desconto,
 * que é o caso mais comum: medido em transação revertida, 1.200,00 em 3x com
 * 400,00 já descontados contribuía ZERO para o total, quando a dívida real
 * era 800,00. `qtdEmAberto` tinha o mesmo problema (contava adiantamentos
 * "ainda não tocados pela folha", não quantos têm dívida). Com `saldo > 0`,
 * as duas medem a mesma coisa que a listagem de adiantamentos mede.
 */
export async function resumoAdiantamentos(
  colaboradorId: string,
): Promise<FichaAdiantamentos> {
  const todos = await listarAdiantamentos({ colaboradorId });
  const abertos = todos.filter((item) => item.saldo > 0);

  return {
    itens: todos.slice(0, LIMITE_RECENTES),
    qtdEmAberto: abertos.length,
    totalEmAberto: abertos.reduce((soma, item) => soma + item.saldo, 0),
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
