import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import type {
  AplicacaoCadastro,
  LiquidezAplicacao,
  LinhaAba,
  MovimentoAplicacao,
  TipoMovimento,
} from "@/modules/financeiro/aplicacoes/calculo";

const CATEGORIA_ABERTURA = "9feb495d-3d71-48b6-b509-2c798cb45e19";

/** NUMERIC chega como string em algumas rotas do PostgREST. Null continua null. */
function numeroOuNulo(valor: number | string | null): number | null {
  if (valor === null) return null;
  const n = typeof valor === "string" ? Number(valor) : valor;
  return Number.isFinite(n) ? n : null;
}

function numero(valor: number | string | null): number {
  return numeroOuNulo(valor) ?? 0;
}

export interface DadosAplicacoes {
  aplicacoes: AplicacaoCadastro[];
  linhas: LinhaAba[];
  movimentos: MovimentoAplicacao[];
}

/**
 * Tudo que a aba mostra.
 *
 * O dinheiro sai de `fn_aba_aplicacoes`, SECURITY DEFINER filtrada por
 * `fn_pode_ver_saldo`: a aplicação cuja subconta a pessoa não pode ver NÃO VEM
 * (ausência não é zero), e a tela conta quantas ficaram fora pelo cadastro.
 * Posições têm a mesma trava na RLS. Toda lista passa por `todasAsLinhas`
 * porque o PostgREST corta em 1.000 linhas sem avisar.
 */
export async function carregarAplicacoes(): Promise<DadosAplicacoes> {
  const supabase = await createClient();

  const cadastro = await supabase
    .from("aplicacoes")
    .select(
      `id, produto, indexador, taxa_percentual, liquidez, liquidez_dias, carencia_ate,
       vencimento, tipo_ir, ativa, centro_custo_id, conta_bancaria_id,
       etapa:centros_custo!aplicacoes_centro_custo_id_fkey(nome),
       conta:contas_bancarias!aplicacoes_conta_bancaria_id_fkey(nome)`,
    )
    .order("created_at");
  if (cadastro.error) throw new Error("Não foi possível carregar as aplicações");

  const aplicacoes: AplicacaoCadastro[] = (cadastro.data ?? []).map((a) => ({
    id: a.id,
    nome: a.etapa?.nome ?? "Aplicação",
    contaNome: a.conta?.nome ?? "",
    contaId: a.conta_bancaria_id,
    etapaId: a.centro_custo_id,
    produto: a.produto,
    indexador: a.indexador,
    taxaPercentual: numeroOuNulo(a.taxa_percentual),
    liquidez: a.liquidez as LiquidezAplicacao,
    liquidezDias: a.liquidez_dias,
    carenciaAte: a.carencia_ate,
    vencimento: a.vencimento,
    tipoIr: a.tipo_ir,
    ativa: a.ativa,
  }));
  const porEtapa = new Map(
    (cadastro.data ?? []).map((a) => [a.centro_custo_id, a.id]),
  );
  const porId = new Map(aplicacoes.map((a) => [a.id, a]));

  const [aba, posicoes, transferencias, lancamentos] = await Promise.all([
    todasAsLinhas((de, ate) => supabase.rpc("fn_aba_aplicacoes", {}).range(de, ate)),
    todasAsLinhas((de, ate) =>
      supabase
        .from("aplicacao_posicoes")
        .select("id, aplicacao_id, data, saldo_liquido, saldo_bruto, ir, iof, e_abertura, observacoes")
        .is("excluido_em", null)
        .order("data")
        .order("id")
        .range(de, ate),
    ),
    todasAsLinhas((de, ate) =>
      supabase
        .from("transferencias_contas")
        .select("id, numero, data_transferencia, valor, tarifa, descricao, conta_origem_id, conta_destino_id, centro_custo_id")
        .in("centro_custo_id", [...porEtapa.keys()])
        .order("data_transferencia")
        .order("id")
        .range(de, ate),
    ),
    todasAsLinhas((de, ate) =>
      supabase
        .from("lancamentos")
        .select("id, numero, tipo, valor, descricao, data_compra, origem_id, categoria_id")
        .eq("origem", "aplicacao")
        .order("data_compra")
        .order("id")
        .range(de, ate),
    ),
  ]);
  if (aba.erro) throw new Error("Não foi possível carregar a posição das aplicações");
  if (posicoes.erro || transferencias.erro || lancamentos.erro) {
    throw new Error("Não foi possível carregar os movimentos das aplicações");
  }

  const linhas: LinhaAba[] = aba.linhas.map((l) => ({
    aplicacaoId: l.aplicacao_id,
    mes: l.mes,
    posicaoInicial: numero(l.posicao_inicial),
    aplicado: numero(l.aplicado),
    resgatado: numero(l.resgatado),
    rendimento: numeroOuNulo(l.rendimento),
    ajusteAbertura: numeroOuNulo(l.ajuste_abertura),
    posicaoFinal: numero(l.posicao_final),
    rendimentoPct: numeroOuNulo(l.rendimento_pct),
    cdiPct: numeroOuNulo(l.cdi_pct),
    pctCdi: numeroOuNulo(l.pct_cdi),
    ultimaPosicao: l.ultima_posicao,
  }));
  // Só entra movimento de aplicação que a pessoa enxerga na função de saldo.
  const visiveis = new Set(linhas.map((l) => l.aplicacaoId));

  const movimentos: MovimentoAplicacao[] = [];
  const aplicacaoDaPosicao = new Map<string, string>();

  for (const p of posicoes.linhas) {
    aplicacaoDaPosicao.set(p.id, p.aplicacao_id);
    if (!visiveis.has(p.aplicacao_id)) continue;
    movimentos.push({
      chave: `posicao:${p.id}`,
      id: p.id,
      tipo: "posicao",
      data: p.data,
      aplicacaoId: p.aplicacao_id,
      documento: null,
      descricao: p.e_abertura ? "Posição de abertura" : "Posição do extrato",
      valor: numero(p.saldo_liquido),
      saldoBruto: numeroOuNulo(p.saldo_bruto),
      ir: numeroOuNulo(p.ir),
      iof: numeroOuNulo(p.iof),
      eAbertura: p.e_abertura,
      observacoes: p.observacoes,
    });
  }

  for (const t of transferencias.linhas) {
    const aplicacaoId = t.centro_custo_id ? porEtapa.get(t.centro_custo_id) : undefined;
    if (!aplicacaoId || !visiveis.has(aplicacaoId)) continue;
    const conta = porId.get(aplicacaoId)?.contaId;
    const aplicando = t.conta_destino_id === conta;
    movimentos.push({
      chave: `transferencia:${t.id}`,
      id: t.id,
      tipo: aplicando ? "aplicacao" : "resgate",
      data: t.data_transferencia,
      aplicacaoId,
      documento: t.numero,
      descricao: t.descricao,
      // Resgate sai da subconta com a tarifa: é o que o saldo dela perde.
      valor: aplicando ? numero(t.valor) : -(numero(t.valor) + numero(t.tarifa)),
    });
  }

  for (const l of lancamentos.linhas) {
    const aplicacaoId = l.origem_id ? aplicacaoDaPosicao.get(l.origem_id) : undefined;
    if (!aplicacaoId || !visiveis.has(aplicacaoId)) continue;
    const tipo: TipoMovimento =
      l.categoria_id === CATEGORIA_ABERTURA
        ? "ajuste_abertura"
        : l.tipo === "a_pagar"
          ? "rendimento_negativo"
          : "rendimento";
    const valor = numero(l.valor);
    movimentos.push({
      chave: `lancamento:${l.id}`,
      id: l.id,
      tipo,
      data: l.data_compra,
      aplicacaoId,
      documento: l.numero,
      descricao: l.descricao,
      valor: l.tipo === "a_pagar" ? -valor : valor,
    });
  }

  movimentos.sort((a, b) => b.data.localeCompare(a.data) || a.chave.localeCompare(b.chave));
  return { aplicacoes, linhas, movimentos };
}
