import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";

import type { CasamentoSalvo, ItemCandidato } from "./de-para";
import type {
  ConfigReajuste,
  IndiceSiac,
  LinhaListaReajuste,
  LinhaReajuste,
  PdfPendente,
  RateioItem,
  ReajusteMedicao,
  ReajusteVigente,
  RelatorioResumo,
  SituacaoFiltroReajuste,
} from "./tipos";

/**
 * Consultas do reajuste (Fase 6), com o cliente do usuário: a RLS esconde o que é de contrato fora
 * da lista de acesso (D3). D7: todo numeric chega como TEXTO (`::text` no select) e só é exibido ou
 * comparado; a diferença para o anterior vem pronta de `mc_v_reajuste_medicao`.
 */

type Faixa<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

function falhou(erro: { message: string } | null | undefined): void {
  if (erro) throw new Error(erro.message);
}

function linhasOuErro<T>(r: { linhas: T[]; erro: string | null }): T[] {
  if (r.erro) throw new Error(r.erro);
  return r.linhas;
}

interface VinculoPdf {
  arquivo_id: string;
  created_at: string;
  arquivos: { path_storage: string; nome_original: string } | null;
}

async function vinculosDaMedicao(supabase: Awaited<ReturnType<typeof createClient>>, medicaoId: string): Promise<VinculoPdf[]> {
  const { data, error } = await supabase
    .from("anexo_vinculos")
    .select("arquivo_id, created_at, arquivos(path_storage, nome_original)")
    .eq("entidade_tipo", "mc_reajuste")
    .eq("entidade_id", medicaoId)
    .order("created_at", { ascending: true });
  falhou(error);
  return (data ?? []) as unknown as VinculoPdf[];
}

interface LinhaRelatorio {
  id: string;
  sequencia: number;
  origem: string;
  situacao: string;
  total: string;
  valor_pi: string | null;
  medicao_tipo: string | null;
  contrato_texto: string | null;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  data_base: string | null;
  processado_em: string | null;
  arquivo_id: string | null;
  observacao: string | null;
  created_at: string;
  created_by: string | null;
  excluido_em: string | null;
  excluido_por: string | null;
  motivo_exclusao: string | null;
}

interface LinhaSiacBanco {
  id: string;
  ordem: number;
  grupo: string;
  grupo_descricao: string | null;
  codigo: string;
  descricao: string;
  unidade: string;
  preco_unitario: string;
  valor_pi: string;
  fator: string;
  reajuste: string;
}

/**
 * O reajuste da medição: o que vale (`mc_v_reajuste_medicao`), o histórico inteiro (inclusive os
 * excluídos, com o motivo), e as linhas, o rateio e os índices só do relatório que vale. O código
 * do item no rateio é o da planilha da versão da medição (ou de outra versão, se o item saiu).
 */
export async function carregarReajusteMedicao(medicaoId: string): Promise<ReajusteMedicao> {
  const supabase = await createClient();

  const [medicaoRes, vigenteRes, relatoriosRes, vinculos] = await Promise.all([
    supabase.from("mc_medicoes").select("id, versao_id").eq("id", medicaoId).maybeSingle(),
    supabase
      .from("mc_v_reajuste_medicao")
      .select("relatorio_id, sequencia, origem, situacao, total:total::text, anterior_total:anterior_total::text, diferenca:diferenca::text")
      .eq("medicao_id", medicaoId)
      .maybeSingle(),
    supabase
      .from("mc_reajuste_relatorios")
      .select(
        "id, sequencia, origem, situacao, total:total::text, valor_pi:valor_pi::text, medicao_tipo, contrato_texto, periodo_inicio, periodo_fim, data_base, processado_em, arquivo_id, observacao, created_at, created_by, excluido_em, excluido_por, motivo_exclusao",
      )
      .eq("medicao_id", medicaoId)
      .order("sequencia", { ascending: true }),
    vinculosDaMedicao(supabase, medicaoId),
  ]);
  falhou(medicaoRes.error);
  falhou(vigenteRes.error);
  falhou(relatoriosRes.error);

  const v = vigenteRes.data as
    | { relatorio_id: string | null; sequencia: number | null; origem: string | null; situacao: string | null; total: string | null; anterior_total: string | null; diferenca: string | null }
    | null;
  const vigente: ReajusteVigente | null =
    v && v.relatorio_id
      ? {
          relatorioId: v.relatorio_id,
          sequencia: v.sequencia ?? 0,
          origem: v.origem ?? "",
          situacao: v.situacao ?? "",
          total: v.total ?? "0",
          anteriorTotal: v.anterior_total,
          diferenca: v.diferenca,
        }
      : null;

  const relatoriosBanco = (relatoriosRes.data ?? []) as unknown as LinhaRelatorio[];
  const usuarioIds = [
    ...new Set(relatoriosBanco.flatMap((r) => [r.created_by, r.excluido_por]).filter((u): u is string => u !== null)),
  ];
  const nomesRes =
    usuarioIds.length > 0
      ? await supabase.rpc("nomes_usuarios_auditoria", { p_ids: usuarioIds })
      : { data: [] as { id: string; nome: string }[], error: null };
  const nomePorId = new Map(((nomesRes.data ?? []) as { id: string; nome: string }[]).map((u) => [u.id, u.nome]));
  const nomeArquivo = new Map(vinculos.map((x) => [x.arquivo_id, x.arquivos?.nome_original ?? null]));

  const relatorios: RelatorioResumo[] = relatoriosBanco.map((r) => ({
    id: r.id,
    sequencia: r.sequencia,
    origem: r.origem,
    situacao: r.situacao,
    total: r.total,
    valorPi: r.valor_pi,
    medicaoTipo: r.medicao_tipo,
    contratoTexto: r.contrato_texto,
    periodoInicio: r.periodo_inicio,
    periodoFim: r.periodo_fim,
    dataBase: r.data_base,
    processadoEm: r.processado_em,
    criadoEm: r.created_at,
    criadoPorNome: r.created_by ? (nomePorId.get(r.created_by) ?? null) : null,
    arquivoId: r.arquivo_id,
    arquivoNome: r.arquivo_id ? (nomeArquivo.get(r.arquivo_id) ?? null) : null,
    observacao: r.observacao,
    excluidoEm: r.excluido_em,
    excluidoPorNome: r.excluido_por ? (nomePorId.get(r.excluido_por) ?? null) : null,
    motivoExclusao: r.motivo_exclusao,
  }));

  if (!vigente || vigente.origem !== "siac") return { vigente, relatorios, linhas: [], indices: [] };

  const relatorioId = vigente.relatorioId;
  type Rateio = { linha_id: string; item_id: string; valor_base: string; valor: string };
  const [linhasRes, rateioRes, indicesRes] = await Promise.all([
    todasAsLinhas<LinhaSiacBanco>((de, ate) =>
      supabase
        .from("mc_reajuste_linhas")
        .select(
          "id, ordem, grupo, grupo_descricao, codigo, descricao, unidade, preco_unitario:preco_unitario::text, valor_pi:valor_pi::text, fator:fator::text, reajuste:reajuste::text",
        )
        .eq("relatorio_id", relatorioId)
        .order("ordem", { ascending: true })
        .range(de, ate) as unknown as Faixa<LinhaSiacBanco>,
    ),
    todasAsLinhas<Rateio>((de, ate) =>
      supabase
        .from("mc_reajuste_rateio")
        .select("linha_id, item_id, valor_base:valor_base::text, valor:valor::text")
        .eq("relatorio_id", relatorioId)
        .order("linha_id", { ascending: true })
        .order("item_id", { ascending: true })
        .range(de, ate) as unknown as Faixa<Rateio>,
    ),
    supabase
      .from("mc_reajuste_relatorio_indices")
      .select("sigla, i0:i0::text, i1:i1::text, k:k::text")
      .eq("relatorio_id", relatorioId)
      .order("sigla", { ascending: true }),
  ]);
  const linhasBanco = linhasOuErro(linhasRes);
  const rateioBanco = linhasOuErro(rateioRes);
  falhou(indicesRes.error);

  // Código do item: a linha da planilha da versão da medição; sem ela (item que saiu), qualquer outra.
  const versaoId = (medicaoRes.data as { versao_id: string } | null)?.versao_id ?? null;
  const itemIds = [...new Set(rateioBanco.map((r) => r.item_id))];
  const codigoPorItem = new Map<string, { codigo: string; daVersao: boolean }>();
  if (itemIds.length > 0) {
    const planilha = linhasOuErro(
      await todasAsLinhas<{ item_id: string; codigo: string; versao_id: string }>((de, ate) =>
        supabase
          .from("mc_planilha_itens")
          .select("item_id, codigo, versao_id")
          .in("item_id", itemIds)
          .order("item_id", { ascending: true })
          .range(de, ate) as unknown as Faixa<{ item_id: string; codigo: string; versao_id: string }>,
      ),
    );
    for (const p of planilha) {
      const atual = codigoPorItem.get(p.item_id);
      const daVersao = p.versao_id === versaoId;
      if (!atual || (!atual.daVersao && daVersao)) codigoPorItem.set(p.item_id, { codigo: p.codigo, daVersao });
    }
  }

  const rateioPorLinha = new Map<string, RateioItem[]>();
  for (const r of rateioBanco) {
    const lista = rateioPorLinha.get(r.linha_id) ?? [];
    lista.push({ itemId: r.item_id, codigo: codigoPorItem.get(r.item_id)?.codigo ?? null, valor: r.valor, valorBase: r.valor_base });
    rateioPorLinha.set(r.linha_id, lista);
  }

  const linhas: LinhaReajuste[] = linhasBanco.map((l) => ({
    id: l.id,
    ordem: l.ordem,
    grupo: l.grupo,
    grupoDescricao: l.grupo_descricao,
    codigo: l.codigo,
    descricao: l.descricao,
    unidade: l.unidade,
    precoUnitario: l.preco_unitario,
    valorPi: l.valor_pi,
    fator: l.fator,
    reajuste: l.reajuste,
    rateio: rateioPorLinha.get(l.id) ?? [],
  }));
  const indices = ((indicesRes.data ?? []) as unknown as IndiceSiac[]).map((i) => ({ sigla: i.sigla, i0: i.i0, i1: i.i1, k: i.k }));

  return { vigente, relatorios, linhas, indices };
}

/**
 * Serviços da versão da medição, na ordem da planilha, com o valor de cada um nesta medição
 * (`mc_v_medicao_itens.valor_medicao`, texto; "0" quando o item não tem linha na view). É o que o
 * de-para sugere e o que a tela oferece para casar (o L09 tem 245 serviços).
 */
export async function itensParaCasar(medicaoId: string): Promise<ItemCandidato[]> {
  const supabase = await createClient();
  const medicaoRes = await supabase.from("mc_medicoes").select("id, versao_id").eq("id", medicaoId).maybeSingle();
  falhou(medicaoRes.error);
  const m = medicaoRes.data as { versao_id: string } | null;
  if (!m) return [];

  type Planilha = { item_id: string; codigo: string; descricao: string | null; unidade: string | null; preco: string };
  type Valor = { item_id: string; valor_medicao: string | null };
  const [planilhaRes, valoresRes] = await Promise.all([
    todasAsLinhas<Planilha>((de, ate) =>
      supabase
        .from("mc_planilha_itens")
        .select("item_id, codigo, descricao, unidade, preco:preco_unitario::text")
        .eq("versao_id", m.versao_id)
        .eq("tipo", "servico")
        .order("ordem", { ascending: true })
        .range(de, ate) as unknown as Faixa<Planilha>,
    ),
    todasAsLinhas<Valor>((de, ate) =>
      supabase
        .from("mc_v_medicao_itens")
        .select("item_id, valor_medicao:valor_medicao::text")
        .eq("medicao_id", medicaoId)
        .order("item_id", { ascending: true })
        .range(de, ate) as unknown as Faixa<Valor>,
    ),
  ]);
  const valorPorItem = new Map(linhasOuErro(valoresRes).map((v) => [v.item_id, v.valor_medicao]));
  return linhasOuErro(planilhaRes).map((p) => ({
    itemId: p.item_id,
    codigo: p.codigo,
    descricao: p.descricao,
    unidade: p.unidade,
    preco: p.preco,
    valor: valorPorItem.get(p.item_id) ?? "0",
  }));
}

/** De-para guardado do contrato (linha SIAC -> itens), reaproveitado no import seguinte. */
export async function casamentosSalvos(contratoId: string): Promise<CasamentoSalvo[]> {
  const supabase = await createClient();
  type Linha = { grupo: string; codigo: string; item_id: string };
  const linhas = linhasOuErro(
    await todasAsLinhas<Linha>((de, ate) =>
      supabase
        .from("mc_reajuste_de_para")
        .select("grupo, codigo, item_id")
        .eq("contrato_id", contratoId)
        .order("grupo", { ascending: true })
        .order("codigo", { ascending: true })
        .order("item_id", { ascending: true })
        .range(de, ate) as unknown as Faixa<Linha>,
    ),
  );
  return linhas.map((l) => ({ grupo: l.grupo, codigo: l.codigo, itemId: l.item_id }));
}

/** O PDF anexado à medição como `mc_reajuste` (o vínculo com aquele arquivo), ou null. */
export async function pdfDaMedicao(medicaoId: string, arquivoId: string): Promise<{ path: string; nome: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("anexo_vinculos")
    .select("arquivo_id, created_at, arquivos(path_storage, nome_original)")
    .eq("entidade_tipo", "mc_reajuste")
    .eq("entidade_id", medicaoId)
    .eq("arquivo_id", arquivoId)
    .limit(1);
  falhou(error);
  const arquivo = ((data ?? []) as unknown as VinculoPdf[])[0]?.arquivos ?? null;
  return arquivo ? { path: arquivo.path_storage, nome: arquivo.nome_original } : null;
}

/** PDFs anexados à medição (`mc_reajuste`) que ainda não estão em relatório nenhum (nem excluído). */
export async function pdfsPendentes(medicaoId: string): Promise<PdfPendente[]> {
  const supabase = await createClient();
  const [vinculos, usadosRes] = await Promise.all([
    vinculosDaMedicao(supabase, medicaoId),
    supabase.from("mc_reajuste_relatorios").select("arquivo_id").eq("medicao_id", medicaoId),
  ]);
  falhou(usadosRes.error);
  const usados = new Set(((usadosRes.data ?? []) as { arquivo_id: string | null }[]).map((r) => r.arquivo_id).filter((a) => a !== null));
  const vistos = new Set<string>();
  const pendentes: PdfPendente[] = [];
  for (const v of vinculos) {
    if (usados.has(v.arquivo_id) || vistos.has(v.arquivo_id)) continue;
    vistos.add(v.arquivo_id);
    pendentes.push({ arquivoId: v.arquivo_id, nome: v.arquivos?.nome_original ?? "arquivo", criadoEm: v.created_at });
  }
  return pendentes;
}

/** Seção Reajuste do contrato; sem linha, o padrão do banco (sem reajuste, 12 meses). */
export async function carregarConfigReajuste(contratoId: string): Promise<ConfigReajuste> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mc_reajuste_config")
    .select("tem_reajuste, data_base, periodicidade_meses, indice_descricao")
    .eq("contrato_id", contratoId)
    .maybeSingle();
  falhou(error);
  if (!data) return { temReajuste: false, dataBase: null, periodicidadeMeses: 12, indiceDescricao: null };
  return {
    temReajuste: data.tem_reajuste,
    dataBase: data.data_base,
    periodicidadeMeses: data.periodicidade_meses,
    indiceDescricao: data.indice_descricao,
  };
}

/**
 * Aba Reajuste: as medições enviadas e aprovadas (de um contrato ou de todos os visíveis) com o
 * reajuste que vale à esquerda. Ordem: contrato e medição mais recente primeiro.
 */
export async function listarReajustes(filtro: { contratoId?: string; situacao?: SituacaoFiltroReajuste }): Promise<LinhaListaReajuste[]> {
  const supabase = await createClient();

  type Medicao = { id: string; contrato_id: string; numero: number; periodo_inicio: string; periodo_fim: string; status: string };
  type Vigente = {
    medicao_id: string;
    relatorio_id: string;
    sequencia: number;
    origem: string;
    situacao: string;
    total: string;
    diferenca: string | null;
    relatorios: number;
  };

  const [medicoesRes, contratosRes, vigentesRes] = await Promise.all([
    todasAsLinhas<Medicao>((de, ate) => {
      let q = supabase
        .from("mc_medicoes")
        .select("id, contrato_id, numero, periodo_inicio, periodo_fim, status")
        .in("status", ["enviada", "aprovada"]);
      if (filtro.contratoId) q = q.eq("contrato_id", filtro.contratoId);
      return q.order("contrato_id", { ascending: true }).order("numero", { ascending: false }).range(de, ate) as unknown as Faixa<Medicao>;
    }),
    supabase.from("mc_contratos").select("id, codigo, nome_obra").is("excluido_em", null),
    todasAsLinhas<Vigente>((de, ate) => {
      let q = supabase
        .from("mc_v_reajuste_medicao")
        .select("medicao_id, relatorio_id, sequencia, origem, situacao, total:total::text, diferenca:diferenca::text, relatorios");
      if (filtro.contratoId) q = q.eq("contrato_id", filtro.contratoId);
      return q.order("medicao_id", { ascending: true }).range(de, ate) as unknown as Faixa<Vigente>;
    }),
  ]);
  falhou(contratosRes.error);
  const contratos = new Map((contratosRes.data ?? []).map((c) => [c.id, c]));
  const vigentes = new Map(linhasOuErro(vigentesRes).map((v) => [v.medicao_id, v]));

  const linhas: LinhaListaReajuste[] = [];
  for (const m of linhasOuErro(medicoesRes)) {
    const c = contratos.get(m.contrato_id);
    if (!c) continue;
    const v = vigentes.get(m.id) ?? null;
    const situacao = v?.situacao ?? null;
    if (filtro.situacao === "sem_relatorio" && v) continue;
    if ((filtro.situacao === "provisorio" || filtro.situacao === "definitivo") && situacao !== filtro.situacao) continue;
    linhas.push({
      medicaoId: m.id,
      contratoId: m.contrato_id,
      contratoCodigo: c.codigo,
      contratoNome: c.nome_obra,
      numero: m.numero,
      periodoInicio: m.periodo_inicio,
      periodoFim: m.periodo_fim,
      status: m.status,
      relatorioId: v?.relatorio_id ?? null,
      sequencia: v?.sequencia ?? null,
      origem: v?.origem ?? null,
      situacao,
      total: v?.total ?? null,
      diferenca: v?.diferenca ?? null,
      relatorios: v?.relatorios ?? 0,
    });
  }
  return linhas.sort((a, b) => a.contratoCodigo.localeCompare(b.contratoCodigo) || b.numero - a.numero);
}

/** O mínimo da medição para importar o reajuste (contrato, número, período, status), ou null (RLS). */
export async function medicaoParaReajuste(
  medicaoId: string,
): Promise<{ id: string; contratoId: string; numero: number; periodoInicio: string; periodoFim: string; status: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mc_medicoes")
    .select("id, contrato_id, numero, periodo_inicio, periodo_fim, status")
    .eq("id", medicaoId)
    .maybeSingle();
  falhou(error);
  if (!data) return null;
  return { id: data.id, contratoId: data.contrato_id, numero: data.numero, periodoInicio: data.periodo_inicio, periodoFim: data.periodo_fim, status: data.status };
}
