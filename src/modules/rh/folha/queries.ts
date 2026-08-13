import "server-only";

import {
  eventosDoAuditLog,
  type EventoTrilha,
  type RegistroAuditLog,
} from "@/components/canonicos";
import { createClient } from "@/lib/supabase/server";
import { resolverNomesAuditLog } from "@/lib/trilha-nomes";
import { STATUS_PARCELA, type StatusParcela } from "@/modules/financeiro/_shared/formato";
import { type StatusFolha, STATUS_FOLHA } from "@/modules/rh/_shared/formato";

/** Linha da listagem de folhas, com a contagem de itens. */
export interface FolhaLista {
  id: string;
  competencia: string;
  status: StatusFolha;
  encargosPercentual: number;
  valorBruto: number;
  valorEncargos: number;
  valorAdiantamentos: number;
  valorLiquido: number;
  custoTotal: number;
  /** Quando a folha foi aprovada (ISO), ou null se ainda não foi. */
  aprovadoEm: string | null;
  /**
   * Nome de quem aprovou, via join com `usuarios`. Vem null se a folha não
   * foi aprovada. Também vem null (mesmo com a folha aprovada) para quem
   * está vendo não é o próprio aprovador e não tem
   * `administracao.usuarios:ver`: a policy `usuarios_select` só libera a
   * própria linha (`id = auth.uid()`) ou quem tem essa permissão, então o
   * embed barra e a query não distingue os dois motivos — a tela mostra
   * "aprovada em ..." sem o "por quem", calada.
   */
  aprovadoPorNome: string | null;
  /** Motivo da última rejeição, mostrado enquanto a folha volta pra rascunho. */
  motivoRejeicao: string | null;
  /** Quantidade de colaboradores na folha. */
  totalItens: number;
}

/** Uma linha de encargo aplicada a um item da folha (nome + valor em R$). */
export interface EncargoDetalhe {
  nome: string;
  valor: number;
}

/** Item da folha por colaborador, com nome/função e centro de custo resolvidos. */
export interface FolhaItem {
  id: string;
  colaboradorId: string;
  colaboradorNome: string;
  /** Nome da função, vindo do join com `funcoes` (Bloco 3, Task 3). */
  colaboradorFuncao: string | null;
  centroCustoId: string | null;
  centroCustoNome: string | null;
  centroCustoCodigo: string | null;
  salarioBase: number;
  horasNormais: number;
  horasExtras: number;
  valorExtras: number;
  /** Desconto de INSS do colaborador (Bloco 6/7), usado no holerite. */
  inss: number;
  /** Desconto de IRRF do colaborador (Bloco 6/7), usado no holerite. */
  irrf: number;
  encargos: number;
  /**
   * Quebra do total de `encargos` por tipo (Bloco 6, Task 3/4), vinda de
   * `folha_item_encargos`. Folhas geradas antes da Task 3 não têm essas
   * linhas: nesse caso vem `[]` e a UI mostra só o total.
   */
  encargosDetalhe: EncargoDetalhe[];
  adiantamentos: number;
  /**
   * Identificação da(s) parcela(s) de adiantamento descontada(s) nesta folha
   * para este colaborador (Task 6 do parcelamento): posição por competência
   * entre TODAS as parcelas do mesmo adiantamento (nunca por `numero`, que
   * não é identidade estável — ver `comment on function` da `fn_gerar_folha`)
   * e o total de parcelas do plano. Vazio quando o colaborador não tem
   * adiantamento descontado nesta folha, ou quando quem gerou esta leitura
   * não tem `rh.adiantamentos:ver` (a RLS de `rh_adiantamento_parcelas` exige
   * essa permissão; sem ela a lista vem vazia e o holerite mostra o rótulo
   * genérico "Adiantamentos", sem quebrar). Opcional para não obrigar todo
   * `FolhaItem` de teste a preencher isto.
   */
  adiantamentoParcelas?: { ordinal: number; total: number }[];
  custoTotal: number;
  valorLiquido: number;
  /**
   * Id do lançamento a_pagar do salário deste colaborador (Task 4), ou null
   * se ainda não existe (folha em rascunho/pendente_aprovacao, ou líquido
   * ≤ 0, que não gera lançamento). `listarLancamentosDaFolha` (Task 7) reusa
   * este campo em vez de reconsultar `folha_itens`: `buscarFolha` já leu essa
   * tabela nesta mesma leitura, e reler o que já está em memória é o erro que
   * o Bloco 6 corrigiu nesta tela.
   */
  lancamentoId: string | null;
}

/** Folha completa para o detalhe: cabeçalho + itens por colaborador. */
export interface FolhaDetalhe {
  id: string;
  competencia: string;
  status: StatusFolha;
  encargosPercentual: number;
  valorBruto: number;
  valorEncargos: number;
  valorAdiantamentos: number;
  valorLiquido: number;
  custoTotal: number;
  /** Quando a folha foi aprovada (ISO), ou null se ainda não foi. */
  aprovadoEm: string | null;
  /**
   * Nome de quem aprovou, via join com `usuarios`. Vem null se a folha não
   * foi aprovada. Também vem null (mesmo com a folha aprovada) para quem
   * está vendo não é o próprio aprovador e não tem
   * `administracao.usuarios:ver`: a policy `usuarios_select` só libera a
   * própria linha (`id = auth.uid()`) ou quem tem essa permissão, então o
   * embed barra e a query não distingue os dois motivos — a tela mostra
   * "aprovada em ..." sem o "por quem", calada.
   */
  aprovadoPorNome: string | null;
  /** Motivo da última rejeição, mostrado enquanto a folha volta pra rascunho. */
  motivoRejeicao: string | null;
  itens: FolhaItem[];
}

/** Custo total alocado por centro de custo, derivado dos itens. */
export interface CustoCentroCusto {
  centroCustoId: string | null;
  centroCustoNome: string | null;
  centroCustoCodigo: string | null;
  custoTotal: number;
}

/** Total por tipo de encargo, somado entre todos os colaboradores da folha. */
export interface ResumoEncargo {
  nome: string;
  total: number;
}

/** Normaliza o status do banco (texto livre) para o domínio conhecido. */
function normalizarStatus(status: string): StatusFolha {
  return status in STATUS_FOLHA ? (status as StatusFolha) : "rascunho";
}

/**
 * Lista as folhas com a contagem de colaboradores (folha_itens) de cada uma,
 * em ordem de competência decrescente. A contagem vem do embed com count, sem
 * trazer as linhas. SELECT direto (RLS de ver).
 */
export async function listarFolhas(): Promise<FolhaLista[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("folhas")
    .select(
      `id, competencia, status, encargos_percentual, valor_bruto,
       valor_encargos, valor_adiantamentos, valor_liquido, custo_total,
       aprovado_em, motivo_rejeicao, usuarios!folhas_aprovado_por_fkey(nome),
       folha_itens(count)`,
    )
    .order("competencia", { ascending: false });

  if (error) throw new Error("Não foi possível carregar as folhas");

  return (data ?? []).map((folha) => ({
    id: folha.id,
    competencia: folha.competencia,
    status: normalizarStatus(folha.status),
    encargosPercentual: folha.encargos_percentual,
    valorBruto: folha.valor_bruto,
    valorEncargos: folha.valor_encargos,
    valorAdiantamentos: folha.valor_adiantamentos,
    valorLiquido: folha.valor_liquido,
    custoTotal: folha.custo_total,
    aprovadoEm: folha.aprovado_em,
    aprovadoPorNome: folha.usuarios?.nome ?? null,
    motivoRejeicao: folha.motivo_rejeicao,
    totalItens: folha.folha_itens?.[0]?.count ?? 0,
  }));
}

/**
 * Identifica, por colaborador, qual(is) parcela(s) de adiantamento esta folha
 * descontou e a posição de cada uma no plano do adiantamento dela ("2 de 3").
 * Task 6 do parcelamento: o holerite passa a mostrar isso quando o
 * adiantamento tem mais de uma parcela, sem leitura extra por colaborador —
 * são exatamente DUAS leituras para a folha TODA (não uma por colaborador,
 * nem uma por adiantamento):
 *
 *   1. as parcelas que ESTA folha fechou (`folha_id = id`), com o colaborador
 *      de cada uma (via o adiantamento dela);
 *   2. TODAS as parcelas dos adiantamentos encontrados no passo 1 (abertas ou
 *      fechadas em qualquer folha), para calcular a posição e o total do
 *      plano AGORA.
 *
 * A posição é por ORDEM DE COMPETÊNCIA (e `id` como desempate), nunca pelo
 * `numero`: ele não é identidade estável, é recalculado como `max(numero) +
 * 1` a cada sobra (ver `comment on function` da `fn_gerar_folha`). Mesmo
 * critério de ordenação da listagem de adiantamentos.
 *
 * Sem `rh.adiantamentos:ver` (a RLS de `rh_adiantamento_parcelas` exige essa
 * permissão, e esta função é chamada por quem tem `rh.folha:ver`, uma
 * permissão diferente) as duas leituras vêm vazias e a função devolve um Map
 * vazio: o holerite cai no rótulo genérico "Adiantamentos", sem quebrar e sem
 * mostrar número errado.
 */
async function identificarParcelasDaFolha(
  supabase: Awaited<ReturnType<typeof createClient>>,
  folhaId: string,
): Promise<Map<string, { ordinal: number; total: number }[]>> {
  const vazio = new Map<string, { ordinal: number; total: number }[]>();

  const { data: parcelasDaFolha, error: erroParcelasDaFolha } = await supabase
    .from("rh_adiantamento_parcelas")
    .select("id, adiantamento_id, rh_adiantamentos!inner(colaborador_id)")
    .eq("folha_id", folhaId);

  if (erroParcelasDaFolha) {
    throw new Error(
      "Não foi possível identificar as parcelas de adiantamento descontadas nesta folha",
    );
  }
  if (!parcelasDaFolha || parcelasDaFolha.length === 0) return vazio;

  const idsAdiantamento = [
    ...new Set(parcelasDaFolha.map((linha) => linha.adiantamento_id)),
  ];

  const { data: todasParcelas, error: erroTodas } = await supabase
    .from("rh_adiantamento_parcelas")
    .select("id, adiantamento_id, competencia")
    .in("adiantamento_id", idsAdiantamento);

  if (erroTodas) {
    throw new Error(
      "Não foi possível carregar o plano de parcelas dos adiantamentos desta folha",
    );
  }

  // Ordem por competência (e id como desempate) dentro de cada adiantamento,
  // para achar a posição de cada parcela no plano ATUAL — não o `numero`.
  const porAdiantamento = new Map<string, { id: string; competencia: string }[]>();
  for (const parcela of todasParcelas ?? []) {
    const lista = porAdiantamento.get(parcela.adiantamento_id) ?? [];
    lista.push({ id: parcela.id, competencia: parcela.competencia });
    porAdiantamento.set(parcela.adiantamento_id, lista);
  }

  const posicaoPorParcelaId = new Map<string, { ordinal: number; total: number }>();
  for (const lista of porAdiantamento.values()) {
    const ordenada = [...lista].sort((a, b) =>
      a.competencia === b.competencia
        ? a.id.localeCompare(b.id)
        : a.competencia.localeCompare(b.competencia),
    );
    ordenada.forEach((parcela, indice) => {
      posicaoPorParcelaId.set(parcela.id, {
        ordinal: indice + 1,
        total: ordenada.length,
      });
    });
  }

  const resultado = new Map<string, { ordinal: number; total: number }[]>();
  for (const linha of parcelasDaFolha) {
    const posicao = posicaoPorParcelaId.get(linha.id);
    if (!posicao) continue;
    const colaboradorId = linha.rh_adiantamentos.colaborador_id;
    const lista = resultado.get(colaboradorId) ?? [];
    lista.push(posicao);
    resultado.set(colaboradorId, lista.sort((a, b) => a.ordinal - b.ordinal));
  }

  return resultado;
}

/**
 * Folha completa para o detalhe: cabeçalho com os valores consolidados e os
 * itens por colaborador, com nome/função e o centro de custo (nome/código) via
 * embed. Itens em ordem alfabética de colaborador. Retorna null se não achar.
 */
export async function buscarFolha(id: string): Promise<FolhaDetalhe | null> {
  const supabase = await createClient();

  const { data: folha, error } = await supabase
    .from("folhas")
    .select(
      `id, competencia, status, encargos_percentual, valor_bruto,
       valor_encargos, valor_adiantamentos, valor_liquido, custo_total,
       aprovado_em, motivo_rejeicao, usuarios!folhas_aprovado_por_fkey(nome)`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !folha) return null;

  const { data: itensRaw, error: erroItens } = await supabase
    .from("folha_itens")
    .select(
      `id, colaborador_id, centro_custo_id, salario_base, horas_normais,
       horas_extras, valor_extras, inss, irrf, encargos, adiantamentos,
       custo_total, valor_liquido, lancamento_id,
       colaboradores(nome, funcoes(nome)),
       centros_custo(nome, codigo),
       folha_item_encargos(nome, valor)`,
    )
    .eq("folha_id", id);

  if (erroItens) {
    throw new Error("Não foi possível carregar os itens da folha");
  }

  const parcelasPorColaborador = await identificarParcelasDaFolha(supabase, id);

  const itens: FolhaItem[] = (itensRaw ?? [])
    .map((item) => ({
      id: item.id,
      colaboradorId: item.colaborador_id,
      colaboradorNome: item.colaboradores?.nome ?? "Colaborador removido",
      colaboradorFuncao: item.colaboradores?.funcoes?.nome ?? null,
      centroCustoId: item.centro_custo_id,
      centroCustoNome: item.centros_custo?.nome ?? null,
      centroCustoCodigo: item.centros_custo?.codigo ?? null,
      salarioBase: item.salario_base,
      horasNormais: item.horas_normais,
      horasExtras: item.horas_extras,
      valorExtras: item.valor_extras,
      inss: item.inss,
      irrf: item.irrf,
      encargos: item.encargos,
      // Folhas geradas antes da Task 3 (Bloco 6) não têm linhas aqui: [].
      encargosDetalhe: (item.folha_item_encargos ?? [])
        .map((encargo) => ({ nome: encargo.nome, valor: encargo.valor }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
      adiantamentos: item.adiantamentos,
      adiantamentoParcelas: parcelasPorColaborador.get(item.colaborador_id) ?? [],
      custoTotal: item.custo_total,
      valorLiquido: item.valor_liquido,
      lancamentoId: item.lancamento_id,
    }))
    .sort((a, b) =>
      a.colaboradorNome.localeCompare(b.colaboradorNome, "pt-BR"),
    );

  return {
    id: folha.id,
    competencia: folha.competencia,
    status: normalizarStatus(folha.status),
    encargosPercentual: folha.encargos_percentual,
    valorBruto: folha.valor_bruto,
    valorEncargos: folha.valor_encargos,
    valorAdiantamentos: folha.valor_adiantamentos,
    valorLiquido: folha.valor_liquido,
    custoTotal: folha.custo_total,
    aprovadoEm: folha.aprovado_em,
    aprovadoPorNome: folha.usuarios?.nome ?? null,
    motivoRejeicao: folha.motivo_rejeicao,
    itens,
  };
}

// `resumoPorCentroCusto` e `resumoPorEncargo` foram movidos para
// `./calculo.ts`: são derivações puras dos itens já carregados aqui por
// `buscarFolha`, sem precisar de uma 2ª/3ª leitura da folha no banco.

/**
 * Lançamento gerado pela aprovação da folha (Bloco 8a, Task 7): salário de um
 * colaborador (`origem='folha'`) ou guia de um grupo de recolhimento
 * (`origem='folha_guia'`). `numero` e `dataVencimento` vêm null só em dado
 * legado sem número atribuído; na prática toda linha aqui já passou pela
 * aprovação e tem os dois preenchidos.
 */
export interface LancamentoDaFolha {
  id: string;
  tipo: "salario" | "guia";
  descricao: string;
  numero: string | null;
  valor: number;
  dataVencimento: string | null;
  statusParcela: StatusParcela;
}

/** Normaliza o status da parcela (texto livre no banco) para o domínio conhecido. */
function normalizarStatusParcela(status: string): StatusParcela {
  return status in STATUS_PARCELA ? (status as StatusParcela) : "pendente";
}

/**
 * Lista os lançamentos que a aprovação desta folha gerou: um por colaborador
 * (o líquido) e um por grupo de recolhimento (a guia). Em rascunho e
 * pendente_aprovacao não existe nenhum (a aprovação é quem cria), e a função
 * devolve `[]` sem erro.
 *
 * `idsLancamentoSalario` vem de `folha.itens[].lancamentoId` — `buscarFolha`
 * já leu `folha_itens` nesta mesma requisição (Task 7, fix round 1: reler
 * essa tabela aqui repetiria o erro que o Bloco 6 corrigiu nesta tela). Só
 * `folha_guias` precisa de uma leitura própria (enxuta, só `lancamento_id`):
 * não há como saber esses ids sem consultar essa tabela, ela não é carregada
 * em outro lugar da página. As duas fontes de id alimentam a ÚNICA leitura
 * que importa: um select em `lancamentos` (join com `lancamento_parcelas`)
 * filtrado por `.in("id", ...)`, cobrindo as duas origens da folha de uma vez
 * — não uma consulta por origem.
 */
export async function listarLancamentosDaFolha(
  folhaId: string,
  idsLancamentoSalario: string[],
): Promise<LancamentoDaFolha[]> {
  const supabase = await createClient();

  const { data: guias, error: erroGuias } = await supabase
    .from("folha_guias")
    .select("lancamento_id")
    .eq("folha_id", folhaId)
    .not("lancamento_id", "is", null);

  if (erroGuias) {
    throw new Error("Não foi possível carregar os lançamentos da folha");
  }

  const idsLancamento = [
    ...idsLancamentoSalario,
    ...(guias ?? []).map((guia) => guia.lancamento_id),
  ].filter((id): id is string => id !== null);

  if (idsLancamento.length === 0) return [];

  // Leitura única: lançamentos + parcela, cobrindo salário e guia de uma vez
  // via o id do próprio lançamento (não .eq("origem", ...) duas vezes).
  const { data, error } = await supabase
    .from("lancamentos")
    .select(
      "id, origem, descricao, numero, valor, data_vencimento, lancamento_parcelas(status)",
    )
    .in("id", idsLancamento);

  if (error) {
    throw new Error("Não foi possível carregar os lançamentos da folha");
  }

  return (data ?? []).map((lancamento) => ({
    id: lancamento.id,
    tipo: lancamento.origem === "folha_guia" ? "guia" : "salario",
    descricao: lancamento.descricao,
    numero: lancamento.numero,
    valor: lancamento.valor,
    dataVencimento: lancamento.data_vencimento,
    statusParcela: normalizarStatusParcela(
      lancamento.lancamento_parcelas?.[0]?.status ?? "pendente",
    ),
  }));
}

/**
 * Trilha de auditoria da folha: lê o audit_log só do cabeçalho (tabela
 * `folhas`) para aquele id e resolve os nomes dos usuários via RPC (security
 * definer), no mesmo padrão de `trilhaOrdem`. Sem enriquecimento de
 * pagamento: a Task 2 não mexe em dinheiro, isso entra nas Tasks 4/5/7.
 */
export async function trilhaFolha(id: string): Promise<EventoTrilha[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("audit_log")
    .select(
      "id, tabela, registro_id, acao, usuario_id, dados_antes, dados_depois, criado_em",
    )
    .eq("tabela", "folhas")
    .eq("registro_id", id)
    .order("criado_em", { ascending: false })
    .order("id", { ascending: false });

  if (error || !data) return [];

  const idsUsuarios = [
    ...new Set(
      data
        .map((linha) => linha.usuario_id)
        .filter((usuarioId): usuarioId is string => usuarioId !== null),
    ),
  ];

  const nomesPorId = new Map<string, string>();
  if (idsUsuarios.length > 0) {
    const { data: usuarios } = await supabase.rpc(
      "nomes_usuarios_auditoria",
      { p_ids: idsUsuarios },
    );
    for (const usuario of usuarios ?? []) {
      nomesPorId.set(usuario.id, usuario.nome);
    }
  }

  const registros: RegistroAuditLog[] = data.map((linha) => ({
    id: linha.id,
    tabela: linha.tabela,
    registro_id: linha.registro_id,
    acao: linha.acao,
    usuario_id: linha.usuario_id,
    usuario_nome:
      linha.usuario_id === null
        ? "Sistema"
        : (nomesPorId.get(linha.usuario_id) ?? "Sistema"),
    dados_antes: linha.dados_antes,
    dados_depois: linha.dados_depois,
    criado_em: linha.criado_em,
  }));

  const nomes = await resolverNomesAuditLog(supabase, registros);
  return eventosDoAuditLog(registros, {
    nomes,
    entidade: "Folha",
    genero: "f",
  });
}
