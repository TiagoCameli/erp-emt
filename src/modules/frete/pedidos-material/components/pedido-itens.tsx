import { MoneyText } from "@/components/canonicos";
import type { PedidoLinha } from "@/modules/frete/pedidos-material/queries";
import { subtotal } from "@/modules/frete/pedidos-material/regras";
import { formatarValorOperacional } from "@/modules/manutencao/servicos/formato";

/** Quantidade como a origem: no mínimo 2 casas (até as 6 que o banco guarda). */
function formatarQuantidadePedido(valor: number): string {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

/**
 * Sub-tabela dos itens do pedido (a linha expandida do PedidoMaterialList da origem):
 * Material, Quantidade, Vlr unitário, Subtotal e as observações.
 */
export function PedidoItens({ pedido }: { pedido: PedidoLinha }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-detalhe">
          <thead>
            <tr className="border-b border-border text-legenda text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Material</th>
              <th className="px-3 py-2 text-right font-medium">Quantidade</th>
              <th className="px-3 py-2 text-right font-medium">Vlr unitário</th>
              <th className="px-3 py-2 text-right font-medium">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {pedido.itens.map((item, indice) => (
              <tr key={`${item.insumoId}-${indice}`} className="border-b border-border last:border-b-0">
                <td className="px-3 py-1.5">{item.insumoNome || item.insumoId}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {formatarQuantidadePedido(item.quantidade)}
                  {item.unidade ? <span className="ml-1 text-muted-foreground">{item.unidade}</span> : null}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatarValorOperacional(item.valorUnitario)}</td>
                <td className="px-3 py-1.5 text-right">
                  <MoneyText valor={subtotal(item.quantidade, item.valorUnitario)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pedido.observacoes ? (
        <p className="text-legenda text-muted-foreground">
          <span className="font-medium">Obs:</span> {pedido.observacoes}
        </p>
      ) : null}
    </div>
  );
}

