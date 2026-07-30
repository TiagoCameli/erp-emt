import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import {
  eventosDoAuditLog,
  type EventoTrilha,
  type RegistroAuditLog,
} from "@/components/canonicos";
import { resolverNomesAuditLog } from "@/lib/trilha-nomes";
import {
  idsFornecedoresPorNome,
  inicioDoDiaISO,
  padraoBusca,
} from "@/modules/compras/_shared/lista";
import type {
  AutoriaCotacao,
  OcGeradaCotacao,
  StatusCotacao,
} from "@/modules/compras/cotacoes/schemas";

/** Filtros e paginação da listagem de cotações. */
export interface ListarCotacoesParams {
  pagina: number;
  tamanho: number;
  status?: StatusCotacao;
  busca?: string;
  /** Período de criação (inclusive), yyyy-mm-dd. */
  de?: string;
  ate?: string;
  /** Categoria do custo da cotação (categorias_financeiras.id). */
  categoriaId?: string;
  /** Fornecedor que participou da cotação (cotacao_fornecedores). */
  fornecedorId?: string;
  /** Fornecedor escolhido como vencedor. */
  vencedorId?: string;
  /** Insumo presente em algum item cotado. */
  insumoId?: string;
  /** Cotação com ou sem ordem de compra gerada a partir dela. */
  ocGerada?: OcGeradaCotacao;
  /** Autoria da cotação, relativa a quem está olhando a lista. */
  autoria?: AutoriaCotacao;
  /** Usuário logado: necessário para resolver o filtro de autoria. */
  usuarioId?: string;
}

/**
 * Linha da listagem de cotações. `observacoes` e `criadoPorNome` são colunas
 * opcionais da tabela (nascem escondidas, o usuário liga no menu "Colunas").
 */
export interface CotacaoLista {
  id: string;
  numero: string | null;
  status: StatusCotacao;
  descricao: string | null;
  categoriaNome: string | null;
  qtdFornecedores: number;
  vencedorNome: string | null;
  createdAt: string;
  observacoes: string | null;
  criadoPorNome: string | null;
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
  condicaoPagamentoId: string | null;
  condicaoPagamentoDescricao: string | null;
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
  descricao: string | null;
  categoriaId: string | null;
  categoriaNome: string | null;
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

/** Opção de condição de pagamento ativa para o select do fornecedor da cotação. */
export interface CondicaoPagamentoOpcao {
  id: string;
  descricao: string;
}

/** Opção de categoria financeira para o Combobox de categoria do custo. */
export interface CategoriaOpcao {
  id: string;
  nome: string;
}

interface LinhaListaCotacao {
  id: string;
  numero: string | null;
  status: string;
  created_at: string;
  created_by: string | null;
  descricao: string | null;
  observacoes: string | null;
  vencedor_fornecedor_id: string | null;
  cotacao_fornecedores: { count: number }[] | null;
  fornecedores: { razao_social: string; nome_fantasia: string | null } | null;
  categorias_financeiras: { nome: string } | null;
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

/** Colunas fixas da listagem, sem os embeds que só existem quando há filtro. */
const SELECT_LISTA_COTACAO = `id, numero, status, created_at, created_by, descricao, observacoes,
   vencedor_fornecedor_id, cotacao_fornecedores(count),
   fornecedores(razao_social, nome_fantasia),
   categorias_financeiras(nome)`;

/**
 * Lista as cotações com paginação server-side (range + count exact), a
 * contagem de fornecedores agregada no banco e o nome do vencedor (quando
 * finalizada). Todo filtro é aplicado no banco, nunca na página carregada:
 * status, categoria do custo, fornecedor participante, fornecedor vencedor,
 * insumo cotado, existência de OC gerada, autoria, período de criação e busca
 * por número, descrição ou nome do vencedor. Traz também a descrição com o nome
 * da categoria do custo, e observações e quem criou (colunas opcionais).
 */
export async function listarCotacoes(
  params: ListarCotacoesParams,
): Promise<CotacoesPagina> {
  const supabase = await createClient();

  const pagina = Math.max(0, params.pagina);
  const tamanho = Math.max(1, params.tamanho);
  const de = pagina * tamanho;
  const ate = de + tamanho - 1;

  // Os embeds de filtro entram no select só quando o filtro está ligado: join a
  // mais em toda listagem seria custo cobrado de quem nem usa o filtro.
  //
  // `participante` é apelido obrigatório porque `cotacao_fornecedores(count)` já
  // ocupa o nome da relação, e a contagem tem que continuar somando TODOS os
  // fornecedores da cotação, não só o que está sendo filtrado. Como cada embed
  // é uma subconsulta lateral independente, o filtro do apelido não mexe no
  // count e o `!inner` corta as cotações onde o fornecedor não cotou.
  const partesSelect = [SELECT_LISTA_COTACAO];
  if (params.fornecedorId) {
    partesSelect.push("participante:cotacao_fornecedores!inner(fornecedor_id)");
  }
  if (params.insumoId) {
    partesSelect.push("item:cotacao_itens!inner(insumo_id)");
  }
  // "Com OC" é join interno; "sem OC" é join à esquerda mais embed nulo, que é
  // como o PostgREST expressa "não existe filho" (não há NOT EXISTS na API).
  if (params.ocGerada === "com") partesSelect.push("ordens_compra!inner(id)");
  if (params.ocGerada === "sem") partesSelect.push("ordens_compra!left(id)");

  let consulta = supabase
    .from("cotacoes")
    .select(partesSelect.join(", "), { count: "exact" })
    .order("created_at", { ascending: false })
    .range(de, ate);

  if (params.status) consulta = consulta.eq("status", params.status);
  if (params.categoriaId) {
    consulta = consulta.eq("categoria_id", params.categoriaId);
  }
  if (params.vencedorId) {
    consulta = consulta.eq("vencedor_fornecedor_id", params.vencedorId);
  }
  if (params.fornecedorId) {
    consulta = consulta.eq("participante.fornecedor_id", params.fornecedorId);
  }
  if (params.insumoId) {
    consulta = consulta.eq("item.insumo_id", params.insumoId);
  }
  if (params.ocGerada === "sem") {
    consulta = consulta.is("ordens_compra", null);
  }
  // Autoria só faz sentido com o usuário em mãos; sem ele o filtro é ignorado
  // em vez de virar uma lista errada. "Criadas por outros" é `neq`, então
  // cotação com autor nulo (carga antiga) fica fora das duas pontas.
  if (params.autoria && params.usuarioId) {
    consulta =
      params.autoria === "eu"
        ? consulta.eq("created_by", params.usuarioId)
        : consulta.neq("created_by", params.usuarioId);
  }
  // created_at é timestamptz: o dia final entra inteiro somando 1 dia e usando
  // "menor que", senão a cotação criada às 14h do dia "ate" ficaria de fora.
  if (params.de) consulta = consulta.gte("created_at", inicioDoDiaISO(params.de));
  if (params.ate) {
    consulta = consulta.lt("created_at", inicioDoDiaISO(params.ate, 1));
  }

  if (params.busca) {
    const padrao = padraoBusca(params.busca);
    const idsVencedores = await idsFornecedoresPorNome(supabase, padrao);
    const clausulas = [`numero.ilike.${padrao}`, `descricao.ilike.${padrao}`];
    if (idsVencedores.length > 0) {
      clausulas.push(`vencedor_fornecedor_id.in.(${idsVencedores.join(",")})`);
    }
    consulta = consulta.or(clausulas.join(","));
  }

  // `returns` explícito porque o select é montado em tempo de execução: sem
  // string literal o supabase-js não tem o que inferir.
  const { data, error, count } = await consulta.returns<LinhaListaCotacao[]>();

  if (error) {
    throw new Error("Não foi possível carregar as cotações");
  }

  const linhas = data ?? [];

  // Nome de quem criou vem pela RPC de auditoria (security definer): a tabela
  // `usuarios` não é legível por quem só tem permissão de Compras.
  const idsCriadores = [
    ...new Set(
      linhas
        .map((cotacao) => cotacao.created_by)
        .filter((id): id is string => id !== null),
    ),
  ];
  const nomesCriadores = new Map<string, string>();
  if (idsCriadores.length > 0) {
    const { data: usuarios } = await supabase.rpc("nomes_usuarios_auditoria", {
      p_ids: idsCriadores,
    });
    for (const usuario of usuarios ?? []) {
      nomesCriadores.set(usuario.id, usuario.nome);
    }
  }

  const itens: CotacaoLista[] = linhas.map((cotacao) => ({
    id: cotacao.id,
    numero: cotacao.numero,
    status: cotacao.status as StatusCotacao,
    descricao: cotacao.descricao,
    categoriaNome: cotacao.categorias_financeiras?.nome ?? null,
    qtdFornecedores: cotacao.cotacao_fornecedores?.[0]?.count ?? 0,
    vencedorNome: cotacao.vencedor_fornecedor_id
      ? nomeFornecedor(cotacao.fornecedores) || null
      : null,
    createdAt: cotacao.created_at,
    observacoes: cotacao.observacoes,
    criadoPorNome: cotacao.created_by
      ? (nomesCriadores.get(cotacao.created_by) ?? null)
      : null,
  }));

  return { itens, total: count ?? 0 };
}

interface LinhaFornecedorCotacao {
  id: string;
  fornecedor_id: string;
  condicao_pagamento_id: string | null;
  prazo_entrega_dias: number | null;
  observacao: string | null;
  fornecedores: { razao_social: string; nome_fantasia: string | null } | null;
  condicoes_pagamento: { descricao: string } | null;
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
      "id, numero, status, descricao, categoria_id, motivo_selecao, observacoes, vencedor_fornecedor_id, created_at, fornecedores(razao_social, nome_fantasia), categorias_financeiras(nome)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !cotacao) return null;

  const [{ data: fornecedoresData }, { data: itensData }] = await Promise.all([
    supabase
      .from("cotacao_fornecedores")
      .select(
        "id, fornecedor_id, condicao_pagamento_id, prazo_entrega_dias, observacao, fornecedores(razao_social, nome_fantasia), condicoes_pagamento(descricao)",
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
        condicaoPagamentoId: fornecedor.condicao_pagamento_id,
        condicaoPagamentoDescricao:
          fornecedor.condicoes_pagamento?.descricao ?? null,
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
    descricao: cotacao.descricao,
    categoriaId: cotacao.categoria_id,
    categoriaNome: cotacao.categorias_financeiras?.nome ?? null,
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

/** OC já gerada a partir de uma cotação (para link e aviso de duplicata). */
export interface OrdemGerada {
  id: string;
  numero: string | null;
}

/**
 * Ordens de compra geradas a partir desta cotação (ordens_compra.cotacao_id).
 * Usado no detalhe da cotação finalizada para mostrar as OCs já geradas e
 * evitar que o usuário gere uma OC duplicada sem perceber.
 */
export async function ordensDaCotacao(
  cotacaoId: string,
): Promise<OrdemGerada[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ordens_compra")
    .select("id, numero")
    .eq("cotacao_id", cotacaoId)
    .order("created_at", { ascending: false });

  if (error) return [];

  return (data ?? []).map((ordem) => ({
    id: ordem.id,
    numero: ordem.numero,
  }));
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

  // Mesma paginação da OC: o PostgREST corta em 1.000 e há mais de 3 mil ativos.
  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("insumos")
      .select("id, nome, codigo, unidades_medida(sigla)")
      .eq("ativo", true)
      .order("nome", { ascending: true })
      .range(de, ate),
  );

  if (erro) {
    throw new Error("Não foi possível carregar os insumos");
  }

  return linhas.map((insumo) => ({
    id: insumo.id,
    nome: insumo.nome,
    codigo: insumo.codigo,
    unidadeSigla: insumo.unidades_medida?.sigla ?? null,
  }));
}

/** Condições de pagamento ativas para o select do fornecedor, em ordem alfabética. */
export async function listarCondicoesPagamento(): Promise<
  CondicaoPagamentoOpcao[]
> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("condicoes_pagamento")
    .select("id, descricao")
    .eq("ativo", true)
    .order("descricao", { ascending: true });

  if (error) {
    throw new Error("Não foi possível carregar as condições de pagamento");
  }

  return (data ?? []).map((condicao) => ({
    id: condicao.id,
    descricao: condicao.descricao,
  }));
}

/**
 * Categorias de despesa ativas para o Combobox de categoria do custo da
 * cotação, em ordem alfabética. Só tipo 'despesa' e mesmo nome da query da
 * ordem de compra: cotação e OC classificam o mesmo custo, e categoria de
 * receita na lista só atrapalharia quem está cotando.
 */
export async function listarCategoriasCusto(): Promise<CategoriaOpcao[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("categorias_financeiras")
    .select("id, nome")
    .eq("ativo", true)
    .eq("tipo", "despesa")
    .order("nome", { ascending: true });

  if (error) {
    throw new Error("Não foi possível carregar as categorias do custo");
  }

  return (data ?? []).map((categoria) => ({
    id: categoria.id,
    nome: categoria.nome,
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

  const nomes = await resolverNomesAuditLog(supabase, registros);
  return eventosDoAuditLog(registros, { nomes, entidade: "Cotação", genero: "f" });
}
