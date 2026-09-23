import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";

/**
 * Leitura do almoxarifado de peças. Toda lista passa por `todasAsLinhas`: o
 * PostgREST corta em 1.000 sem avisar, e insumo (3 mil+) e fornecedor (900+)
 * já passam disso. Toda ordenação termina numa chave única, senão a paginação
 * por `.range()` repete ou pula linha entre uma página e outra.
 */

/** Nome de exibição do fornecedor: fantasia quando existe, senão razão social. */
function nomeFornecedor(fornecedor: {
  razao_social: string;
  nome_fantasia: string | null;
} | null): string {
  if (!fornecedor) return "";
  return fornecedor.nome_fantasia?.trim() || fornecedor.razao_social;
}

/** Rótulo do equipamento: código antes da descrição, quando houver. */
function rotuloEquipamento(equipamento: {
  codigo: string | null;
  descricao: string;
  placa: string | null;
}): string {
  const partes = [equipamento.codigo?.trim(), equipamento.descricao.trim()].filter(
    (parte): parte is string => Boolean(parte),
  );
  const base = partes.join(" · ");
  return equipamento.placa?.trim() ? `${base} (${equipamento.placa.trim()})` : base;
}

// ---------------------------------------------------------------------------
// Saldos
// ---------------------------------------------------------------------------

export interface SaldoLinha {
  /** Chave da linha na tabela: depósito × insumo. */
  chave: string;
  depositoId: string;
  depositoNome: string;
  insumoId: string;
  insumoNome: string;
  unidade: string | null;
  saldo: number;
  custoMedio: number;
  quantidadeEntradas: number;
  quantidadeSaidas: number;
  estoqueMinimo: number | null;
}

/**
 * Saldo por depósito × peça, com o estoque mínimo da peça (almoxarifado_itens).
 * O mínimo é da PEÇA, não do depósito, então cada linha compara o seu saldo com
 * o mínimo dela.
 */
export async function listarSaldos(): Promise<SaldoLinha[]> {
  const supabase = await createClient();

  const [saldos, itens] = await Promise.all([
    todasAsLinhas((de, ate) =>
      supabase
        .from("almoxarifado_saldos")
        .select(
          `deposito_id, insumo_id, saldo, custo_medio, quantidade_entradas, quantidade_saidas,
           almoxarifado_depositos(nome),
           insumos(nome, unidades_medida(sigla))`,
        )
        .order("insumo_id")
        .order("deposito_id")
        .range(de, ate),
    ),
    todasAsLinhas((de, ate) =>
      supabase
        .from("almoxarifado_itens")
        .select("insumo_id, estoque_minimo, ativo, insumos(nome, unidades_medida(sigla))")
        .order("id")
        .range(de, ate),
    ),
  ]);

  if (saldos.erro || itens.erro) {
    throw new Error("Não foi possível carregar os saldos do almoxarifado");
  }

  const minimoPorInsumo = new Map(
    itens.linhas.map((item) => [item.insumo_id, item.estoque_minimo]),
  );

  // Peça com mínimo que nunca teve entrada não tem linha em almoxarifado_saldos, e é
  // justamente a que mais precisa aparecer como abaixo do mínimo.
  const comSaldo = new Set(saldos.linhas.map((linha) => linha.insumo_id));
  const semEntrada: SaldoLinha[] = itens.linhas
    .filter((item) => item.ativo && Number(item.estoque_minimo ?? 0) > 0 && !comSaldo.has(item.insumo_id))
    .map((item) => ({
      chave: `sem-entrada:${item.insumo_id}`,
      depositoId: "",
      depositoNome: "Sem entrada ainda",
      insumoId: item.insumo_id,
      insumoNome: item.insumos?.nome ?? "",
      unidade: item.insumos?.unidades_medida?.sigla ?? null,
      saldo: 0,
      custoMedio: 0,
      quantidadeEntradas: 0,
      quantidadeSaidas: 0,
      estoqueMinimo: item.estoque_minimo,
    }));

  return saldos.linhas
    .map((linha): SaldoLinha => ({
      chave: `${linha.deposito_id}:${linha.insumo_id}`,
      depositoId: linha.deposito_id,
      depositoNome: linha.almoxarifado_depositos?.nome ?? "",
      insumoId: linha.insumo_id,
      insumoNome: linha.insumos?.nome ?? "",
      unidade: linha.insumos?.unidades_medida?.sigla ?? null,
      saldo: Number(linha.saldo),
      custoMedio: Number(linha.custo_medio),
      quantidadeEntradas: Number(linha.quantidade_entradas),
      quantidadeSaidas: Number(linha.quantidade_saidas),
      estoqueMinimo: minimoPorInsumo.get(linha.insumo_id) ?? null,
    }))
    .concat(semEntrada)
    .sort(
      (a, b) =>
        a.insumoNome.localeCompare(b.insumoNome, "pt-BR") ||
        a.depositoNome.localeCompare(b.depositoNome, "pt-BR"),
    );
}

// ---------------------------------------------------------------------------
// Entradas
// ---------------------------------------------------------------------------

export interface EntradaLinha {
  id: string;
  data: string;
  notaFiscal: string | null;
  depositoId: string;
  depositoNome: string;
  insumoId: string;
  insumoNome: string;
  unidade: string | null;
  fornecedorId: string;
  fornecedorNome: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  observacoes: string | null;
  origem: string;
}

/** Entradas que não foram para a lixeira, da mais recente para a mais antiga. */
export async function listarEntradas(): Promise<EntradaLinha[]> {
  const supabase = await createClient();

  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("almoxarifado_entradas")
      .select(
        `id, data, nota_fiscal, deposito_id, insumo_id, fornecedor_id, quantidade,
         valor_unitario, valor_total, observacoes, origem,
         almoxarifado_depositos(nome),
         insumos(nome, unidades_medida(sigla)),
         fornecedores(razao_social, nome_fantasia)`,
      )
      .is("excluido_em", null)
      .order("data", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id")
      .range(de, ate),
  );

  if (erro) {
    throw new Error("Não foi possível carregar as entradas do almoxarifado");
  }

  return linhas.map((linha) => ({
    id: linha.id,
    data: linha.data,
    notaFiscal: linha.nota_fiscal,
    depositoId: linha.deposito_id,
    depositoNome: linha.almoxarifado_depositos?.nome ?? "",
    insumoId: linha.insumo_id,
    insumoNome: linha.insumos?.nome ?? "",
    unidade: linha.insumos?.unidades_medida?.sigla ?? null,
    fornecedorId: linha.fornecedor_id,
    fornecedorNome: nomeFornecedor(linha.fornecedores),
    quantidade: Number(linha.quantidade),
    valorUnitario: Number(linha.valor_unitario),
    valorTotal: Number(linha.valor_total),
    observacoes: linha.observacoes,
    origem: linha.origem,
  }));
}

// ---------------------------------------------------------------------------
// Depósitos
// ---------------------------------------------------------------------------

export interface DepositoLinha {
  id: string;
  nome: string;
  endereco: string | null;
  ativo: boolean;
}

/** Todos os depósitos (ativos e inativos), por nome. */
export async function listarDepositos(): Promise<DepositoLinha[]> {
  const supabase = await createClient();

  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("almoxarifado_depositos")
      .select("id, nome, endereco, ativo")
      .order("nome")
      .order("id")
      .range(de, ate),
  );

  if (erro) {
    throw new Error("Não foi possível carregar os depósitos");
  }

  return linhas.map((deposito) => ({
    id: deposito.id,
    nome: deposito.nome,
    endereco: deposito.endereco,
    ativo: deposito.ativo,
  }));
}

// ---------------------------------------------------------------------------
// Peças (almoxarifado_itens)
// ---------------------------------------------------------------------------

export interface PecaLinha {
  id: string;
  insumoId: string;
  insumoNome: string;
  unidade: string | null;
  tipoOleoId: string | null;
  tipoOleoNome: string | null;
  estoqueMinimo: number | null;
  estoqueMaximo: number | null;
  equipamentoIds: string[];
  observacoes: string | null;
  ativo: boolean;
}

/** Peças cadastradas no almoxarifado, por nome do insumo. */
export async function listarPecas(): Promise<PecaLinha[]> {
  const supabase = await createClient();

  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("almoxarifado_itens")
      .select(
        `id, insumo_id, tipo_oleo_id, estoque_minimo, estoque_maximo, equipamento_ids,
         observacoes, ativo,
         insumos(nome, unidades_medida(sigla)),
         tipos_oleo(nome)`,
      )
      .order("id")
      .range(de, ate),
  );

  if (erro) {
    throw new Error("Não foi possível carregar as peças do almoxarifado");
  }

  return linhas
    .map((peca) => ({
      id: peca.id,
      insumoId: peca.insumo_id,
      insumoNome: peca.insumos?.nome ?? "",
      unidade: peca.insumos?.unidades_medida?.sigla ?? null,
      tipoOleoId: peca.tipo_oleo_id,
      tipoOleoNome: peca.tipos_oleo?.nome ?? null,
      estoqueMinimo: peca.estoque_minimo === null ? null : Number(peca.estoque_minimo),
      estoqueMaximo: peca.estoque_maximo === null ? null : Number(peca.estoque_maximo),
      equipamentoIds: peca.equipamento_ids ?? [],
      observacoes: peca.observacoes,
      ativo: peca.ativo,
    }))
    .sort((a, b) => a.insumoNome.localeCompare(b.insumoNome, "pt-BR"));
}

// ---------------------------------------------------------------------------
// Opções dos Combobox
// ---------------------------------------------------------------------------

export interface Opcao {
  id: string;
  nome: string;
}

export interface InsumoOpcao extends Opcao {
  unidade: string | null;
}

/** Depósitos ativos, para o formulário da entrada. */
export async function listarDepositosAtivos(): Promise<Opcao[]> {
  const depositos = await listarDepositos();
  return depositos
    .filter((deposito) => deposito.ativo)
    .map((deposito) => ({ id: deposito.id, nome: deposito.nome }));
}

/** Fornecedores ativos, por razão social. */
export async function listarFornecedoresAtivos(): Promise<Opcao[]> {
  const supabase = await createClient();

  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("fornecedores")
      .select("id, razao_social, nome_fantasia")
      .eq("ativo", true)
      .order("razao_social")
      .order("id")
      .range(de, ate),
  );

  if (erro) {
    throw new Error("Não foi possível carregar os fornecedores");
  }

  return linhas.map((fornecedor) => ({
    id: fornecedor.id,
    nome: nomeFornecedor(fornecedor),
  }));
}

/** Insumos ativos, com a sigla da unidade. */
export async function listarInsumosAtivos(): Promise<InsumoOpcao[]> {
  const supabase = await createClient();

  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("insumos")
      .select("id, nome, unidades_medida(sigla)")
      .eq("ativo", true)
      .order("nome")
      .order("id")
      .range(de, ate),
  );

  if (erro) {
    throw new Error("Não foi possível carregar os insumos");
  }

  return linhas.map((insumo) => ({
    id: insumo.id,
    nome: insumo.nome,
    unidade: insumo.unidades_medida?.sigla ?? null,
  }));
}

/** Tipos de óleo ativos. */
export async function listarTiposOleoAtivos(): Promise<Opcao[]> {
  const supabase = await createClient();

  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("tipos_oleo")
      .select("id, nome")
      .eq("ativo", true)
      .order("nome")
      .order("id")
      .range(de, ate),
  );

  if (erro) {
    throw new Error("Não foi possível carregar os tipos de óleo");
  }

  return linhas.map((tipo) => ({ id: tipo.id, nome: tipo.nome }));
}

/**
 * Equipamentos para a lista de compatíveis. Traz os inativos também, marcados,
 * para uma peça que já apontava para um equipamento vendido não mostrar
 * "Registro não encontrado" no lugar do nome.
 */
export async function listarEquipamentos(): Promise<(Opcao & { ativo: boolean })[]> {
  const supabase = await createClient();

  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("equipamentos")
      .select("id, codigo, descricao, placa, ativo")
      .order("descricao")
      .order("id")
      .range(de, ate),
  );

  if (erro) {
    throw new Error("Não foi possível carregar os equipamentos");
  }

  return linhas.map((equipamento) => ({
    id: equipamento.id,
    nome: rotuloEquipamento(equipamento),
    ativo: equipamento.ativo,
  }));
}
