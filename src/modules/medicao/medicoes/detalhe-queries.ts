import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import { lerDecimal, paraTexto, somar } from "@/modules/medicao/_shared/decimal";

import type { ItemCongelado, RotuloItem } from "./aprovacao";
import { revisaoCorrente } from "./ciclo";
import type { EventoMedicao, ItemMedicaoDetalhe, MedicaoDetalhe, RevisaoMedicao, ServicoAjuste } from "./tipos";

/**
 * Detalhe da medição (Fase 5, Task 3). Junta:
 * - a medição (`mc_medicoes`), o contrato, o número da versão e o valor de `mc_v_medicao_totais`;
 * - as revisões e a corrente (em aberto ou enviada de maior número, como `fn_mc_revisao_corrente`);
 * - os itens de `mc_v_medicao_itens` com código, descrição e unidade da linha da planilha que a view
 *   apontou (`planilha_item_id`: a da versão da medição ou, para o item que saiu num aditivo, a da
 *   última versão em que aparece), na ordem da planilha;
 * - os ajustes da revisão corrente (sem corrente, os da última revisão) somados por item;
 * - os eventos, com o nome de quem fez.
 *
 * D7: todo numeric chega como TEXTO (`::text` no select) e só é exibido. A única conta feita aqui é
 * a soma dos ajustes por item, que é QUANTIDADE (nunca dinheiro) e é exata (BigInt, `decimal.ts`).
 *
 * A RLS esconde a medição de contrato fora da lista de acesso (D3): volta null, e a página dá 404.
 */

interface LinhaPlanilha {
  id: string;
  item_id: string;
  codigo: string;
  descricao: string;
  unidade: string | null;
  ordem: number;
  tipo: string;
}

interface LinhaItemView {
  item_id: string;
  planilha_item_id: string | null;
  qtd_medida: string | null;
  qtd_aprovada: string | null;
  glosa: string | null;
  valor_medicao: string | null;
}

const COLUNAS_PLANILHA = "id, item_id, codigo, descricao, unidade, ordem, tipo";

function falhou(erro: { message: string } | null | undefined): void {
  if (erro) throw new Error(erro.message);
}

export async function carregarMedicao(id: string): Promise<MedicaoDetalhe | null> {
  const supabase = await createClient();

  const medicaoRes = await supabase
    .from("mc_medicoes")
    .select("id, contrato_id, numero, periodo_inicio, periodo_fim, status, versao_id")
    .eq("id", id)
    .maybeSingle();
  falhou(medicaoRes.error);
  const m = medicaoRes.data;
  if (!m) return null;

  const [contratoRes, versaoRes, totalRes, revisoesRes, itensRes, planilhaRes, eventosRes] = await Promise.all([
    supabase.from("mc_contratos").select("codigo, nome_obra").eq("id", m.contrato_id).maybeSingle(),
    supabase.from("mc_planilha_versoes").select("numero").eq("id", m.versao_id).maybeSingle(),
    supabase.from("mc_v_medicao_totais").select("valor:valor::text").eq("medicao_id", id).maybeSingle(),
    supabase
      .from("mc_medicao_revisoes")
      .select("id, numero, fase, status, motivo, created_at")
      .eq("medicao_id", id)
      .order("numero", { ascending: true }),
    todasAsLinhas<LinhaItemView>((de, ate) =>
      supabase
        .from("mc_v_medicao_itens")
        .select(
          "item_id, planilha_item_id, qtd_medida:qtd_medida::text, qtd_aprovada:qtd_aprovada::text, glosa:glosa::text, valor_medicao:valor_medicao::text",
        )
        .eq("medicao_id", id)
        .order("item_id", { ascending: true })
        .range(de, ate) as unknown as PromiseLike<{ data: LinhaItemView[] | null; error: { message: string } | null }>,
    ),
    todasAsLinhas<LinhaPlanilha>((de, ate) =>
      supabase
        .from("mc_planilha_itens")
        .select(COLUNAS_PLANILHA)
        .eq("versao_id", m.versao_id)
        .order("ordem", { ascending: true })
        .range(de, ate),
    ),
    supabase
      .from("mc_medicao_eventos")
      .select("id, evento, de_status, para_status, motivo, usuario_id, criado_em")
      .eq("medicao_id", id)
      .order("criado_em", { ascending: true }),
  ]);
  falhou(contratoRes.error);
  falhou(versaoRes.error);
  falhou(totalRes.error);
  falhou(revisoesRes.error);
  if (itensRes.erro) throw new Error(itensRes.erro);
  if (planilhaRes.erro) throw new Error(planilhaRes.erro);
  falhou(eventosRes.error);

  const revisoes: RevisaoMedicao[] = (revisoesRes.data ?? []).map((r) => ({
    id: r.id,
    numero: r.numero,
    fase: r.fase,
    status: r.status,
    motivo: r.motivo,
    criadoEm: r.created_at,
  }));
  const corrente = revisaoCorrente(revisoes);
  const referencia = corrente ?? revisoes[revisoes.length - 1] ?? null;

  // Linhas da planilha: as da versão da medição e, só para o que faltar (item que saiu num aditivo),
  // as que a view apontou em outra versão.
  const planilhaPorId = new Map(planilhaRes.linhas.map((p) => [p.id, p]));
  const faltando = [
    ...new Set(
      itensRes.linhas.map((i) => i.planilha_item_id).filter((p): p is string => p !== null && !planilhaPorId.has(p)),
    ),
  ];

  const usuarioIds = [
    ...new Set((eventosRes.data ?? []).map((e) => e.usuario_id).filter((u): u is string => u !== null)),
  ];

  const [ajustesRes, extrasRes, nomesRes] = await Promise.all([
    referencia
      ? todasAsLinhas<{ item_id: string; quantidade: string }>((de, ate) =>
          supabase
            .from("mc_ajustes")
            .select("item_id, quantidade:quantidade::text")
            .eq("revisao_id", referencia.id)
            .range(de, ate) as unknown as PromiseLike<{ data: { item_id: string; quantidade: string }[] | null; error: { message: string } | null }>,
        )
      : Promise.resolve({ linhas: [] as { item_id: string; quantidade: string }[], erro: null }),
    faltando.length > 0
      ? supabase.from("mc_planilha_itens").select(COLUNAS_PLANILHA).in("id", faltando)
      : Promise.resolve({ data: [] as LinhaPlanilha[], error: null }),
    usuarioIds.length > 0
      ? supabase.rpc("nomes_usuarios_auditoria", { p_ids: usuarioIds })
      : Promise.resolve({ data: [] as { id: string; nome: string }[], error: null }),
  ]);
  if (ajustesRes.erro) throw new Error(ajustesRes.erro);
  falhou(extrasRes.error);
  for (const p of extrasRes.data ?? []) planilhaPorId.set(p.id, p);

  const ajustePorItem = new Map<string, string>();
  for (const a of ajustesRes.linhas) {
    const anterior = ajustePorItem.get(a.item_id);
    ajustePorItem.set(a.item_id, anterior === undefined ? paraTexto(lerDecimal(a.quantidade)) : paraTexto(somar(lerDecimal(anterior), lerDecimal(a.quantidade))));
  }

  const nomePorId = new Map((nomesRes.data ?? []).map((u: { id: string; nome: string }) => [u.id, u.nome]));

  const ordenados = itensRes.linhas
    .map((i) => ({ i, p: i.planilha_item_id ? (planilhaPorId.get(i.planilha_item_id) ?? null) : null }))
    .sort((a, b) => (a.p?.ordem ?? Number.MAX_SAFE_INTEGER) - (b.p?.ordem ?? Number.MAX_SAFE_INTEGER) || (a.p?.codigo ?? "").localeCompare(b.p?.codigo ?? ""));

  const itens: ItemMedicaoDetalhe[] = ordenados.map(({ i, p }) => ({
    itemId: i.item_id,
    codigo: p?.codigo ?? null,
    descricao: p?.descricao ?? null,
    unidade: p?.unidade ?? null,
    qtdMedida: i.qtd_medida,
    ajustes: ajustePorItem.get(i.item_id) ?? null,
    qtdAprovada: i.qtd_aprovada,
    glosa: i.glosa,
    valor: i.valor_medicao,
  }));

  const servicos: ServicoAjuste[] = planilhaRes.linhas
    .filter((p) => p.tipo === "servico")
    .map((p) => ({ itemId: p.item_id, codigo: p.codigo, descricao: p.descricao, unidade: p.unidade }));

  const eventos: EventoMedicao[] = (eventosRes.data ?? []).map((e) => ({
    id: e.id,
    evento: e.evento,
    deStatus: e.de_status,
    paraStatus: e.para_status,
    motivo: e.motivo,
    criadoEm: e.criado_em,
    usuarioNome: e.usuario_id ? (nomePorId.get(e.usuario_id) ?? null) : null,
  }));

  return {
    id: m.id,
    contratoId: m.contrato_id,
    contratoCodigo: contratoRes.data?.codigo ?? "",
    contratoNome: contratoRes.data?.nome_obra ?? "",
    numero: m.numero,
    periodoInicio: m.periodo_inicio,
    periodoFim: m.periodo_fim,
    status: m.status,
    versaoNumero: versaoRes.data?.numero ?? null,
    valor: (totalRes.data?.valor as string | null | undefined) ?? null,
    revisoes,
    revisaoCorrente: corrente,
    itens,
    servicos,
    eventos,
  };
}

/** Quantidades congeladas das revisões e os rótulos que o detalhe não tinha. */
export interface RevisaoItens {
  congelados: ItemCongelado[];
  /** Código, descrição e unidade dos itens congelados que não estão nos itens do detalhe. */
  extras: RotuloItem[];
}

/**
 * Quantidades congeladas por revisão (`mc_revisao_itens`, gravadas no envio) de todas as revisões
 * da medição, para o drawer de aprovação e a comparação de revisões. `conhecidos` são os itens que
 * o detalhe já rotulou (`carregarMedicao`, com a linha da planilha que a view apontou); para os que
 * faltarem, o rótulo vem de qualquer linha de planilha do item (preferindo serviço). D7: a
 * quantidade chega como texto e só é exibida ou comparada.
 */
export async function revisaoItens(medicaoId: string, conhecidos: string[] = []): Promise<RevisaoItens> {
  const supabase = await createClient();

  const revisoesRes = await supabase.from("mc_medicao_revisoes").select("id").eq("medicao_id", medicaoId);
  falhou(revisoesRes.error);
  const ids = (revisoesRes.data ?? []).map((r) => r.id);
  if (ids.length === 0) return { congelados: [], extras: [] };

  type LinhaCongelada = { revisao_id: string; item_id: string; quantidade: string };
  const congeladosRes = await todasAsLinhas<LinhaCongelada>((de, ate) =>
    supabase
      .from("mc_revisao_itens")
      .select("revisao_id, item_id, quantidade:quantidade::text")
      .in("revisao_id", ids)
      .order("revisao_id", { ascending: true })
      .order("item_id", { ascending: true })
      .range(de, ate) as unknown as PromiseLike<{ data: LinhaCongelada[] | null; error: { message: string } | null }>,
  );
  if (congeladosRes.erro) throw new Error(congeladosRes.erro);

  const congelados: ItemCongelado[] = congeladosRes.linhas.map((c) => ({ revisaoId: c.revisao_id, itemId: c.item_id, quantidade: c.quantidade }));

  const sabidos = new Set(conhecidos);
  const faltando = [...new Set(congelados.map((c) => c.itemId).filter((i) => !sabidos.has(i)))];
  if (faltando.length === 0) return { congelados, extras: [] };

  const extrasRes = await supabase.from("mc_planilha_itens").select(COLUNAS_PLANILHA).in("item_id", faltando);
  falhou(extrasRes.error);
  const porItem = new Map<string, LinhaPlanilha>();
  for (const p of (extrasRes.data ?? []) as LinhaPlanilha[]) {
    const atual = porItem.get(p.item_id);
    if (!atual || (atual.tipo !== "servico" && p.tipo === "servico")) porItem.set(p.item_id, p);
  }
  const extras: RotuloItem[] = faltando
    .filter((i) => porItem.has(i))
    .map((i) => {
      const p = porItem.get(i) as LinhaPlanilha;
      return { itemId: i, codigo: p.codigo, descricao: p.descricao, unidade: p.unidade };
    });
  return { congelados, extras };
}
