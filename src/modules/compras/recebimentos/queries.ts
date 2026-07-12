import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  eventosDoAuditLog,
  type EventoTrilha,
  type RegistroAuditLog,
} from "@/components/canonicos";
import type { StatusRecebimento } from "@/modules/compras/_shared/formato";
import {
  idsFornecedoresPorNome,
  padraoBusca,
} from "@/modules/compras/_shared/lista";
import {
  saldoAReceber,
  totalRecebido,
} from "@/modules/compras/recebimentos/calculo";

/** Filtros e paginação da listagem de recebimentos. */
export interface ListarRecebimentosParams {
  pagina: number;
  tamanho: number;
  busca?: string;
}

/** Linha da listagem de recebimentos, com OC e fornecedor resolvidos. */
export interface RecebimentoLista {
  id: string;
  numero: string | null;
  ordemCompraId: string;
  ordemCompraNumero: string | null;
  fornecedorNome: string;
  numeroNf: string | null;
  valorNf: number | null;
  dataRecebimento: string;
  status: StatusRecebimento;
}

/** Resultado paginado da listagem de recebimentos. */
export interface RecebimentosPagina {
  itens: RecebimentoLista[];
  total: number;
}

/** Item de um recebimento já gravado, com o insumo e a OC de origem. */
export interface RecebimentoItemDetalhe {
  id: string;
  ocItemId: string;
  insumoNome: string;
  insumoCodigo: string | null;
  unidadeSigla: string | null;
  quantidadeRecebida: number;
}

/** Recebimento completo para a tela de detalhe. */
export interface RecebimentoDetalhe {
  id: string;
  numero: string | null;
  ordemCompraId: string;
  ordemCompraNumero: string | null;
  fornecedorNome: string;
  numeroNf: string | null;
  valorNf: number | null;
  dataRecebimento: string;
  dataVencimento: string | null;
  status: StatusRecebimento;
  observacoes: string | null;
  itens: RecebimentoItemDetalhe[];
}

/** Item de uma OC receptível, com saldo a receber calculado. */
export interface OrdemReceptivelItem {
  ocItemId: string;
  insumoNome: string;
  insumoCodigo: string | null;
  unidadeSigla: string | null;
  quantidadePedida: number;
  quantidadeRecebida: number;
  saldoAReceber: number;
}

/** OC apta a gerar recebimento (aprovada ou recebida parcial). */
export interface OrdemReceptivel {
  id: string;
  numero: string | null;
  fornecedorNome: string;
  status: string;
  itens: OrdemReceptivelItem[];
}

/** Nome de exibição do fornecedor: fantasia quando há, senão razão social. */
function nomeFornecedor(
  fornecedor: { razao_social: string; nome_fantasia: string | null } | null,
): string {
  if (!fornecedor) return "Sem fornecedor";
  return fornecedor.nome_fantasia ?? fornecedor.razao_social;
}

/** Máximo de OCs resolvidas na busca por número de OC ou fornecedor. */
const MAX_OCS_BUSCA = 50;

/**
 * Lista os recebimentos com paginação server-side (range + count exact), a OC
 * e o fornecedor resolvidos, mais recentes primeiro. A busca cobre número do
 * recebimento, número da NF, número da OC e nome do fornecedor (estes dois
 * resolvidos para ids num select prévio, porque o or() do PostgREST não
 * mistura colunas do pai com joins). RLS de compras.recebimentos cobre a
 * visibilidade.
 */
export async function listarRecebimentos(
  params: ListarRecebimentosParams,
): Promise<RecebimentosPagina> {
  const supabase = await createClient();

  const pagina = Math.max(0, params.pagina);
  const tamanho = Math.max(1, params.tamanho);
  const de = pagina * tamanho;
  const ate = de + tamanho - 1;

  let consulta = supabase
    .from("recebimentos")
    .select(
      "id, numero, ordem_compra_id, numero_nf, valor_nf, data_recebimento, status, ordens_compra(numero, fornecedores(razao_social, nome_fantasia))",
      { count: "exact" },
    )
    .order("data_recebimento", { ascending: false })
    .order("created_at", { ascending: false })
    .range(de, ate);

  if (params.busca) {
    const padrao = padraoBusca(params.busca);
    const idsFornecedores = await idsFornecedoresPorNome(supabase, padrao);

    const clausulasOc = [`numero.ilike.${padrao}`];
    if (idsFornecedores.length > 0) {
      clausulasOc.push(`fornecedor_id.in.(${idsFornecedores.join(",")})`);
    }
    const { data: ordens, error: erroOrdens } = await supabase
      .from("ordens_compra")
      .select("id")
      .or(clausulasOc.join(","))
      .limit(MAX_OCS_BUSCA);

    if (erroOrdens) {
      throw new Error("Não foi possível carregar os recebimentos");
    }

    const idsOrdens = (ordens ?? []).map((ordem) => ordem.id);
    const clausulas = [`numero.ilike.${padrao}`, `numero_nf.ilike.${padrao}`];
    if (idsOrdens.length > 0) {
      clausulas.push(`ordem_compra_id.in.(${idsOrdens.join(",")})`);
    }
    consulta = consulta.or(clausulas.join(","));
  }

  const { data, error, count } = await consulta;

  if (error) {
    throw new Error("Não foi possível carregar os recebimentos");
  }

  const itens: RecebimentoLista[] = (data ?? []).map((recebimento) => ({
    id: recebimento.id,
    numero: recebimento.numero,
    ordemCompraId: recebimento.ordem_compra_id,
    ordemCompraNumero: recebimento.ordens_compra?.numero ?? null,
    fornecedorNome: nomeFornecedor(
      recebimento.ordens_compra?.fornecedores ?? null,
    ),
    numeroNf: recebimento.numero_nf,
    valorNf: recebimento.valor_nf,
    dataRecebimento: recebimento.data_recebimento,
    status: recebimento.status as StatusRecebimento,
  }));

  return { itens, total: count ?? 0 };
}

/**
 * Busca um recebimento com os itens, o insumo de cada item e a OC de origem.
 * Retorna null se o registro não existe ou o usuário não pode vê-lo (RLS).
 */
export async function buscarRecebimento(
  id: string,
): Promise<RecebimentoDetalhe | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("recebimentos")
    .select(
      "id, numero, ordem_compra_id, numero_nf, valor_nf, data_recebimento, data_vencimento, status, observacoes, ordens_compra(numero, fornecedores(razao_social, nome_fantasia)), recebimento_itens(id, oc_item_id, quantidade_recebida, oc_itens(insumos(nome, codigo, unidades_medida(sigla))))",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  const itens: RecebimentoItemDetalhe[] = (data.recebimento_itens ?? []).map(
    (item) => {
      const insumo = item.oc_itens?.insumos ?? null;
      return {
        id: item.id,
        ocItemId: item.oc_item_id,
        insumoNome: insumo?.nome ?? "Insumo removido",
        insumoCodigo: insumo?.codigo ?? null,
        unidadeSigla: insumo?.unidades_medida?.sigla ?? null,
        quantidadeRecebida: item.quantidade_recebida,
      };
    },
  );

  return {
    id: data.id,
    numero: data.numero,
    ordemCompraId: data.ordem_compra_id,
    ordemCompraNumero: data.ordens_compra?.numero ?? null,
    fornecedorNome: nomeFornecedor(data.ordens_compra?.fornecedores ?? null),
    numeroNf: data.numero_nf,
    valorNf: data.valor_nf,
    dataRecebimento: data.data_recebimento,
    dataVencimento: data.data_vencimento,
    status: data.status as StatusRecebimento,
    observacoes: data.observacoes,
    itens,
  };
}

/**
 * Ordens de compra aptas a receber: status aprovado ou recebido_parcial.
 * Para cada item traz a quantidade pedida e o quanto já foi recebido (somando
 * recebimentos anteriores), expondo o saldo a receber. Itens sem saldo são
 * mantidos para conferência, mas o form sugere o saldo como default.
 */
export async function listarOrdensReceptiveis(): Promise<OrdemReceptivel[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ordens_compra")
    .select(
      "id, numero, status, fornecedores(razao_social, nome_fantasia), oc_itens(id, quantidade, insumos(nome, codigo, unidades_medida(sigla)), recebimento_itens(quantidade_recebida))",
    )
    .in("status", ["aprovado", "recebido_parcial"])
    .order("data_emissao", { ascending: false });

  if (error) {
    throw new Error("Não foi possível carregar as ordens a receber");
  }

  return (data ?? []).map((ordem) => {
    const itens: OrdemReceptivelItem[] = (ordem.oc_itens ?? []).map((item) => {
      const insumo = item.insumos ?? null;
      const recebida = totalRecebido(item.recebimento_itens ?? []);
      const saldo = saldoAReceber(item.quantidade, recebida);
      return {
        ocItemId: item.id,
        insumoNome: insumo?.nome ?? "Insumo removido",
        insumoCodigo: insumo?.codigo ?? null,
        unidadeSigla: insumo?.unidades_medida?.sigla ?? null,
        quantidadePedida: item.quantidade,
        quantidadeRecebida: recebida,
        saldoAReceber: saldo,
      };
    });

    return {
      id: ordem.id,
      numero: ordem.numero,
      fornecedorNome: nomeFornecedor(ordem.fornecedores ?? null),
      status: ordem.status,
      itens,
    };
  });
}

/**
 * Trilha do recebimento a partir do audit_log. Resolve os nomes dos usuários
 * pela RPC nomes_usuarios_auditoria (security definer); registros sem usuário
 * aparecem como "Sistema".
 */
export async function trilhaRecebimento(id: string): Promise<EventoTrilha[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("audit_log")
    .select(
      "id, tabela, registro_id, acao, usuario_id, dados_antes, dados_depois, criado_em",
    )
    .eq("tabela", "recebimentos")
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
    const { data: usuarios } = await supabase.rpc("nomes_usuarios_auditoria", {
      p_ids: idsUsuarios,
    });
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

  return eventosDoAuditLog(registros);
}
