import { CASAS_TAXA } from "@/lib/casas-decimais";
import { textoParaNumero } from "@/modules/manutencao/servicos/numero";

/**
 * Regras do pedido de material na pedreira, iguais à origem (PedidoMaterialForm e
 * PedidoMaterialList do Gestão Obras). Módulo puro: tela, action e teste.
 *
 * Quantidade com até 6 casas e valor unitário com até 4, como o banco guarda
 * (pedido_material_itens: numeric(18,6) e numeric(14,4)). O subtotal é quantidade × valor
 * unitário, exato, sem arredondar (a origem não arredonda).
 */

export const CASAS_QUANTIDADE_PEDIDO = 6;
export const CASAS_VALOR_UNITARIO_PEDIDO = CASAS_TAXA;

/** Um item do formulário: números como texto cru do campo. */
export interface ItemPedidoForm {
  insumoId: string;
  quantidade: string;
  valorUnitario: string;
}

export function itemVazio(): ItemPedidoForm {
  return { insumoId: "", quantidade: "", valorUnitario: "" };
}

export function quantidadeDoItem(item: ItemPedidoForm): number {
  return textoParaNumero(item.quantidade, CASAS_QUANTIDADE_PEDIDO) ?? 0;
}

export function valorUnitarioDoItem(item: ItemPedidoForm): number {
  return textoParaNumero(item.valorUnitario, CASAS_VALOR_UNITARIO_PEDIDO) ?? 0;
}

/** Subtotal da origem: quantidade × valor unitário. */
export function subtotal(quantidade: number, valorUnitario: number): number {
  return (quantidade || 0) * (valorUnitario || 0);
}

export function subtotalDoItem(item: ItemPedidoForm): number {
  return subtotal(quantidadeDoItem(item), valorUnitarioDoItem(item));
}

/** "Valor Total do Pedido": soma dos subtotais. */
export function totalDoPedido(itens: readonly { quantidade: number; valorUnitario: number }[]): number {
  return itens.reduce((soma, item) => soma + subtotal(item.quantidade, item.valorUnitario), 0);
}

export function totalDoForm(itens: readonly ItemPedidoForm[]): number {
  return itens.reduce((soma, item) => soma + subtotalDoItem(item), 0);
}

/** `itensValidos` da origem: ao menos um, todos com material, quantidade > 0 e valor > 0. */
export function itensValidos(itens: readonly ItemPedidoForm[]): boolean {
  return (
    itens.length > 0 &&
    itens.every((item) => {
      const q = textoParaNumero(item.quantidade, CASAS_QUANTIDADE_PEDIDO);
      const v = textoParaNumero(item.valorUnitario, CASAS_VALOR_UNITARIO_PEDIDO);
      return item.insumoId !== "" && q !== null && q > 0 && v !== null && v > 0;
    })
  );
}

/** Remover (X) só quando há mais de um item. */
export function podeRemoverItem(itens: readonly ItemPedidoForm[]): boolean {
  return itens.length > 1;
}

// ---------------------------------------------------------------------------
// Payload da fn_pedido_material_salvar
// ---------------------------------------------------------------------------

export interface ItemPedido {
  insumoId: string;
  quantidade: number;
  valorUnitario: number;
}

export interface DadosPedido {
  data: string;
  fornecedorId: string;
  observacoes: string | null;
  itens: ItemPedido[];
}

export function itensDoForm(itens: readonly ItemPedidoForm[]): ItemPedido[] {
  return itens.map((item) => ({
    insumoId: item.insumoId,
    quantidade: quantidadeDoItem(item),
    valorUnitario: valorUnitarioDoItem(item),
  }));
}

export function pDadosDoPedido(dados: DadosPedido) {
  return {
    data: dados.data,
    fornecedor_id: dados.fornecedorId,
    observacoes: dados.observacoes,
    itens: dados.itens.map((item) => ({
      insumo_id: item.insumoId,
      quantidade: item.quantidade,
      valor_unitario: item.valorUnitario,
    })),
  };
}

// ---------------------------------------------------------------------------
// Filtro da lista e do export (PedidoMaterialList e pedidosMaterialExport da origem)
// ---------------------------------------------------------------------------

export interface PedidoFiltravel {
  data: string;
  fornecedorId: string;
  itens: readonly { insumoId: string }[];
}

export interface FiltrosPedidos {
  fornecedorId: string;
  /** Pedido com algum item deste material. */
  materialId: string;
  de: string;
  ate: string;
}

export const FILTROS_PEDIDOS_VAZIOS: FiltrosPedidos = { fornecedorId: "", materialId: "", de: "", ate: "" };

export function filtrarPedidos<T extends PedidoFiltravel>(pedidos: readonly T[], filtros: FiltrosPedidos): T[] {
  return pedidos
    .filter((p) => {
      if (filtros.fornecedorId && p.fornecedorId !== filtros.fornecedorId) return false;
      if (filtros.materialId && !p.itens.some((i) => i.insumoId === filtros.materialId)) return false;
      if (filtros.de && p.data < filtros.de) return false;
      if (filtros.ate && p.data > filtros.ate) return false;
      return true;
    })
    .sort((a, b) => b.data.localeCompare(a.data));
}

/** "Total (N pedidos)". */
export function rotuloTotalPedidos(quantidade: number): string {
  return `Total (${quantidade} ${quantidade === 1 ? "pedido" : "pedidos"})`;
}
