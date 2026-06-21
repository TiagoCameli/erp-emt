import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  STATUS_CHECKLIST,
  type StatusChecklist,
} from "@/modules/manutencao/_shared/formato";

/** Tamanho padrão de página do histórico de execuções. */
export const TAMANHO_PADRAO = 25;

/** Pergunta de um modelo de checklist. */
export interface ChecklistPergunta {
  id: string;
  pergunta: string;
  ordem: number;
}

/** Modelo de checklist na listagem de modelos, com perguntas e contagem de uso. */
export interface ChecklistModelo {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  perguntas: ChecklistPergunta[];
  execucoes: number;
}

/** Modelo ativo com perguntas, para o executor montar o formulário. */
export interface ChecklistAtivo {
  id: string;
  nome: string;
  descricao: string | null;
  perguntas: ChecklistPergunta[];
}

/** Linha do histórico de execuções. */
export interface ExecucaoLista {
  id: string;
  data: string;
  checklistNome: string;
  equipamentoDescricao: string;
  equipamentoPlaca: string | null;
  operadorNome: string | null;
  status: StatusChecklist;
}

/** Página do histórico: itens da página + total geral (count exact). */
export interface ExecucoesPagina {
  itens: ExecucaoLista[];
  total: number;
}

/** Resposta de uma execução, com a pergunta resolvida e o vínculo de OS. */
export interface ExecucaoResposta {
  id: string;
  pergunta: string;
  resposta: string;
  observacao: string | null;
  osId: string | null;
}

/** Execução completa para o detalhe (cabeçalho + respostas). */
export interface ExecucaoDetalhe {
  id: string;
  data: string;
  checklistNome: string;
  equipamentoDescricao: string;
  equipamentoPlaca: string | null;
  operadorNome: string | null;
  status: StatusChecklist;
  horimetro: number | null;
  km: number | null;
  observacao: string | null;
  respostas: ExecucaoResposta[];
}

/** Ordena as perguntas por ordem e desempata pelo texto, de forma estável. */
function ordenarPerguntas(
  perguntas: { id: string; pergunta: string; ordem: number }[],
): ChecklistPergunta[] {
  return [...perguntas]
    .sort((a, b) => a.ordem - b.ordem || a.pergunta.localeCompare(b.pergunta))
    .map((p) => ({ id: p.id, pergunta: p.pergunta, ordem: p.ordem }));
}

/**
 * Lista os modelos de checklist com suas perguntas (embed) e a contagem de
 * execuções (count via head). Ordem alfabética por nome.
 */
export async function listarChecklists(): Promise<ChecklistModelo[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("checklists")
    .select(
      `id, nome, descricao, ativo,
       checklist_perguntas(id, pergunta, ordem)`,
    )
    .order("nome");

  if (error) throw new Error("Não foi possível carregar os checklists");

  const modelos = data ?? [];

  // Contagem de execuções por checklist, em paralelo (count exact, head only).
  const contagens = await Promise.all(
    modelos.map(async (modelo) => {
      const { count } = await supabase
        .from("checklist_execucoes")
        .select("id", { count: "exact", head: true })
        .eq("checklist_id", modelo.id);
      return { id: modelo.id, total: count ?? 0 };
    }),
  );
  const totalPorId = new Map(contagens.map((c) => [c.id, c.total]));

  return modelos.map((modelo) => ({
    id: modelo.id,
    nome: modelo.nome,
    descricao: modelo.descricao,
    ativo: modelo.ativo,
    perguntas: ordenarPerguntas(modelo.checklist_perguntas ?? []),
    execucoes: totalPorId.get(modelo.id) ?? 0,
  }));
}

/**
 * Modelos ativos com suas perguntas, para o executor montar o formulário.
 * Só traz quem tem ao menos uma pergunta (sem pergunta não há o que responder).
 */
export async function listarChecklistsAtivos(): Promise<ChecklistAtivo[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("checklists")
    .select(
      `id, nome, descricao,
       checklist_perguntas(id, pergunta, ordem)`,
    )
    .eq("ativo", true)
    .order("nome");

  if (error) throw new Error("Não foi possível carregar os checklists");

  return (data ?? [])
    .map((modelo) => ({
      id: modelo.id,
      nome: modelo.nome,
      descricao: modelo.descricao,
      perguntas: ordenarPerguntas(modelo.checklist_perguntas ?? []),
    }))
    .filter((modelo) => modelo.perguntas.length > 0);
}

export interface ListarExecucoesParams {
  pagina: number;
  tamanho: number;
  equipamentoId?: string;
  status?: string;
}

/**
 * Histórico de execuções com paginação server-side (range + count exact),
 * nomes resolvidos via join. Filtros opcionais por equipamento e por status.
 * Mais recente primeiro.
 */
export async function listarExecucoes(
  params: ListarExecucoesParams,
): Promise<ExecucoesPagina> {
  const supabase = await createClient();

  const pagina = Math.max(0, params.pagina);
  const tamanho = Math.max(1, params.tamanho);
  const de = pagina * tamanho;
  const ate = de + tamanho - 1;

  let consulta = supabase
    .from("checklist_execucoes")
    .select(
      `id, data, status,
       checklists(nome),
       equipamentos(descricao, placa),
       colaboradores(nome)`,
      { count: "exact" },
    )
    .order("data", { ascending: false })
    .order("created_at", { ascending: false })
    .range(de, ate);

  if (params.equipamentoId)
    consulta = consulta.eq("equipamento_id", params.equipamentoId);
  if (params.status) consulta = consulta.eq("status", params.status);

  const { data, error, count } = await consulta;

  if (error) throw new Error("Não foi possível carregar as execuções");

  const itens: ExecucaoLista[] = (data ?? []).map((execucao) => ({
    id: execucao.id,
    data: execucao.data,
    checklistNome: execucao.checklists?.nome ?? "-",
    equipamentoDescricao: execucao.equipamentos?.descricao ?? "-",
    equipamentoPlaca: execucao.equipamentos?.placa ?? null,
    operadorNome: execucao.colaboradores?.nome ?? null,
    status: execucao.status as StatusChecklist,
  }));

  return { itens, total: count ?? 0 };
}

/**
 * Execução completa para o detalhe: cabeçalho com nomes resolvidos e a lista
 * de respostas com a pergunta e o vínculo de OS. Retorna null se não achar.
 */
export async function buscarExecucao(
  id: string,
): Promise<ExecucaoDetalhe | null> {
  const supabase = await createClient();

  const { data: execucao, error } = await supabase
    .from("checklist_execucoes")
    .select(
      `id, data, status, horimetro, km, observacao,
       checklists(nome),
       equipamentos(descricao, placa),
       colaboradores(nome)`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !execucao) return null;

  const { data: respostasRaw } = await supabase
    .from("checklist_respostas")
    .select(
      `id, resposta, observacao, os_id,
       checklist_perguntas(pergunta)`,
    )
    .eq("execucao_id", id)
    .order("created_at", { ascending: true });

  const respostas: ExecucaoResposta[] = (respostasRaw ?? []).map((linha) => ({
    id: linha.id,
    pergunta: linha.checklist_perguntas?.pergunta ?? "-",
    resposta: linha.resposta,
    observacao: linha.observacao,
    osId: linha.os_id,
  }));

  return {
    id: execucao.id,
    data: execucao.data,
    checklistNome: execucao.checklists?.nome ?? "-",
    equipamentoDescricao: execucao.equipamentos?.descricao ?? "-",
    equipamentoPlaca: execucao.equipamentos?.placa ?? null,
    operadorNome: execucao.colaboradores?.nome ?? null,
    status: execucao.status as StatusChecklist,
    horimetro: execucao.horimetro,
    km: execucao.km,
    observacao: execucao.observacao,
    respostas,
  };
}

/** Lê um uuid de filtro da query string (ignora valores inválidos). */
export function uuidParam(
  valor: string | string[] | undefined,
): string | undefined {
  if (typeof valor !== "string") return undefined;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    valor,
  )
    ? valor
    : undefined;
}

/** Lê um status de checklist válido da query string (ignora fora do enum). */
export function statusParam(
  valor: string | string[] | undefined,
): StatusChecklist | undefined {
  if (typeof valor !== "string") return undefined;
  return valor in STATUS_CHECKLIST ? (valor as StatusChecklist) : undefined;
}
