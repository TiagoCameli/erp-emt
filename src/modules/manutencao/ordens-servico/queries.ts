import "server-only";

import type { EventoTrilha, TipoEventoTrilha } from "@/components/canonicos";
import { createClient } from "@/lib/supabase/server";
import {
  STATUS_OS,
  type OrigemOS,
  type PrioridadeOS,
  type StatusOS,
  type TipoOS,
} from "@/modules/manutencao/_shared/formato";

/** Tamanho padrão de página da listagem de OS. */
export const TAMANHO_PADRAO = 25;

/** Linha da listagem de ordens de serviço. */
export interface OrdemLista {
  id: string;
  numero: string | null;
  equipamentoDescricao: string;
  equipamentoPlaca: string | null;
  tipo: TipoOS;
  prioridade: PrioridadeOS;
  status: StatusOS;
  custoTotal: number;
  dataAbertura: string;
}

/** Página da listagem: itens da página + total geral (count exact). */
export interface OrdensPagina {
  itens: OrdemLista[];
  total: number;
}

/** Peça baixada na OS, com os nomes resolvidos via join. Imutável. */
export interface OsPeca {
  id: string;
  insumoNome: string;
  unidadeSigla: string;
  depositoNome: string;
  quantidade: number;
  custoUnitario: number;
  custoTotal: number;
}

/** Apontamento de mão de obra da OS. */
export interface OsMaoObra {
  id: string;
  colaboradorNome: string;
  colaboradorFuncao: string | null;
  horas: number;
  valorHora: number;
  custoTotal: number;
}

/** Serviço de terceiro da OS. */
export interface OsTerceiro {
  id: string;
  fornecedorNome: string | null;
  descricao: string;
  valor: number;
  dataVencimento: string | null;
}

/** OS completa para a tela de detalhe. */
export interface OrdemDetalhe {
  id: string;
  numero: string | null;
  equipamentoId: string;
  equipamentoDescricao: string;
  equipamentoCodigo: string | null;
  equipamentoPlaca: string | null;
  centroCustoNome: string | null;
  centroCustoCodigo: string | null;
  tipo: TipoOS;
  status: StatusOS;
  prioridade: PrioridadeOS;
  origem: OrigemOS;
  descricao: string;
  observacao: string | null;
  motivoCancelamento: string | null;
  horimetroAbertura: number | null;
  kmAbertura: number | null;
  horimetroFechamento: number | null;
  kmFechamento: number | null;
  dataAbertura: string;
  dataConclusao: string | null;
  custoPecas: number;
  custoMaoObra: number;
  custoTerceiros: number;
  custoTotal: number;
  pecas: OsPeca[];
  maoObra: OsMaoObra[];
  terceiros: OsTerceiro[];
}

/** Nome de exibição do fornecedor: fantasia quando existe, senão razão social. */
function nomeFornecedor(fornecedor: {
  razao_social: string;
  nome_fantasia: string | null;
}): string {
  return fornecedor.nome_fantasia ?? fornecedor.razao_social;
}

export interface ListarOrdensParams {
  pagina: number;
  tamanho: number;
  status?: string;
  equipamentoId?: string;
}

/**
 * Lista as OS com paginação server-side (range + count exact), nome do
 * equipamento resolvido via join. O custo_total vem do banco, nunca
 * recalculado no app. Filtros opcionais por status e por equipamento.
 */
export async function listarOrdens(
  params: ListarOrdensParams,
): Promise<OrdensPagina> {
  const supabase = await createClient();

  const pagina = Math.max(0, params.pagina);
  const tamanho = Math.max(1, params.tamanho);
  const de = pagina * tamanho;
  const ate = de + tamanho - 1;

  let consulta = supabase
    .from("ordens_servico")
    .select(
      `id, numero, tipo, prioridade, status, custo_total, data_abertura,
       equipamentos(descricao, placa)`,
      { count: "exact" },
    )
    .order("data_abertura", { ascending: false })
    .order("created_at", { ascending: false })
    .range(de, ate);

  if (params.status) consulta = consulta.eq("status", params.status);
  if (params.equipamentoId)
    consulta = consulta.eq("equipamento_id", params.equipamentoId);

  const { data, error, count } = await consulta;

  if (error) throw new Error("Não foi possível carregar as ordens de serviço");

  const itens: OrdemLista[] = (data ?? []).map((ordem) => ({
    id: ordem.id,
    numero: ordem.numero,
    equipamentoDescricao: ordem.equipamentos?.descricao ?? "-",
    equipamentoPlaca: ordem.equipamentos?.placa ?? null,
    tipo: ordem.tipo as TipoOS,
    prioridade: ordem.prioridade as PrioridadeOS,
    status: ordem.status as StatusOS,
    custoTotal: ordem.custo_total,
    dataAbertura: ordem.data_abertura,
  }));

  return { itens, total: count ?? 0 };
}

/**
 * OS completa para o detalhe: cabeçalho com equipamento e centro de custo,
 * mais as listas de peças, mão de obra e terceiros com nomes resolvidos.
 * Retorna null se não achar.
 */
export async function buscarOrdem(id: string): Promise<OrdemDetalhe | null> {
  const supabase = await createClient();

  const { data: ordem, error } = await supabase
    .from("ordens_servico")
    .select(
      `id, numero, equipamento_id, tipo, status, prioridade, origem, descricao,
       observacao, motivo_cancelamento, horimetro_abertura, km_abertura,
       horimetro_fechamento, km_fechamento, data_abertura, data_conclusao,
       custo_pecas, custo_mao_obra, custo_terceiros, custo_total,
       equipamentos(descricao, codigo, placa),
       centros_custo(nome, codigo)`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !ordem) return null;

  const [
    { data: pecasRaw },
    { data: maoObraRaw },
    { data: terceirosRaw },
  ] = await Promise.all([
    supabase
      .from("os_pecas")
      .select(
        `id, quantidade, custo_unitario, custo_total,
         insumos(nome, unidades_medida(sigla)),
         depositos(nome)`,
      )
      .eq("ordem_servico_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("os_mao_obra")
      .select(
        `id, horas, valor_hora, custo_total,
         colaboradores(nome, funcao)`,
      )
      .eq("ordem_servico_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("os_terceiros")
      .select(
        `id, descricao, valor, data_vencimento,
         fornecedores(razao_social, nome_fantasia)`,
      )
      .eq("ordem_servico_id", id)
      .order("created_at", { ascending: true }),
  ]);

  const pecas: OsPeca[] = (pecasRaw ?? []).map((peca) => ({
    id: peca.id,
    insumoNome: peca.insumos?.nome ?? "-",
    unidadeSigla: peca.insumos?.unidades_medida?.sigla ?? "",
    depositoNome: peca.depositos?.nome ?? "-",
    quantidade: peca.quantidade,
    custoUnitario: peca.custo_unitario,
    custoTotal: peca.custo_total,
  }));

  const maoObra: OsMaoObra[] = (maoObraRaw ?? []).map((linha) => ({
    id: linha.id,
    colaboradorNome: linha.colaboradores?.nome ?? "-",
    colaboradorFuncao: linha.colaboradores?.funcao ?? null,
    horas: linha.horas,
    valorHora: linha.valor_hora,
    custoTotal: linha.custo_total ?? linha.horas * linha.valor_hora,
  }));

  const terceiros: OsTerceiro[] = (terceirosRaw ?? []).map((linha) => ({
    id: linha.id,
    fornecedorNome: linha.fornecedores
      ? nomeFornecedor(linha.fornecedores)
      : null,
    descricao: linha.descricao,
    valor: linha.valor,
    dataVencimento: linha.data_vencimento,
  }));

  return {
    id: ordem.id,
    numero: ordem.numero,
    equipamentoId: ordem.equipamento_id,
    equipamentoDescricao: ordem.equipamentos?.descricao ?? "-",
    equipamentoCodigo: ordem.equipamentos?.codigo ?? null,
    equipamentoPlaca: ordem.equipamentos?.placa ?? null,
    centroCustoNome: ordem.centros_custo?.nome ?? null,
    centroCustoCodigo: ordem.centros_custo?.codigo ?? null,
    tipo: ordem.tipo as TipoOS,
    status: ordem.status as StatusOS,
    prioridade: ordem.prioridade as PrioridadeOS,
    origem: ordem.origem as OrigemOS,
    descricao: ordem.descricao,
    observacao: ordem.observacao,
    motivoCancelamento: ordem.motivo_cancelamento,
    horimetroAbertura: ordem.horimetro_abertura,
    kmAbertura: ordem.km_abertura,
    horimetroFechamento: ordem.horimetro_fechamento,
    kmFechamento: ordem.km_fechamento,
    dataAbertura: ordem.data_abertura,
    dataConclusao: ordem.data_conclusao,
    custoPecas: ordem.custo_pecas,
    custoMaoObra: ordem.custo_mao_obra,
    custoTerceiros: ordem.custo_terceiros,
    custoTotal: ordem.custo_total,
    pecas,
    maoObra,
    terceiros,
  };
}

/** Rótulo legível do status para a descrição do evento da trilha. */
function rotuloStatus(status: string | null): string {
  if (!status) return "-";
  return STATUS_OS[status as StatusOS]?.rotulo ?? status;
}

/** Mapeia o status de destino da transição no tipo de ponto da trilha. */
function tipoEvento(paraStatus: string): TipoEventoTrilha {
  switch (paraStatus) {
    case "aberta":
      return "criacao";
    case "em_execucao":
      return "edicao";
    case "concluida":
      return "aprovacao";
    case "cancelada":
      return "rejeicao";
    default:
      return "outro";
  }
}

/** Título legível da transição (de -> para), em pt-BR. */
function tituloTransicao(deStatus: string | null, paraStatus: string): string {
  if (paraStatus === "aberta" && !deStatus) return "OS aberta";
  switch (paraStatus) {
    case "em_execucao":
      return "OS iniciada";
    case "concluida":
      return "OS concluída";
    case "cancelada":
      return "OS cancelada";
    default:
      return `Status: ${rotuloStatus(paraStatus)}`;
  }
}

/**
 * Trilha simples do detalhe a partir de os_transicoes (não usa audit_log).
 * Resolve os nomes dos usuários via RPC nomes_usuarios_auditoria (security
 * definer), igual ao padrão de lancamentos/compras. Mais recente primeiro.
 */
export async function trilhaOrdem(id: string): Promise<EventoTrilha[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("os_transicoes")
    .select("id, de_status, para_status, motivo, usuario_id, criado_em")
    .eq("ordem_servico_id", id)
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
    const { data: usuarios } = await supabase.rpc("nomes_usuarios_auditoria", {
      p_ids: idsUsuarios,
    });
    for (const usuario of usuarios ?? []) {
      nomesPorId.set(usuario.id, usuario.nome);
    }
  }

  return data.map((linha) => ({
    id: linha.id,
    data: linha.criado_em,
    titulo: tituloTransicao(linha.de_status, linha.para_status),
    descricao: linha.motivo ?? undefined,
    usuario:
      linha.usuario_id === null
        ? "Sistema"
        : (nomesPorId.get(linha.usuario_id) ?? "Sistema"),
    tipo: tipoEvento(linha.para_status),
  }));
}

/** Lê um uuid de filtro da query string (ignora valores inválidos). */
export function uuidParam(valor: string | string[] | undefined): string | undefined {
  if (typeof valor !== "string") return undefined;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    valor,
  )
    ? valor
    : undefined;
}

/** Lê um status de OS válido da query string (ignora valores fora do enum). */
export function statusParam(
  valor: string | string[] | undefined,
): StatusOS | undefined {
  if (typeof valor !== "string") return undefined;
  return valor in STATUS_OS ? (valor as StatusOS) : undefined;
}
