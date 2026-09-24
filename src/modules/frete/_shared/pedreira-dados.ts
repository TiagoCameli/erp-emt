import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import { raizDoCentro } from "@/modules/combustivel/anomalias/base";
import { paraNumeroDoBanco } from "@/modules/manutencao/servicos/formato";
import { tipoDoFrete, type ItemDoPedido, type TipoFrete } from "@/modules/frete/_shared/pedreira";

/**
 * A leitura que o painel e as anomalias do Frete compartilham: todos os fretes e pedidos
 * NÃO EXCLUÍDOS (a origem lia a tabela inteira, sem período) e os cadastros que dão nome
 * a eles. `cache` do React: a mesma requisição lê uma vez só. Paginado por
 * `todasAsLinhas` (o PostgREST corta em 1.000 sem avisar, e a origem sofria disso), com
 * desempate por id.
 *
 * A pedreira do frete é o fornecedor da localidade de origem (`localidades.fornecedor_id`):
 * é o vínculo que substitui o "contém" do nome da origem.
 */

export interface FreteBase {
  id: string;
  tipo: TipoFrete;
  data: string;
  dataChegada: string | null;
  /** Raiz do centro de custo do frete (a obra), ou null. */
  obraId: string | null;
  origemId: string;
  destinoId: string;
  pedreiraId: string | null;
  transportadoraId: string;
  insumoId: string;
  peso: number;
  km: number;
  valorTkm: number;
  valorTotal: number;
  valorMaterial: number;
  notaFiscal: string | null;
  placaCarreta: string | null;
}

export interface PedidoBase {
  id: string;
  data: string;
  fornecedorId: string;
  itens: ItemDoPedido[];
}

export interface FornecedorBase {
  id: string;
  nome: string;
  ehTransportadora: boolean;
  ehDonaDeTanque: boolean;
  ativo: boolean;
  cnpj: string | null;
}

export interface BaseFrete {
  fretes: FreteBase[];
  pedidos: PedidoBase[];
  localidadeNome: Map<string, string>;
  insumoNome: Map<string, string>;
  obraNome: Map<string, string>;
  fornecedores: Map<string, FornecedorBase>;
}

interface LinhaPedido {
  id: string;
  data: string;
  fornecedor_id: string;
  pedido_material_itens: { insumo_id: string; quantidade: number | string; valor_unitario: number | string; ordem: number }[];
}

export function nomeDoFornecedor(f: { razao_social: string; nome_fantasia: string | null }): string {
  return f.nome_fantasia?.trim() || f.razao_social;
}

export const carregarBaseFrete = cache(async (): Promise<BaseFrete> => {
  const supabase = await createClient();

  const [fretes, pedidos, localidades, insumos, centros, fornecedores] = await Promise.all([
    todasAsLinhas((de, ate) =>
      supabase
        .from("fretes")
        .select(
          "id, tipo, data, data_chegada, centro_custo_id, origem_localidade_id, destino_localidade_id, transportadora_id, " +
            "insumo_id, peso_toneladas, km_rodados, valor_tkm, valor_total, valor_material, nota_fiscal, placa_carreta",
        )
        .is("excluido_em", null)
        .order("data", { ascending: false })
        .order("id")
        .range(de, ate)
        .returns<
          {
            id: string;
            tipo: string;
            data: string;
            data_chegada: string | null;
            centro_custo_id: string | null;
            origem_localidade_id: string;
            destino_localidade_id: string;
            transportadora_id: string;
            insumo_id: string;
            peso_toneladas: number | string;
            km_rodados: number | string;
            valor_tkm: number | string;
            valor_total: number | string;
            valor_material: number | string;
            nota_fiscal: string | null;
            placa_carreta: string | null;
          }[]
        >(),
    ),
    todasAsLinhas((de, ate) =>
      supabase
        .from("pedidos_material")
        .select("id, data, fornecedor_id, pedido_material_itens(insumo_id, quantidade, valor_unitario, ordem)")
        .is("excluido_em", null)
        .order("data", { ascending: false })
        .order("id")
        .range(de, ate)
        .returns<LinhaPedido[]>(),
    ),
    todasAsLinhas((de, ate) =>
      supabase.from("localidades").select("id, nome, fornecedor_id").order("id").range(de, ate),
    ),
    todasAsLinhas((de, ate) => supabase.from("insumos").select("id, nome").order("id").range(de, ate)),
    todasAsLinhas((de, ate) => supabase.from("centros_custo").select("id, nome, pai_id").order("id").range(de, ate)),
    todasAsLinhas((de, ate) =>
      supabase
        .from("fornecedores")
        .select("id, razao_social, nome_fantasia, eh_transportadora, eh_dona_de_tanque, ativo, cnpj_cpf")
        .order("id")
        .range(de, ate),
    ),
  ]);
  if (fretes.erro || pedidos.erro || localidades.erro || insumos.erro || centros.erro || fornecedores.erro) {
    throw new Error("Não foi possível carregar os fretes");
  }

  const pedreiraDaLocalidade = new Map(localidades.linhas.map((l) => [l.id, l.fornecedor_id]));
  const arvore = new Map(centros.linhas.map((c) => [c.id, { nome: c.nome, paiId: c.pai_id }]));
  const obraNome = new Map<string, string>();

  const listaFretes: FreteBase[] = fretes.linhas.map((f) => {
    const raiz = f.centro_custo_id ? raizDoCentro(f.centro_custo_id, arvore) : null;
    if (raiz) obraNome.set(raiz.id, raiz.nome);
    return {
      id: f.id,
      tipo: tipoDoFrete(f),
      data: f.data,
      dataChegada: f.data_chegada,
      obraId: raiz?.id ?? null,
      origemId: f.origem_localidade_id,
      destinoId: f.destino_localidade_id,
      pedreiraId: pedreiraDaLocalidade.get(f.origem_localidade_id) ?? null,
      transportadoraId: f.transportadora_id,
      insumoId: f.insumo_id,
      peso: paraNumeroDoBanco(f.peso_toneladas),
      km: paraNumeroDoBanco(f.km_rodados),
      valorTkm: paraNumeroDoBanco(f.valor_tkm),
      valorTotal: paraNumeroDoBanco(f.valor_total),
      valorMaterial: paraNumeroDoBanco(f.valor_material),
      notaFiscal: f.nota_fiscal,
      placaCarreta: f.placa_carreta,
    };
  });

  const listaPedidos: PedidoBase[] = pedidos.linhas.map((p) => ({
    id: p.id,
    data: p.data,
    fornecedorId: p.fornecedor_id,
    itens: [...(p.pedido_material_itens ?? [])]
      .sort((a, b) => a.ordem - b.ordem)
      .map((i) => ({
        insumoId: i.insumo_id,
        quantidade: paraNumeroDoBanco(i.quantidade),
        valorUnitario: paraNumeroDoBanco(i.valor_unitario),
      })),
  }));

  return {
    fretes: listaFretes,
    pedidos: listaPedidos,
    localidadeNome: new Map(localidades.linhas.map((l) => [l.id, l.nome.trim()])),
    insumoNome: new Map(insumos.linhas.map((i) => [i.id, i.nome])),
    obraNome,
    fornecedores: new Map(
      fornecedores.linhas.map((f) => [
        f.id,
        {
          id: f.id,
          nome: nomeDoFornecedor(f),
          ehTransportadora: f.eh_transportadora,
          ehDonaDeTanque: f.eh_dona_de_tanque,
          ativo: f.ativo,
          cnpj: f.cnpj_cpf,
        },
      ]),
    ),
  };
});
