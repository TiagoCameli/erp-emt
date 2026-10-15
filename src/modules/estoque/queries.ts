import "server-only";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import { codificarLocal } from "@/modules/estoque/calculo";

/**
 * Leitura do Estoque. Toda lista passa por `todasAsLinhas` (o PostgREST corta em 1.000
 * sem avisar) e toda ordenação termina numa chave única, senão a paginação repete linha.
 *
 * A posição e os itens de OC vêm de RPC: juntam combustível, peças e Compras, que a
 * pessoa do Estoque não precisa enxergar tabela por tabela.
 */

function nomeFornecedor(fornecedor: { razao_social: string; nome_fantasia: string | null } | null): string {
  if (!fornecedor) return "";
  return fornecedor.nome_fantasia?.trim() || fornecedor.razao_social;
}

/** O local da linha (depósito, tanque ou pilha) num valor só, com o nome para a tabela. */
function localDaLinha(linha: {
  deposito_id: string | null;
  tanque_id: string | null;
  pilha_id: string | null;
  almoxarifado_depositos: { nome: string } | null;
  tanques: { nome: string } | null;
  estoque_pilhas: { nome: string } | null;
}): { local: string; localNome: string } {
  if (linha.tanque_id) {
    return { local: codificarLocal("tanque", linha.tanque_id), localNome: `${linha.tanques?.nome ?? ""} (tanque)` };
  }
  if (linha.pilha_id) {
    return { local: codificarLocal("pilha", linha.pilha_id), localNome: `${linha.estoque_pilhas?.nome ?? ""} (pilha)` };
  }
  return { local: codificarLocal("deposito", linha.deposito_id ?? ""), localNome: linha.almoxarifado_depositos?.nome ?? "" };
}

// ---------------------------------------------------------------------------
// Locais
// ---------------------------------------------------------------------------

export interface LocalOpcao {
  /** `codificarLocal(...)`. */
  id: string;
  nome: string;
  ativo: boolean;
}

/**
 * Onde o Estoque guarda: os depósitos, os tanques de MATERIAL (CAP, emulsão...) e as pilhas
 * de agregado. O tanque de combustível é do módulo Combustível e fica de fora.
 */
export async function listarLocais(): Promise<LocalOpcao[]> {
  const supabase = await createClient();
  const [depositos, tanques, pilhas] = await Promise.all([
    todasAsLinhas((de, ate) =>
      supabase.from("almoxarifado_depositos").select("id, nome, ativo").order("nome").order("id").range(de, ate),
    ),
    todasAsLinhas((de, ate) =>
      supabase.from("tanques").select("id, nome, ativo").eq("uso", "material").order("nome").order("id").range(de, ate),
    ),
    todasAsLinhas((de, ate) =>
      supabase.from("estoque_pilhas").select("id, nome, ativo").order("nome").order("id").range(de, ate),
    ),
  ]);
  if (depositos.erro || tanques.erro || pilhas.erro) {
    throw new Error("Não foi possível carregar os depósitos, tanques e pilhas");
  }
  return [
    ...depositos.linhas.map((d) => ({ id: codificarLocal("deposito", d.id), nome: d.nome, ativo: d.ativo })),
    ...tanques.linhas.map((t) => ({ id: codificarLocal("tanque", t.id), nome: `${t.nome} (tanque)`, ativo: t.ativo })),
    ...pilhas.linhas.map((p) => ({ id: codificarLocal("pilha", p.id), nome: `${p.nome} (pilha)`, ativo: p.ativo })),
  ];
}

// ---------------------------------------------------------------------------
// Posição
// ---------------------------------------------------------------------------

export type OrigemPosicao = "estoque" | "combustivel" | "pecas";

export interface PosicaoLinha {
  chave: string;
  origem: OrigemPosicao;
  localTipo: "deposito" | "tanque" | "pilha";
  localId: string;
  localNome: string;
  insumoId: string | null;
  insumoNome: string;
  unidade: string | null;
  quantidade: number;
  valor: number;
  /** Valor ÷ quantidade, para a coluna de custo. Zero quando não há saldo. */
  custoUnitario: number;
}

export async function listarPosicao(): Promise<PosicaoLinha[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_estoque_posicao");
  if (error) throw new Error("Não foi possível carregar a posição do estoque");

  return (data ?? [])
    .map((linha): PosicaoLinha => {
      const quantidade = Number(linha.quantidade ?? 0);
      const valor = Number(linha.valor ?? 0);
      return {
        chave: `${linha.origem}:${linha.local_id}:${linha.insumo_id ?? "vazio"}`,
        origem: linha.origem as OrigemPosicao,
        localTipo: linha.local_tipo as PosicaoLinha["localTipo"],
        localId: linha.local_id,
        localNome: linha.local_nome,
        insumoId: linha.insumo_id,
        insumoNome: linha.insumo_nome ?? "Vazio",
        unidade: linha.unidade,
        quantidade,
        valor,
        custoUnitario: quantidade !== 0 ? valor / quantidade : 0,
      };
    })
    .sort(
      (a, b) =>
        a.insumoNome.localeCompare(b.insumoNome, "pt-BR") || a.localNome.localeCompare(b.localNome, "pt-BR"),
    );
}

// ---------------------------------------------------------------------------
// Entradas
// ---------------------------------------------------------------------------

export interface EntradaLinha {
  id: string;
  data: string;
  /** Depósito, tanque de material ou pilha, por `codificarLocal`. */
  local: string;
  localNome: string;
  insumoId: string;
  insumoNome: string;
  unidade: string | null;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  ocItemId: string | null;
  ocNumero: string | null;
  fornecedorNome: string;
  notaFiscal: string | null;
  observacoes: string | null;
  excluida: boolean;
  motivoExclusao: string | null;
}

/** Entradas, as excluídas também (a tela filtra; restaurar precisa delas). */
export async function listarEntradas(): Promise<EntradaLinha[]> {
  const supabase = await createClient();
  const { linhas, erro } = await todasAsLinhas((de, ate) =>
    supabase
      .from("estoque_entradas")
      .select(
        `id, data, deposito_id, tanque_id, pilha_id, insumo_id, quantidade, valor_unitario, valor_total, oc_item_id, oc_numero,
         nota_fiscal, observacoes, excluido_em, motivo_exclusao,
         almoxarifado_depositos(nome),
         tanques(nome),
         estoque_pilhas(nome),
         insumos(nome, unidades_medida(sigla)),
         fornecedores(razao_social, nome_fantasia)`,
      )
      .order("data", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id")
      .range(de, ate),
  );
  if (erro) throw new Error("Não foi possível carregar as entradas do estoque");

  return linhas.map((linha) => ({
    id: linha.id,
    data: linha.data,
    ...localDaLinha(linha),
    insumoId: linha.insumo_id,
    insumoNome: linha.insumos?.nome ?? "",
    unidade: linha.insumos?.unidades_medida?.sigla ?? null,
    quantidade: Number(linha.quantidade),
    valorUnitario: Number(linha.valor_unitario),
    valorTotal: Number(linha.valor_total ?? 0),
    ocItemId: linha.oc_item_id,
    ocNumero: linha.oc_numero,
    fornecedorNome: nomeFornecedor(linha.fornecedores),
    notaFiscal: linha.nota_fiscal,
    observacoes: linha.observacoes,
    excluida: linha.excluido_em !== null,
    motivoExclusao: linha.motivo_exclusao,
  }));
}

// ---------------------------------------------------------------------------
// Saídas
// ---------------------------------------------------------------------------

export interface SaidaLinha {
  id: string;
  data: string;
  local: string;
  localNome: string;
  insumoId: string;
  insumoNome: string;
  unidade: string | null;
  quantidade: number;
  custoUnitario: number;
  valorTotal: number;
  centroCustoId: string;
  /** "Obra X" ou "Obra X › Etapa Y". */
  centroCustoRotulo: string;
  /** A raiz, para o filtro. */
  centroCustoRaiz: string;
  observacoes: string | null;
  excluida: boolean;
  motivoExclusao: string | null;
}

export async function listarSaidas(): Promise<SaidaLinha[]> {
  const supabase = await createClient();
  const [saidas, centros] = await Promise.all([
    todasAsLinhas((de, ate) =>
      supabase
        .from("estoque_saidas")
        .select(
          `id, data, deposito_id, tanque_id, pilha_id, insumo_id, quantidade, custo_unitario, valor_total, centro_custo_id,
           observacoes, excluido_em, motivo_exclusao,
           almoxarifado_depositos(nome),
           tanques(nome),
           estoque_pilhas(nome),
           insumos(nome, unidades_medida(sigla))`,
        )
        .order("data", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id")
        .range(de, ate),
    ),
    // Inativos também: a saída antiga continua mostrando o centro em que caiu.
    todasAsLinhas((de, ate) =>
      supabase.from("centros_custo").select("id, nome, pai_id").order("id").range(de, ate),
    ),
  ]);
  if (saidas.erro || centros.erro) throw new Error("Não foi possível carregar as saídas do estoque");

  const porId = new Map(centros.linhas.map((centro) => [centro.id, centro]));
  function raizDe(id: string): { id: string; nome: string } | null {
    let atual = porId.get(id);
    while (atual?.pai_id) atual = porId.get(atual.pai_id);
    return atual ? { id: atual.id, nome: atual.nome } : null;
  }

  return saidas.linhas.map((linha) => {
    const centro = porId.get(linha.centro_custo_id);
    const raiz = raizDe(linha.centro_custo_id);
    const rotulo =
      centro && raiz && centro.id !== raiz.id ? `${raiz.nome} › ${centro.nome}` : (centro?.nome ?? "");
    return {
      id: linha.id,
      data: linha.data,
      ...localDaLinha(linha),
      insumoId: linha.insumo_id,
      insumoNome: linha.insumos?.nome ?? "",
      unidade: linha.insumos?.unidades_medida?.sigla ?? null,
      quantidade: Number(linha.quantidade),
      custoUnitario: Number(linha.custo_unitario),
      valorTotal: Number(linha.valor_total),
      centroCustoId: linha.centro_custo_id,
      centroCustoRotulo: rotulo,
      centroCustoRaiz: raiz?.id ?? linha.centro_custo_id,
      observacoes: linha.observacoes,
      excluida: linha.excluido_em !== null,
      motivoExclusao: linha.motivo_exclusao,
    };
  });
}

// ---------------------------------------------------------------------------
// Itens de OC para a entrada
// ---------------------------------------------------------------------------

export interface ItemOcDisponivel {
  ocItemId: string;
  ocNumero: string;
  dataCompra: string | null;
  fornecedorNome: string;
  insumoId: string;
  insumoNome: string;
  unidade: string | null;
  quantidade: number;
  quantidadeRestante: number;
  precoUnitario: number;
  centroCustoNome: string | null;
}

/** Itens de OC aprovada (ou recebida, ou paga) que ainda têm quantidade para entrar. */
export async function listarItensOcDisponiveis(): Promise<ItemOcDisponivel[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_estoque_oc_itens_disponiveis");
  if (error) throw new Error("Não foi possível carregar os itens das OCs");
  return (data ?? []).map((linha) => ({
    ocItemId: linha.oc_item_id,
    ocNumero: linha.oc_numero,
    dataCompra: linha.data_compra,
    fornecedorNome: linha.fornecedor_nome ?? "",
    insumoId: linha.insumo_id,
    insumoNome: linha.insumo_nome,
    unidade: linha.unidade,
    quantidade: Number(linha.quantidade),
    quantidadeRestante: Number(linha.quantidade_restante),
    precoUnitario: Number(linha.preco_unitario),
    centroCustoNome: linha.centro_custo_nome,
  }));
}
