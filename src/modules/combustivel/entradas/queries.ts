import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import { precoPorLitro } from "@/modules/combustivel/entradas/schemas";
import { paraNumeroDoBanco, paraNumeroOuNulo } from "@/modules/manutencao/servicos/formato";

/**
 * Leituras da aba Entradas e das opções que o Combustível inteiro usa (tanques,
 * combustíveis, fornecedores). A aba Abastecimentos importa as opções daqui.
 */

export interface Opcao {
  id: string;
  nome: string;
}

// ---------------------------------------------------------------------------
// Opções
// ---------------------------------------------------------------------------

export interface TanqueOpcao {
  id: string;
  rotulo: string;
  ehExterno: boolean;
  ativo: boolean;
  capacidadeLitros: number;
  nivelAtualLitros: number;
  combustivelAtualId: string | null;
  proprietarioId: string | null;
  proprietarioNome: string | null;
  /** Taxa por litro que o dono do tanque externo cobra, do cadastro dele. */
  proprietarioTaxaLitro: number | null;
}

export function rotuloTanque(tanque: { nome: string; apelido: string | null }): string {
  const apelido = tanque.apelido?.trim();
  return apelido ? `${tanque.nome} (${apelido})` : tanque.nome;
}

function nomeFornecedor(f: { razao_social: string; nome_fantasia: string | null } | null): string | null {
  if (!f) return null;
  return f.nome_fantasia?.trim() || f.razao_social;
}

/** Todos os tanques, ativos e inativos, externos inclusive. Quem usa filtra. */
export async function listarTanques(): Promise<TanqueOpcao[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tanques")
    .select(
      "id, nome, apelido, eh_externo, ativo, capacidade_litros, nivel_atual_litros, combustivel_atual_id, proprietario_id, fornecedores(razao_social, nome_fantasia, taxa_litro_padrao)",
    )
    .order("nome")
    .order("id");
  if (error) throw new Error("Não foi possível carregar os tanques");
  return (data ?? []).map((tanque) => ({
    id: tanque.id,
    rotulo: rotuloTanque(tanque),
    ehExterno: tanque.eh_externo,
    ativo: tanque.ativo,
    capacidadeLitros: paraNumeroDoBanco(tanque.capacidade_litros),
    nivelAtualLitros: paraNumeroDoBanco(tanque.nivel_atual_litros),
    combustivelAtualId: tanque.combustivel_atual_id,
    proprietarioId: tanque.proprietario_id,
    proprietarioNome: nomeFornecedor(tanque.fornecedores),
    proprietarioTaxaLitro: paraNumeroOuNulo(tanque.fornecedores?.taxa_litro_padrao ?? null),
  }));
}

export interface InsumoCombustivel {
  id: string;
  nome: string;
  unidade: string | null;
  /** Galão de Arla = 20. Nulo ou 1: a unidade já é litro. */
  litrosPorUnidade: number | null;
  ativo: boolean;
}

/**
 * Os insumos que são combustível: os da categoria "Combustível", os que têm
 * `litros_por_unidade` (o galão de Arla) e os que algum tanque tem agora. São
 * poucos (Diesel S10, S500, Gasolina, ARLA 32); oferecer os 3 mil insumos do
 * cadastro deixaria lançar parafuso no tanque.
 */
export async function listarInsumosCombustivel(): Promise<InsumoCombustivel[]> {
  const supabase = await createClient();

  const [categorias, tanques] = await Promise.all([
    supabase.from("categorias_insumo").select("id").ilike("nome", "%combust%"),
    supabase.from("tanques").select("combustivel_atual_id").not("combustivel_atual_id", "is", null),
  ]);
  if (categorias.error || tanques.error) {
    throw new Error("Não foi possível carregar os combustíveis");
  }

  const idsCategoria = (categorias.data ?? []).map((c) => c.id);
  const idsDosTanques = [
    ...new Set((tanques.data ?? []).map((t) => t.combustivel_atual_id).filter((id): id is string => id !== null)),
  ];

  const condicoes = ["litros_por_unidade.not.is.null"];
  if (idsCategoria.length > 0) condicoes.push(`categoria_id.in.(${idsCategoria.join(",")})`);
  if (idsDosTanques.length > 0) condicoes.push(`id.in.(${idsDosTanques.join(",")})`);

  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("insumos")
      .select("id, nome, ativo, litros_por_unidade, unidades_medida(sigla)")
      .or(condicoes.join(","))
      .order("nome")
      .order("id")
      .range(de, ate),
  );
  if (erro) throw new Error("Não foi possível carregar os combustíveis");

  return linhas.map((insumo) => ({
    id: insumo.id,
    nome: insumo.nome,
    unidade: insumo.unidades_medida?.sigla ?? null,
    litrosPorUnidade: paraNumeroOuNulo(insumo.litros_por_unidade),
    ativo: insumo.ativo,
  }));
}

/** Fornecedores ativos, paginados até o fim (já são mais de 900). */
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
  if (erro) throw new Error("Não foi possível carregar os fornecedores");
  return linhas.map((f) => ({ id: f.id, nome: nomeFornecedor(f) ?? f.razao_social }));
}

// ---------------------------------------------------------------------------
// Lista
// ---------------------------------------------------------------------------

export interface EntradaLinha {
  id: string;
  /** Instante ISO (timestamptz). */
  dataHora: string;
  tanqueId: string;
  tanqueNome: string;
  insumoId: string;
  insumoNome: string;
  unidade: string | null;
  quantidade: number;
  litros: number;
  valorTotal: number;
  /** Valor ÷ litros, 4 casas: o preço da camada no PEPS. */
  precoLitro: number | null;
  fornecedorId: string | null;
  fornecedorNome: string | null;
  notaFiscal: string | null;
  observacoes: string | null;
  origem: string;
  /** Instante da exclusão (lixeira). Nulo: lançada. */
  excluidoEm: string | null;
  motivoExclusao: string | null;
}

function precoDaLinha(valorTotal: number, litros: number): { precoLitro: number | null } {
  return { precoLitro: precoPorLitro(valorTotal, litros) };
}

/**
 * Todas as entradas não excluídas (poucas centenas), via `todasAsLinhas`: a tela
 * filtra em memória. Desempate por id para a paginação não repetir linha. Com
 * `excluidas`, só as da lixeira (o "Mostrar excluídos" de quem pode restaurar).
 */
export async function listarEntradas(excluidas = false): Promise<EntradaLinha[]> {
  const supabase = await createClient();
  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("combustivel_entradas")
      .select(
        "id, data_hora, tanque_id, insumo_id, quantidade, litros, valor_total, fornecedor_id, nota_fiscal, observacoes, origem, excluido_em, motivo_exclusao, tanques(nome, apelido), insumos(nome, unidades_medida(sigla)), fornecedores(razao_social, nome_fantasia)",
      )
      .filter("excluido_em", excluidas ? "not.is" : "is", null)
      .order("data_hora", { ascending: false })
      .order("id")
      .range(de, ate),
  );
  if (erro) throw new Error("Não foi possível carregar as entradas de combustível");

  return linhas.map((linha) => ({
    ...precoDaLinha(paraNumeroDoBanco(linha.valor_total), paraNumeroDoBanco(linha.litros)),
    id: linha.id,
    dataHora: linha.data_hora,
    tanqueId: linha.tanque_id,
    tanqueNome: linha.tanques ? rotuloTanque(linha.tanques) : "",
    insumoId: linha.insumo_id,
    insumoNome: linha.insumos?.nome ?? "",
    unidade: linha.insumos?.unidades_medida?.sigla ?? null,
    quantidade: paraNumeroDoBanco(linha.quantidade),
    litros: paraNumeroDoBanco(linha.litros),
    valorTotal: paraNumeroDoBanco(linha.valor_total),
    fornecedorId: linha.fornecedor_id,
    fornecedorNome: nomeFornecedor(linha.fornecedores),
    notaFiscal: linha.nota_fiscal,
    observacoes: linha.observacoes,
    origem: linha.origem,
    excluidoEm: linha.excluido_em,
    motivoExclusao: linha.motivo_exclusao,
  }));
}
