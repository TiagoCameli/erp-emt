import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import type { Canal, OrigemSaida, TipoConsumidor, TipoMovimento } from "@/modules/combustivel/_shared/rotulos";
import {
  aplicarFiltrosAbastecimentos,
  type FiltrosAbastecimentos,
} from "@/modules/combustivel/abastecimentos/filtros";
import type { AlocacaoOriginal } from "@/modules/combustivel/abastecimentos/schemas";
import { rotuloTanque } from "@/modules/combustivel/entradas/queries";
import {
  paraNumeroDoBanco,
  paraNumeroOuNulo,
  rotuloEquipamento,
  somarValoresOperacionais,
} from "@/modules/manutencao/servicos/formato";

type Fornecedor = { razao_social: string; nome_fantasia: string | null } | null;

function nomeFornecedor(f: Fornecedor): string {
  if (!f) return "";
  return f.nome_fantasia?.trim() || f.razao_social;
}

/** Quem consumiu: o equipamento, ou a transportadora com a placa da carreta. */
export function rotuloConsumidor(linha: {
  tipo_consumidor: string;
  placa: string | null;
  equipamentos: { codigo: string | null; descricao: string; placa: string | null } | null;
  fornecedores: Fornecedor;
}): string {
  if (linha.tipo_consumidor === "carreta_transportadora") {
    const transportadora = nomeFornecedor(linha.fornecedores);
    const placa = linha.placa?.trim();
    return placa ? `${transportadora} (${placa})` : transportadora;
  }
  return linha.equipamentos ? rotuloEquipamento(linha.equipamentos) : "";
}

// ---------------------------------------------------------------------------
// Lista
// ---------------------------------------------------------------------------

export interface SaidaLista {
  id: string;
  data: string;
  origem: OrigemSaida;
  tipoConsumidor: TipoConsumidor;
  consumidor: string;
  tanqueNome: string | null;
  tanqueExterno: boolean;
  insumoNome: string;
  litros: number;
  precoUnitario: number;
  valorTotal: number;
  canal: Canal;
}

export interface ResultadoListaAbastecimentos {
  itens: SaidaLista[];
  /** Quantos abastecimentos o filtro acha, em todas as páginas. */
  total: number;
  /** Soma de TODOS os do filtro (não só da página). */
  litrosDoFiltro: number;
  valorDoFiltro: number;
}

const SELECT_LISTA =
  "id, data, origem, tipo_consumidor, placa, litros, preco_unitario, valor_total, canal, tanques(nome, apelido, eh_externo), equipamentos(codigo, descricao, placa), fornecedores(razao_social, nome_fantasia), insumos(nome)";

/**
 * Página dos abastecimentos (são ~3.100), com o total e as somas pelo MESMO
 * filtro. A soma vem de uma segunda consulta só com litros e valor, paginada por
 * `todasAsLinhas` (o PostgREST corta em 1.000 sem avisar). Desempate por id no
 * ORDER BY para a paginação não repetir nem perder linha.
 */
export async function listarAbastecimentos(filtros: FiltrosAbastecimentos): Promise<ResultadoListaAbastecimentos> {
  const supabase = await createClient();
  const de = filtros.pagina * filtros.tamanho;
  const ate = de + filtros.tamanho - 1;

  const pagina = aplicarFiltrosAbastecimentos(
    supabase.from("combustivel_saidas").select(SELECT_LISTA, { count: "exact" }).is("excluido_em", null),
    filtros,
  )
    .order("data", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id")
    .range(de, ate);

  const [resultadoPagina, resultadoSoma] = await Promise.all([
    pagina,
    todasAsLinhas((inicio, fim) =>
      aplicarFiltrosAbastecimentos(
        supabase.from("combustivel_saidas").select("litros, valor_total").is("excluido_em", null),
        filtros,
      )
        .order("id")
        .range(inicio, fim),
    ),
  ]);

  if (resultadoPagina.error) throw new Error("Não foi possível carregar os abastecimentos");
  // Soma pela metade é pior que soma nenhuma.
  if (resultadoSoma.erro) throw new Error("Não foi possível somar os abastecimentos");

  const itens: SaidaLista[] = (resultadoPagina.data ?? []).map((linha) => ({
    id: linha.id,
    data: linha.data,
    origem: linha.origem as OrigemSaida,
    tipoConsumidor: linha.tipo_consumidor as TipoConsumidor,
    consumidor: rotuloConsumidor(linha),
    tanqueNome: linha.tanques ? rotuloTanque(linha.tanques) : null,
    tanqueExterno: linha.tanques?.eh_externo ?? false,
    insumoNome: linha.insumos?.nome ?? "",
    litros: paraNumeroDoBanco(linha.litros),
    precoUnitario: paraNumeroDoBanco(linha.preco_unitario),
    valorTotal: paraNumeroDoBanco(linha.valor_total),
    canal: linha.canal as Canal,
  }));

  return {
    itens,
    total: resultadoPagina.count ?? itens.length,
    litrosDoFiltro: somarValoresOperacionais(resultadoSoma.linhas.map((l) => paraNumeroDoBanco(l.litros))),
    valorDoFiltro: somarValoresOperacionais(resultadoSoma.linhas.map((l) => paraNumeroDoBanco(l.valor_total))),
  };
}

// ---------------------------------------------------------------------------
// Detalhe
// ---------------------------------------------------------------------------

export interface SaidaDetalhe {
  id: string;
  data: string;
  origem: OrigemSaida;
  tipoConsumidor: TipoConsumidor;
  consumidor: string;
  tanqueId: string | null;
  tanqueNome: string | null;
  tanqueExterno: boolean;
  equipamentoId: string | null;
  equipamentoNome: string | null;
  equipamentoControlePor: string | null;
  transportadoraId: string | null;
  transportadoraNome: string | null;
  placa: string | null;
  motorista: string | null;
  insumoId: string;
  insumoNome: string;
  litros: number;
  precoCombustivel: number | null;
  precoProprietario: number | null;
  taxaLitro: number;
  precoUnitario: number;
  precoMedioTanque: number | null;
  valorTotal: number;
  pago: boolean;
  pagoEm: string | null;
  medicao: number | null;
  tipoMedicao: string | null;
  centroCustoNome: string | null;
  canal: Canal;
  observacoes: string | null;
}

export interface CamadaPeps {
  id: string;
  fonteTipo: "entrada" | "transferencia";
  fonteData: string | null;
  fonteNotaFiscal: string | null;
  litros: number;
  preco: number;
}

export interface MovimentoConta {
  id: string;
  data: string;
  tipo: TipoMovimento;
  transportadoraNome: string;
  valor: number;
  descricao: string | null;
}

export interface AlocacaoDetalhe extends AlocacaoOriginal {
  id: string;
  centroCustoNome: string;
  litros: number;
}

export interface SemSuprimento {
  litrosSolicitados: number;
  litrosSupridos: number;
  litrosSemSuprimento: number;
}

export interface AbastecimentoCompleto {
  saida: SaidaDetalhe;
  camadas: CamadaPeps[];
  movimentos: MovimentoConta[];
  alocacoes: AlocacaoDetalhe[];
  semSuprimento: SemSuprimento | null;
}

function nomeCentro(c: { codigo: string | null; nome: string } | null): string {
  if (!c) return "";
  return [c.codigo, c.nome].filter(Boolean).join(" ");
}

/** O abastecimento com camadas PEPS, conta corrente e alocações. Null se não existe. */
export async function buscarAbastecimento(id: string): Promise<AbastecimentoCompleto | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("combustivel_saidas")
    .select(
      `id, data, origem, tipo_consumidor, tanque_id, equipamento_id, transportadora_id, placa, motorista,
       insumo_id, litros, preco_combustivel, preco_proprietario, taxa_litro, preco_unitario,
       preco_medio_tanque, valor_total, pago, pago_em, medicao, tipo_medicao, canal, observacoes,
       tanques(nome, apelido, eh_externo), equipamentos(codigo, descricao, placa, controle_por),
       fornecedores(razao_social, nome_fantasia), insumos(nome), centros_custo(codigo, nome)`,
    )
    .eq("id", id)
    .is("excluido_em", null)
    .maybeSingle();

  if (error) throw new Error("Não foi possível carregar o abastecimento");
  if (!data) return null;

  const [camadas, movimentos, alocacoes, semSuprimento] = await Promise.all([
    supabase
      .from("combustivel_camadas")
      .select("id, fonte_tipo, fonte_id, litros, preco, created_at")
      .eq("saida_id", id)
      .order("created_at")
      .order("id"),
    supabase
      .from("transportadora_movimentos")
      .select("id, data, tipo, valor, descricao, fornecedores(razao_social, nome_fantasia)")
      .eq("origem_tabela", "combustivel_saidas")
      .eq("origem_id", id)
      .order("tipo")
      .order("id"),
    supabase
      .from("abastecimento_alocacoes")
      .select("id, centro_custo_id, percentual, litros, etapa_legado, centros_custo(codigo, nome)")
      .eq("saida_id", id)
      .order("created_at")
      .order("id"),
    supabase
      .from("combustivel_sem_suprimento")
      .select("litros_solicitados, litros_supridos, litros_sem_suprimento")
      .eq("saida_id", id)
      .maybeSingle(),
  ]);

  if (camadas.error || movimentos.error || alocacoes.error || semSuprimento.error) {
    throw new Error("Não foi possível carregar o detalhe do abastecimento");
  }

  // A data e a NF da camada vêm da fonte (entrada ou transferência recebida).
  const idsEntrada = (camadas.data ?? []).filter((c) => c.fonte_tipo === "entrada").map((c) => c.fonte_id);
  const idsTransferencia = (camadas.data ?? []).filter((c) => c.fonte_tipo === "transferencia").map((c) => c.fonte_id);
  const [entradas, transferencias] = await Promise.all([
    idsEntrada.length > 0
      ? supabase.from("combustivel_entradas").select("id, data_hora, nota_fiscal").in("id", idsEntrada)
      : Promise.resolve({ data: [] as { id: string; data_hora: string; nota_fiscal: string | null }[], error: null }),
    idsTransferencia.length > 0
      ? supabase.from("combustivel_transferencias").select("id, data_hora").in("id", idsTransferencia)
      : Promise.resolve({ data: [] as { id: string; data_hora: string }[], error: null }),
  ]);
  const fonte = new Map<string, { data: string; nf: string | null }>();
  for (const e of entradas.data ?? []) fonte.set(e.id, { data: e.data_hora, nf: e.nota_fiscal });
  for (const t of transferencias.data ?? []) fonte.set(t.id, { data: t.data_hora, nf: null });

  const saida: SaidaDetalhe = {
    id: data.id,
    data: data.data,
    origem: data.origem as OrigemSaida,
    tipoConsumidor: data.tipo_consumidor as TipoConsumidor,
    consumidor: rotuloConsumidor(data),
    tanqueId: data.tanque_id,
    tanqueNome: data.tanques ? rotuloTanque(data.tanques) : null,
    tanqueExterno: data.tanques?.eh_externo ?? false,
    equipamentoId: data.equipamento_id,
    equipamentoNome: data.equipamentos ? rotuloEquipamento(data.equipamentos) : null,
    equipamentoControlePor: data.equipamentos?.controle_por ?? null,
    transportadoraId: data.transportadora_id,
    transportadoraNome: data.fornecedores ? nomeFornecedor(data.fornecedores) : null,
    placa: data.placa,
    motorista: data.motorista,
    insumoId: data.insumo_id,
    insumoNome: data.insumos?.nome ?? "",
    litros: paraNumeroDoBanco(data.litros),
    precoCombustivel: paraNumeroOuNulo(data.preco_combustivel),
    precoProprietario: paraNumeroOuNulo(data.preco_proprietario),
    taxaLitro: paraNumeroDoBanco(data.taxa_litro),
    precoUnitario: paraNumeroDoBanco(data.preco_unitario),
    precoMedioTanque: paraNumeroOuNulo(data.preco_medio_tanque),
    valorTotal: paraNumeroDoBanco(data.valor_total),
    pago: data.pago,
    pagoEm: data.pago_em,
    medicao: paraNumeroOuNulo(data.medicao),
    tipoMedicao: data.tipo_medicao,
    centroCustoNome: data.centros_custo ? nomeCentro(data.centros_custo) : null,
    canal: data.canal as Canal,
    observacoes: data.observacoes,
  };

  return {
    saida,
    camadas: (camadas.data ?? []).map((c) => ({
      id: c.id,
      fonteTipo: c.fonte_tipo === "transferencia" ? "transferencia" : "entrada",
      fonteData: fonte.get(c.fonte_id)?.data ?? null,
      fonteNotaFiscal: fonte.get(c.fonte_id)?.nf ?? null,
      litros: paraNumeroDoBanco(c.litros),
      preco: paraNumeroDoBanco(c.preco),
    })),
    movimentos: (movimentos.data ?? []).map((m) => ({
      id: m.id,
      data: m.data,
      tipo: m.tipo as TipoMovimento,
      transportadoraNome: nomeFornecedor(m.fornecedores),
      valor: paraNumeroDoBanco(m.valor),
      descricao: m.descricao,
    })),
    alocacoes: (alocacoes.data ?? []).map((a) => ({
      id: a.id,
      centroCustoId: a.centro_custo_id,
      centroCustoNome: nomeCentro(a.centros_custo),
      percentual: paraNumeroDoBanco(a.percentual),
      litros: paraNumeroDoBanco(a.litros),
      etapaLegado: a.etapa_legado,
    })),
    semSuprimento: semSuprimento.data
      ? {
          litrosSolicitados: paraNumeroDoBanco(semSuprimento.data.litros_solicitados),
          litrosSupridos: paraNumeroDoBanco(semSuprimento.data.litros_supridos),
          litrosSemSuprimento: paraNumeroDoBanco(semSuprimento.data.litros_sem_suprimento),
        }
      : null,
  };
}

/** Alocações atuais da saída, para a edição preservar a etapa de origem. */
export async function lerAlocacoesDaSaida(id: string): Promise<AlocacaoOriginal[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("abastecimento_alocacoes")
    .select("centro_custo_id, percentual, etapa_legado")
    .eq("saida_id", id)
    .order("created_at")
    .order("id");
  if (error) return null;
  return (data ?? []).map((a) => ({
    centroCustoId: a.centro_custo_id,
    percentual: paraNumeroDoBanco(a.percentual),
    etapaLegado: a.etapa_legado,
  }));
}

// ---------------------------------------------------------------------------
// Opções
// ---------------------------------------------------------------------------

export interface EquipamentoOpcao {
  id: string;
  rotulo: string;
  propriedade: string;
  /** Tem etapa no centro de custo (próprio, Colorado). Alugado não tem. */
  temEtapa: boolean;
  controlePor: string;
  ativo: boolean;
}

/**
 * Todos os equipamentos com a informação de etapa. A etapa é lida do centro de
 * custo, porque é o que o gatilho da saída consulta. O formulário oferece só os
 * ativos; o filtro alcança os inativos (vendido continua tendo histórico).
 */
export async function listarEquipamentos(): Promise<EquipamentoOpcao[]> {
  const supabase = await createClient();
  const [equipamentos, etapas] = await Promise.all([
    todasAsLinhas((de, ate) =>
      supabase
        .from("equipamentos")
        .select("id, codigo, descricao, placa, propriedade, controle_por, ativo")
        .order("codigo", { ascending: true, nullsFirst: false })
        .order("descricao")
        .order("id")
        .range(de, ate),
    ),
    todasAsLinhas((de, ate) =>
      supabase
        .from("centros_custo")
        .select("equipamento_id")
        .not("equipamento_id", "is", null)
        .order("id")
        .range(de, ate),
    ),
  ]);
  if (equipamentos.erro || etapas.erro) throw new Error("Não foi possível carregar os equipamentos");

  const comEtapa = new Set(etapas.linhas.map((l) => l.equipamento_id).filter((id): id is string => id !== null));
  return equipamentos.linhas.map((e) => ({
    id: e.id,
    rotulo: rotuloEquipamento(e),
    propriedade: e.propriedade,
    temEtapa: comEtapa.has(e.id),
    controlePor: e.controle_por,
    ativo: e.ativo,
  }));
}

export interface TransportadoraOpcao {
  id: string;
  nome: string;
  ativo: boolean;
}

/** Fornecedores marcados como transportadora, ativos e inativos. */
export async function listarTransportadoras(): Promise<TransportadoraOpcao[]> {
  const supabase = await createClient();
  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("fornecedores")
      .select("id, razao_social, nome_fantasia, ativo")
      .eq("eh_transportadora", true)
      .order("razao_social")
      .order("id")
      .range(de, ate),
  );
  if (erro) throw new Error("Não foi possível carregar as transportadoras");
  return linhas.map((f) => ({ id: f.id, nome: nomeFornecedor(f), ativo: f.ativo }));
}
