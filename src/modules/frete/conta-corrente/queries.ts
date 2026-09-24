import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import {
  ehTipoMovimento,
  type MovimentoExtrato,
  type SaldoTransportadora,
} from "@/modules/frete/conta-corrente/extrato";
import { nomesUsuariosFrete } from "@/modules/frete/_shared/usuarios";
import { paraNumeroDoBanco, paraNumeroOuNulo } from "@/modules/manutencao/servicos/formato";

/**
 * Leitura da conta corrente: as duas views da origem (`transportadora_saldos` e
 * `transportadora_movimentos_detalhe`, security_invoker, com a RLS de quem lê).
 * O extrato vem inteiro por `todasAsLinhas`: a Areacre passa de mil movimentos,
 * e a origem cortava em mil calada.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

function paraSaldo(linha: {
  transportadora_id: string | null;
  nome: string | null;
  saldo: number | null;
  debito_combustivel_total: number | null;
  credito_frete_total: number | null;
  pago_frete_total: number | null;
  qtd_movimentos: number | null;
}): SaldoTransportadora | null {
  if (!linha.transportadora_id) return null;
  return {
    transportadoraId: linha.transportadora_id,
    nome: linha.nome ?? "",
    saldo: paraNumeroDoBanco(linha.saldo),
    debitoCombustivelTotal: paraNumeroDoBanco(linha.debito_combustivel_total),
    creditoFreteTotal: paraNumeroDoBanco(linha.credito_frete_total),
    pagoFreteTotal: paraNumeroDoBanco(linha.pago_frete_total),
    qtdMovimentos: paraNumeroDoBanco(linha.qtd_movimentos),
  };
}

const COLUNAS_SALDO =
  "transportadora_id, nome, saldo, debito_combustivel_total, credito_frete_total, pago_frete_total, qtd_movimentos";

/** Todas as transportadoras e donas de tanque, por nome (como a origem). */
export async function listarSaldos(): Promise<SaldoTransportadora[]> {
  const supabase = await createClient();
  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase.from("transportadora_saldos").select(COLUNAS_SALDO).order("nome").order("transportadora_id").range(de, ate),
  );
  if (erro) throw new Error("Não foi possível carregar a conta corrente");
  return linhas.map(paraSaldo).filter((s): s is SaldoTransportadora => s !== null);
}

export async function buscarSaldo(transportadoraId: string): Promise<SaldoTransportadora | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transportadora_saldos")
    .select(COLUNAS_SALDO)
    .eq("transportadora_id", transportadoraId)
    .maybeSingle();
  if (error) throw new Error("Não foi possível carregar o saldo da transportadora");
  return data ? paraSaldo(data) : null;
}

/** Nomes por id em lotes de 100 (lista de id na URL estoura o PostgREST). */
async function nomesPorId(
  supabase: Supabase,
  tabela: "insumos" | "centros_custo",
  ids: readonly string[],
): Promise<Map<string, string>> {
  const nomes = new Map<string, string>();
  const unicos = [...new Set(ids)];
  for (let i = 0; i < unicos.length; i += 100) {
    const { data, error } = await supabase.from(tabela).select("id, nome").in("id", unicos.slice(i, i + 100));
    // Sem permissão de ler, o nome fica vazio; o extrato continua de pé.
    if (error) return nomes;
    for (const linha of data ?? []) nomes.set(linha.id, linha.nome);
  }
  return nomes;
}

/** O extrato inteiro da transportadora, do mais novo para o mais velho. */
export async function listarMovimentos(transportadoraId: string): Promise<MovimentoExtrato[]> {
  const supabase = await createClient();
  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("transportadora_movimentos_detalhe")
      .select("*")
      .eq("transportadora_id", transportadoraId)
      .order("data", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(de, ate),
  );
  if (erro) throw new Error("Não foi possível carregar o extrato");

  const semNulo = (valores: (string | null)[]) => valores.filter((v): v is string => v !== null);
  const [insumos, centros, usuarios] = await Promise.all([
    nomesPorId(supabase, "insumos", semNulo(linhas.flatMap((l) => [l.frete_insumo_id, l.saida_insumo_id]))),
    nomesPorId(supabase, "centros_custo", semNulo(linhas.map((l) => l.centro_custo_id))),
    nomesUsuariosFrete(supabase, linhas.map((l) => l.ajuste_criado_por)),
  ]);

  const nome = (mapa: Map<string, string>, id: string | null) => (id ? (mapa.get(id) ?? null) : null);

  const movimentos: MovimentoExtrato[] = [];
  for (const l of linhas) {
    if (!l.id || !l.data || !ehTipoMovimento(l.tipo)) continue;
    movimentos.push({
      id: l.id,
      data: l.data,
      createdAt: l.created_at ?? l.data,
      tipo: l.tipo,
      valor: paraNumeroDoBanco(l.valor),
      descricao: l.descricao,
      mesReferencia: l.mes_referencia,
      origemTabela: l.origem_tabela,
      origemId: l.origem_id,
      obraNome: nome(centros, l.centro_custo_id),
      fretePeso: paraNumeroOuNulo(l.frete_peso_toneladas),
      freteKm: paraNumeroOuNulo(l.frete_km_rodados),
      freteTkm: paraNumeroOuNulo(l.frete_valor_tkm),
      freteOrigem: l.frete_origem,
      freteDestino: l.frete_destino,
      freteInsumoNome: nome(insumos, l.frete_insumo_id),
      freteNotaFiscal: l.frete_nota_fiscal,
      freteNotaFiscal2: l.frete_nota_fiscal2,
      fretePlaca: l.frete_placa_carreta,
      freteMotorista: l.frete_motorista,
      saidaLitros: paraNumeroOuNulo(l.saida_litros),
      saidaPrecoCombustivel: paraNumeroOuNulo(l.saida_preco_combustivel),
      saidaPrecoProprietario: paraNumeroOuNulo(l.saida_preco_proprietario),
      saidaTaxaLitro: paraNumeroOuNulo(l.saida_taxa_litro),
      saidaPrecoMedioTanque: paraNumeroOuNulo(l.saida_preco_medio_tanque),
      saidaCombustivelNome: nome(insumos, l.saida_insumo_id),
      saidaPlaca: l.saida_placa,
      saidaMotorista: l.saida_motorista,
      saidaObservacoes: l.saida_observacoes,
      pagamentoMetodo: l.pagamento_metodo,
      pagamentoNotaFiscal: l.pagamento_nota_fiscal,
      pagamentoResponsavel: l.pagamento_responsavel,
      pagamentoPagoPor: l.pagamento_pago_por,
      pagamentoObservacoes: l.pagamento_observacoes,
      pagamentoLitros: paraNumeroOuNulo(l.pagamento_quantidade_combustivel),
      ajusteCriadoPor: nome(usuarios, l.ajuste_criado_por),
    });
  }
  return movimentos;
}

/** Ajustes pendentes da transportadora: ainda não entram no saldo. */
export async function contarAjustesPendentes(transportadoraId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("frete_ajustes")
    .select("id", { count: "exact", head: true })
    .eq("transportadora_id", transportadoraId)
    .eq("status", "pendente_aprovacao");
  if (error) return 0;
  return count ?? 0;
}
