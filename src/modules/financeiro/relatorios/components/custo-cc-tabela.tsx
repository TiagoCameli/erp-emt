import { CelulaVazia, MoneyText } from "@/components/canonicos";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatarPercentual } from "@/lib/formatadores";
import type { CustoPorCentroCusto } from "../queries";

interface CustoCcTabelaProps {
  custo: CustoPorCentroCusto;
}

/**
 * Custo por centro de custo em tabela: código, nome, valor e participação
 * percentual no total. Maiores primeiro (a query já ordena).
 */
export function CustoCcTabela({ custo }: CustoCcTabelaProps) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {/* Centralizado é o padrão de tabela do app (ver DataTable); só
                dinheiro, quantidade, total, percentual e horas vão à direita. */}
            <TableHead className="h-9 px-3 text-center text-detalhe font-medium text-muted-foreground">
              Código
            </TableHead>
            <TableHead className="h-9 px-3 text-center text-detalhe font-medium text-muted-foreground">
              Centro de custo
            </TableHead>
            <TableHead className="h-9 px-3 text-right text-detalhe font-medium text-muted-foreground">
              Valor
            </TableHead>
            <TableHead className="h-9 px-3 text-right text-detalhe font-medium text-muted-foreground">
              Participação
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="[&_td]:px-3">
          {custo.centros.map((centro) => (
            <TableRow key={centro.centroCustoId}>
              {/* `text-detalhe` fica na célula, e não no `span`: o `codigo-doc`
                  já traz o tamanho dele, e é a CelulaVazia que precisaria
                  herdar o tamanho certo da tabela. */}
              <TableCell className="py-2 text-center text-detalhe text-muted-foreground">
                {centro.codigo ? (
                  <span className="codigo-doc">{centro.codigo}</span>
                ) : (
                  <CelulaVazia />
                )}
              </TableCell>
              <TableCell className="py-2 text-center text-detalhe text-foreground">
                {centro.nome}
              </TableCell>
              <TableCell className="py-2 text-right">
                <MoneyText valor={centro.valor} className="text-detalhe" />
              </TableCell>
              <TableCell className="py-2 text-right text-detalhe tabular-nums text-muted-foreground">
                {custo.total > 0
                  ? formatarPercentual((centro.valor / custo.total) * 100)
                  : formatarPercentual(0)}
              </TableCell>
            </TableRow>
          ))}
          <TableRow className="border-t-2 bg-surface hover:bg-surface">
            <TableCell
              colSpan={2}
              className="py-2 text-center text-detalhe font-semibold text-foreground"
            >
              Total
            </TableCell>
            <TableCell className="py-2 text-right">
              <MoneyText
                valor={custo.total}
                className="text-detalhe font-semibold"
              />
            </TableCell>
            <TableCell className="py-2 text-right text-detalhe tabular-nums text-muted-foreground">
              {custo.centros.length > 0
                ? formatarPercentual(100)
                : formatarPercentual(0)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
