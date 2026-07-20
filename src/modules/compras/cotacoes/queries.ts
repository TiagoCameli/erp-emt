import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  eventosDoAuditLog,
  type EventoTrilha,
  type RegistroAuditLog,
} from "@/components/canonicos";
import {
  idsFornecedoresPorNome,
  padraoBusca,
} from "@/modules/compras/_shared/lista";
import type { StatusCotacao } from "@/modules/compras/cotacoes/schemas";

/** Filtros e paginação da listagem de cotações. */
export interface ListarCotacoesParams {
  pagina: number;
  tamanho: number;
  status?: StatusCotacao;
  busca?: string;
}

/** Linha da listagem de cotações. */
export interface CotacaoLista {
  id: string;
  numero: string | null;
  status: StatusCotacao;
  qtdFornecedores: number;
  vencedorNome: string | null;
  createdAt: string;
}

/** Resultado paginado da listagem de cotações. */
export interface CotacoesPagina {
  itens: CotacaoLista[];
  total: number;
}

/** Fornecedor dentro do detalhe da cotação, com seu total cotado. */
export interface FornecedorCotacao {
  id: string;
  fornecedorId: string;
  fornecedorNome: string;
  condicaoPagamento: string | null;
  prazoEntregaDias: number | null;
  observacao: string | null;
  /** Soma de quantidade x preço de todos os itens deste fornecedor. */
  total: number;
  /** Total é o menor entre os fornecedores que cotaram. */
  menorTotal: boolean;
}

/** Insumo (linha do mapa comparativo). */
export interface InsumoCotacao {
  insumoId: string;
  insumoNome: string;
  insumoCodigo: string | null;
  unidadeSigla: string | null;
  quantidade: number;
}

/** Uma célula do mapa: preço de um fornecedor para um insumo. */
export interface CelulaPreco {
  precoUnitario: number;
  subtotal: number;
  /** Menor preço unitário da linha (insumo) entre os fornecedores. */
  menorPrecoDaLinha: boolean;
}

/** Detalhe da cotação com o mapa comparativo montado (insumo x fornecedor). */
export interface CotacaoDetalhe {
  id: string;
  numero: string | null;
  status: StatusCotacao;
  motivoSelecao: string | null;
  observacoes: string | null;
  vencedorFornecedorId: string | null;
  vencedorNome: string | null;
  createdAt: string;
  fornecedores: FornecedorCotacao[];
  insumos: InsumoCotacao[];
  /** precos[insumoId][cotacaoFornecedorId] -> célula, quando o fornecedor cotou o insumo. */
  precos: Record<string, Record<string, CelulaPreco>>;
}

/** Fornecedor disponível para entrar numa cotação (select). */
export interface FornecedorOpcao {
  id: string;
  nome: string;
}

/** Insumo disponível para cotar (select). */
export interface InsumoOpcao {
  id: string;
  nome: string;
  codigo: string | null;
  unidadeSigla: string | null;
}

interface LinhaListaCotacao {
  id: string;
  numero: string | null;
  status: string;
  created_at: string;
  vencedor_fornecedor_id: string | null;
  cotacao_fornecedores: { count: number }[] | null;
  fornecedores: { razao_social: string; nome_fantasia: string | null } | null;
}

/** Nome de exibição do fornecedor: nome fantasia quando há, senão razão social. */
function nomeFornecedor(
  fornecedor:
    | { razao_social: string; nome_fantasia: string | null }
    | null
    | undefined,
): string {
  if (!fornecedor) return "";
  return fornecedor.nome_fantasia ?? fornecedor.razao_social;
}

/**
 * Lista as cotações com paginação server-side (range + count exact), a
 * contagem de fornecedores agregada no banco e o nome do vencedor (quando
 * finalizada). Aceita filtro por status e busca por número da cotação ou
 * nome do fornecedor vencedor.
 */
export async function listarCotacoes(
  params: ListarCotacoesParams,
): Promise<CotacoesPagina> {
  const supabase = await createClient();

  const pagina = Math.max(0, params.pagina);
  const tamanho = Math.max(1, params.tamanho);
  const de = pagina * tamanho;
  const ate = de + tamanho - 1;

  let consulta = supabase
    .from("cotacoes")
    .select(
      "id, numero, status, created_at, vencedor_fornecedor_id, cotacao_fornecedores(count), fornecedores(razao_social, nome_fantasia)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(de, ate);

  if (params.status) consulta = consulta.eq("status", params.status);

  if (params.busca) {
    const padrao = padraoBusca(params.busca);
    const idsVencedores = await idsFornecedoresPorNome(supabase, padrao);
    const clausulas = [`numero.ilike.${padrao}`];
    if (idsVencedores.length > 0) {
      clausulas.push(`vencedor_fornecedor_id.in.(${idsVencedores.join(",")})`);
    }
    consulta = consulta.or(clausulas.join(","));
  }

  const { data, error, count } = await consulta;

  if (error) {
    throw new Error("Não foi possível carregar as cotações");
  }

  const itens: CotacaoLista[] = ((data ?? []) as LinhaListaCotacao[]).map(
    (cotacao) => ({
      id: cotacao.id,
      numero: cotacao.numero,
      status: cotacao.status as StatusCotacao,
      qtdFornecedores: cotacao.cotacao_fornecedores?.[0]?.count ?? 0,
      vencedorNome: cotacao.vencedor_fornecedor_id
        ? nomeFornecedor(cotacao.fornecedores) || null
        : null,
      createdAt: cotacao.created_at,
    }),
  );

  return { itens, total: count ?? 0 };
}

interface LinhaFornecedorCotacao {
  id: string;
  fornecedor_id: string;
  condicao_pagamento: string | null;
  prazo_entrega_dias: number | null;
  observacao: string | null;
  fornecedores: { razao_social: string; nome_fantasia: string | null } | null;
}

interface LinhaItemCotacao {
  id: string;
  cotacao_fornecedor_id: string;
  insumo_id: string;
  quantidade: number;
  preco_unitario: number;
  insumos: {
    nome: string;
    codigo: string | null;
    unidades_medida: { sigla: string } | null;
  } | null;
}

/**
 * Detalhe de uma cotação montando o mapa comparativo: linhas = insumos,
 * colunas = fornecedores. Calcula subtotal por célula, total por fornecedor,
 * menor preço por linha e o menor total. Retorna null se não existe.
 */
export async function buscarCotacao(
  id: string,
): Promise<CotacaoDetalhe | null> {
  const supabase = await createClient();

  const { data: cotacao, error } = await supabase
    .from("cotacoes")
    .select(
      "id, numero, status, motivo_selecao, observacoes, vencedor_fornecedor_id, created_at, fornecedores(razao_social, nome_fantasia)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !cotacao) return null;

  const [{ data: fornecedoresData }, { data: itensData }] = await Promise.all([
    supabase
      .from("cotacao_fornecedores")
      .select(
        "id, fornecedor_id, condicao_pagamento, prazo_entrega_dias, observacao, fornecedores(razao_social, nome_fantasia)",
      )
      .eq("cotacao_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("cotacao_itens")
      .select(
        "id, cotacao_fornecedor_id, insumo_id, quantidade, preco_unitario, insumos(nome, codigo, unidades_medida(sigla))",
      )
      .eq("cotacao_id", id),
  ]);

  const fornecedoresLinhas = (fornecedoresData ?? []) as LinhaFornecedorCotacao[];
  const itensLinhas = (itensData ?? []) as LinhaItemCotacao[];

  // Total cotado por fornecedor (soma de quantidade x preço dos itens dele).
  const totalPorFornecedor = new Map<string, number>();
  // Menor preço unitário por insumo, para destacar a célula vencedora da linha.
  const menorPrecoPorInsumo = new Map<string, number>();
  // precos[insumoId][cotacaoFornecedorId] -> célula.
  const precos: Record<string, Record<string, CelulaPreco>> = {};
  // Insumos vistos, com a quantidade e os dados de exibição.
  const insumosMap = new Map<string, InsumoCotacao>();

  for (const item of itensLinhas) {
    const subtotal = item.quantidade * item.preco_unitario;
    totalPorFornecedor.set(
      item.cotacao_fornecedor_id,
      (totalPorFornecedor.get(item.cotacao_fornecedor_id) ?? 0) + subtotal,
    );

    const menorAtual = menorPrecoPorInsumo.get(item.insumo_id);
    if (menorAtual === undefined || item.preco_unitario < menorAtual) {
      menorPrecoPorInsumo.set(item.insumo_id, item.preco_unitario);
    }

    if (!insumosMap.has(item.insumo_id)) {
      insumosMap.set(item.insumo_id, {
        insumoId: item.insumo_id,
        insumoNome: item.insumos?.nome ?? "",
        insumoCodigo: item.insumos?.codigo ?? null,
        unidadeSigla: item.insumos?.unidades_medida?.sigla ?? null,
        quantidade: item.quantidade,
      });
    }

    const linha = precos[item.insumo_id] ?? {};
    linha[item.cotacao_fornecedor_id] = {
      precoUnitario: item.preco_unitario,
      subtotal,
      menorPrecoDaLinha: false,
    };
    precos[item.insumo_id] = linha;
  }

  // Marca a célula de menor preço por linha (insumo).
  for (const [insumoId, menor] of menorPrecoPorInsumo) {
    const linha = precos[insumoId];
    if (!linha) continue;
    for (const celula of Object.values(linha)) {
      if (celula.precoUnitario === menor) celula.menorPrecoDaLinha = true;
    }
  }

  // Menor total entre os fornecedores que efetivamente cotaram (total > 0).
  let menorTotal = Number.POSITIVE_INFINITY;
  for (const total of totalPorFornecedor.values()) {
    if (total > 0 && total < menorTotal) menorTotal = total;
  }

  const fornecedores: FornecedorCotacao[] = fornecedoresLinhas.map(
    (fornecedor) => {
      const total = totalPorFornecedor.get(fornecedor.id) ?? 0;
      return {
        id: fornecedor.id,
        fornecedorId: fornecedor.fornecedor_id,
        fornecedorNome: nomeFornecedor(fornecedor.fornecedores),
        condicaoPagamento: fornecedor.condicao_pagamento,
        prazoEntregaDias: fornecedor.prazo_entrega_dias,
        observacao: fornecedor.observacao,
        total,
        menorTotal: total > 0 && total === menorTotal,
      };
    },
  );

  const insumos = [...insumosMap.values()].sort((a, b) =>
    a.insumoNome.localeCompare(b.insumoNome, "pt-BR"),
  );

  return {
    id: cotacao.id,
    numero: cotacao.numero,
    status: cotacao.status as StatusCotacao,
    motivoSelecao: cotacao.motivo_selecao,
    observacoes: cotacao.observacoes,
    vencedorFornecedorId: cotacao.vencedor_fornecedor_id,
    vencedorNome: cotacao.vencedor_fornecedor_id
      ? nomeFornecedor(cotacao.fornecedores) || null
      : null,
    createdAt: cotacao.created_at,
    fornecedores,
    insumos,
    precos,
  };
}

/** Fornecedores ativos para o select, em ordem de exibição. */
export async function listarFornecedores(): Promise<FornecedorOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("fornecedores")
    .select("id, razao_social, nome_fantasia")
    .eq("ativo", true)
    .order("razao_social", { ascending: true });

  if (error) {
    throw new Error("Não foi possível carregar os fornecedores");
  }

  return (data ?? [])
    .map((fornecedor) => ({
      id: fornecedor.id,
      nome: fornecedor.nome_fantasia ?? fornecedor.razao_social,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Insumos ativos para o select de itens, com sigla da unidade. */
export async function listarInsumos(): Promise<InsumoOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("insumos")
    .select("id, nome, codigo, unidades_medida(sigla)")
    .eq("ativo", true)
    .order("nome", { ascending: true });

  if (error) {
    throw new Error("Não foi possível carregar os insumos");
  }

  return (data ?? []).map((insumo) => ({
    id: insumo.id,
    nome: insumo.nome,
    codigo: insumo.codigo,
    unidadeSigla: insumo.unidades_medida?.sigla ?? null,
  }));
}

/**
 * Trilha de auditoria da cotação a partir do audit_log. Resolve os nomes dos
 * usuários por RPC (security definer), como na auditoria do sistema.
 */
export async function trilhaCotacao(id: string): Promise<EventoTrilha[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("audit_log")
    .select("id, tabela, registro_id, acao, usuario_id, dados_antes, dados_depois, criado_em")
    .eq("tabela", "cotacoes")
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
    usuario_nome: linha.usuario_id
      ? (nomesPorId.get(linha.usuario_id) ?? "Sistema")
      : "Sistema",
    dados_antes: linha.dados_antes,
    dados_depois: linha.dados_depois,
    criado_em: linha.criado_em,
  }));

  return eventosDoAuditLog(registros);
}
