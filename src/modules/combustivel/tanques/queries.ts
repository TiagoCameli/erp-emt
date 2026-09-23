import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import type { MovimentoTanque } from "@/modules/combustivel/tanques/calculo";

/**
 * Leitura dos tanques. Toda lista passa por `todasAsLinhas` (o PostgREST corta
 * em 1.000 sem avisar) e termina a ordem numa chave única, senão a paginação
 * por `.range()` repete ou pula linha.
 */

/** Nome de exibição do fornecedor: fantasia quando existe, senão razão social. */
function nomeFornecedor(fornecedor: { razao_social: string; nome_fantasia: string | null } | null): string {
  if (!fornecedor) return "";
  return fornecedor.nome_fantasia?.trim() || fornecedor.razao_social;
}

export interface TanqueLinha {
  id: string;
  nome: string;
  apelido: string | null;
  capacidade: number;
  /** Cache do gatilho (fn_comb_recalcular_nivel). */
  nivel: number;
  combustivelId: string | null;
  combustivelNome: string | null;
  ehExterno: boolean;
  proprietarioId: string | null;
  proprietarioNome: string | null;
  observacoes: string | null;
  ativo: boolean;
}

const SELECT_TANQUE = `id, nome, apelido, capacidade_litros, nivel_atual_litros, combustivel_atual_id,
  eh_externo, proprietario_id, observacoes, ativo,
  insumos(nome),
  fornecedores(razao_social, nome_fantasia)`;

interface TanqueBruto {
  id: string;
  nome: string;
  apelido: string | null;
  capacidade_litros: number;
  nivel_atual_litros: number;
  combustivel_atual_id: string | null;
  eh_externo: boolean;
  proprietario_id: string | null;
  observacoes: string | null;
  ativo: boolean;
  insumos: { nome: string } | null;
  fornecedores: { razao_social: string; nome_fantasia: string | null } | null;
}

function paraTanque(linha: TanqueBruto): TanqueLinha {
  return {
    id: linha.id,
    nome: linha.nome,
    apelido: linha.apelido,
    capacidade: Number(linha.capacidade_litros),
    nivel: Number(linha.nivel_atual_litros),
    combustivelId: linha.combustivel_atual_id,
    combustivelNome: linha.insumos?.nome ?? null,
    ehExterno: linha.eh_externo,
    proprietarioId: linha.proprietario_id,
    proprietarioNome: linha.fornecedores ? nomeFornecedor(linha.fornecedores) : null,
    observacoes: linha.observacoes,
    ativo: linha.ativo,
  };
}

/** Todos os tanques (ativos e inativos), por nome. */
export async function listarTanques(): Promise<TanqueLinha[]> {
  const supabase = await createClient();

  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase.from("tanques").select(SELECT_TANQUE).order("nome").order("id").range(de, ate),
  );

  if (erro) {
    throw new Error("Não foi possível carregar os tanques");
  }

  return linhas.map(paraTanque);
}

/** Um tanque, ou null se não existe (ou a RLS não deixa ver). */
export async function buscarTanque(id: string): Promise<TanqueLinha | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("tanques").select(SELECT_TANQUE).eq("id", id).maybeSingle();
  if (error) {
    throw new Error("Não foi possível carregar o tanque");
  }
  return data ? paraTanque(data) : null;
}

export interface FornecedorOpcao {
  id: string;
  nome: string;
}

/** Fornecedores ativos, para o Combobox do dono do tanque de terceiro. */
export async function listarFornecedoresAtivos(): Promise<FornecedorOpcao[]> {
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

  return linhas.map((fornecedor) => ({ id: fornecedor.id, nome: nomeFornecedor(fornecedor) }));
}

function rotuloEquipamento(equipamento: { codigo: string | null; descricao: string } | null): string {
  if (!equipamento) return "";
  return [equipamento.codigo?.trim(), equipamento.descricao.trim()].filter(Boolean).join(" · ");
}

/**
 * Tudo o que mexeu no nível do tanque, fora da lixeira: entradas,
 * abastecimentos com origem no tanque, transferências (enviadas e recebidas) e
 * esvaziamentos. A ordem e o nível corrido são da `linhaDoTempo`.
 */
export async function listarMovimentosTanque(tanqueId: string): Promise<MovimentoTanque[]> {
  const supabase = await createClient();

  const [entradas, saidas, enviadas, recebidas, esvaziamentos] = await Promise.all([
    todasAsLinhas((de, ate) =>
      supabase
        .from("combustivel_entradas")
        .select("id, data_hora, created_at, litros, nota_fiscal, insumos(nome), fornecedores(razao_social, nome_fantasia)")
        .eq("tanque_id", tanqueId)
        .is("excluido_em", null)
        .order("id")
        .range(de, ate),
    ),
    todasAsLinhas((de, ate) =>
      supabase
        .from("combustivel_saidas")
        .select(
          "id, data, created_at, litros, tipo_consumidor, placa, equipamentos(codigo, descricao), fornecedores(razao_social, nome_fantasia)",
        )
        .eq("tanque_id", tanqueId)
        .eq("origem", "tanque")
        .is("excluido_em", null)
        .order("id")
        .range(de, ate),
    ),
    todasAsLinhas((de, ate) =>
      supabase
        .from("combustivel_transferencias")
        .select("id, data_hora, created_at, litros, destino:tanques!combustivel_transferencias_tanque_destino_id_fkey(nome)")
        .eq("tanque_origem_id", tanqueId)
        .is("excluido_em", null)
        .order("id")
        .range(de, ate),
    ),
    todasAsLinhas((de, ate) =>
      supabase
        .from("combustivel_transferencias")
        .select("id, data_hora, created_at, litros, origem:tanques!combustivel_transferencias_tanque_origem_id_fkey(nome)")
        .eq("tanque_destino_id", tanqueId)
        .is("excluido_em", null)
        .order("id")
        .range(de, ate),
    ),
    todasAsLinhas((de, ate) =>
      supabase
        .from("combustivel_esvaziamentos")
        .select("id, data_hora, created_at, litros, motivo")
        .eq("tanque_id", tanqueId)
        .is("excluido_em", null)
        .order("id")
        .range(de, ate),
    ),
  ]);

  if (entradas.erro || saidas.erro || enviadas.erro || recebidas.erro || esvaziamentos.erro) {
    throw new Error("Não foi possível carregar os movimentos do tanque");
  }

  const movimentos: MovimentoTanque[] = [];

  for (const e of entradas.linhas) {
    const partes = [e.insumos?.nome, nomeFornecedor(e.fornecedores), e.nota_fiscal ? `NF ${e.nota_fiscal}` : null];
    movimentos.push({
      id: e.id,
      tipo: "entrada",
      dataHora: e.data_hora,
      criadoEm: e.created_at,
      litros: Number(e.litros),
      descricao: partes.filter(Boolean).join(" · "),
    });
  }
  for (const s of saidas.linhas) {
    const descricao =
      s.tipo_consumidor === "carreta_transportadora"
        ? [nomeFornecedor(s.fornecedores), s.placa].filter(Boolean).join(" · ")
        : rotuloEquipamento(s.equipamentos);
    movimentos.push({
      id: s.id,
      tipo: "abastecimento",
      dataHora: s.data,
      criadoEm: s.created_at,
      litros: Number(s.litros),
      descricao,
    });
  }
  for (const t of enviadas.linhas) {
    movimentos.push({
      id: t.id,
      tipo: "transferencia_enviada",
      dataHora: t.data_hora,
      criadoEm: t.created_at,
      litros: Number(t.litros),
      descricao: t.destino?.nome ? `Para ${t.destino.nome}` : "",
    });
  }
  for (const t of recebidas.linhas) {
    movimentos.push({
      id: t.id,
      tipo: "transferencia_recebida",
      dataHora: t.data_hora,
      criadoEm: t.created_at,
      litros: Number(t.litros),
      descricao: t.origem?.nome ? `De ${t.origem.nome}` : "",
    });
  }
  for (const v of esvaziamentos.linhas) {
    movimentos.push({
      id: v.id,
      tipo: "esvaziamento",
      dataHora: v.data_hora,
      criadoEm: v.created_at,
      litros: Number(v.litros),
      descricao: v.motivo,
    });
  }

  return movimentos;
}
