import { filtrarPedidos, subtotal, type FiltrosPedidos } from "@/modules/frete/pedidos-material/regras";

/**
 * Os números do export de pedidos de material, iguais a utils/pedidosMaterialExport.ts da
 * origem: mesmo filtro da lista, itens "achatados" (com filtro de material, só os itens
 * daquele material), KPIs e as tabelas POR FORNECEDOR e POR MATERIAL com % sobre o todo.
 * Módulo puro: a planilha (exceljs) e o teste leem daqui.
 */

export interface PedidoDoRelatorio {
  data: string;
  fornecedorId: string;
  fornecedorNome: string;
  observacoes: string | null;
  itens: { insumoId: string; insumoNome: string; quantidade: number; valorUnitario: number }[];
}

export interface ItemAchatado {
  data: string;
  fornecedor: string;
  material: string;
  quantidade: number;
  valorUnitario: number;
  subtotal: number;
  observacoes: string;
}

export function achatarItens(pedidos: readonly PedidoDoRelatorio[], materialId: string): ItemAchatado[] {
  const saida: ItemAchatado[] = [];
  for (const p of pedidos) {
    for (const item of p.itens) {
      if (materialId && item.insumoId !== materialId) continue;
      saida.push({
        data: p.data,
        fornecedor: p.fornecedorNome || "-",
        material: item.insumoNome || item.insumoId,
        quantidade: item.quantidade,
        valorUnitario: item.valorUnitario,
        subtotal: subtotal(item.quantidade, item.valorUnitario),
        observacoes: p.observacoes || "-",
      });
    }
  }
  return saida;
}

export interface Agregado {
  chave: string;
  registros: number;
  quantidade: number;
  valor: number;
}

/** Agrupa e ordena por valor desc, como `agruparItens` da origem. */
export function agruparItens(itens: readonly ItemAchatado[], chaveDe: (i: ItemAchatado) => string): Agregado[] {
  const mapa = new Map<string, Agregado>();
  for (const i of itens) {
    const chave = chaveDe(i);
    if (!chave) continue;
    const atual = mapa.get(chave);
    if (atual) {
      atual.registros += 1;
      atual.quantidade += i.quantidade;
      atual.valor += i.subtotal;
    } else mapa.set(chave, { chave, registros: 1, quantidade: i.quantidade, valor: i.subtotal });
  }
  return [...mapa.values()].sort((a, b) => b.valor - a.valor);
}

export interface DadosRelatorioPedidos {
  pedidos: number;
  itens: ItemAchatado[];
  quantidadeTotal: number;
  valorTotal: number;
  porFornecedor: Agregado[];
  porMaterial: Agregado[];
}

export function consolidarPedidos(pedidos: readonly PedidoDoRelatorio[], filtros: FiltrosPedidos): DadosRelatorioPedidos {
  const filtrados = filtrarPedidos(pedidos, filtros);
  const itens = achatarItens(filtrados, filtros.materialId);
  return {
    pedidos: filtrados.length,
    itens,
    quantidadeTotal: itens.reduce((s, i) => s + i.quantidade, 0),
    valorTotal: itens.reduce((s, i) => s + i.subtotal, 0),
    porFornecedor: agruparItens(itens, (i) => i.fornecedor),
    porMaterial: agruparItens(itens, (i) => i.material),
  };
}

/** % do agrupamento sobre o todo (a origem divide por 1 quando o todo é zero). */
export function percentual(parte: number, todo: number): number {
  return parte / (todo || 1);
}

/** `pedidos-material-AAAA-MM-DD.xlsx`, como `makeFilename` da origem. */
export function nomeArquivoPedidos(hoje: string): string {
  return `pedidos-material-${hoje}.xlsx`;
}
