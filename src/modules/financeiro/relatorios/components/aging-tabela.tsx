import { MoneyText } from "@/components/canonicos";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Aging } from "../queries";

interface AgingTabelaProps {
  aging: Aging;
}

/** Aging em tabela: uma linha por faixa, colunas a pagar e a receber. */
export function AgingTabela({ aging }: AgingTabelaProps) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-9 px-3 text-detalhe font-medium text-muted-foreground">
              Faixa de vencimento
            </TableHead>
            <TableHead className="h-9 px-3 text-right text-detalhe font-medium text-muted-foreground">
              A pagar
            </TableHead>
            <TableHead className="h-9 px-3 text-right text-detalhe font-medium text-muted-foreground">
              A receber
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="[&_td]:px-3">
          {aging.aPagar.map((faixa, indice) => (
            <TableRow key={faixa.faixa}>
              <TableCell className="py-2 text-detalhe text-foreground">
                {faixa.rotulo}
              </TableCell>
              <TableCell className="py-2 text-right">
                <MoneyText valor={faixa.valor} className="text-detalhe" />
              </TableCell>
              <TableCell className="py-2 text-right">
                <MoneyText
                  valor={aging.aReceber[indice]?.valor ?? 0}
                  className="text-detalhe"
                />
              </TableCell>
            </TableRow>
          ))}
          <TableRow className="border-t-2 bg-surface hover:bg-surface">
            <TableCell className="py-2 text-detalhe font-semibold text-foreground">
              Total
            </TableCell>
            <TableCell className="py-2 text-right">
              <MoneyText
                valor={aging.totalAPagar}
                className="text-detalhe font-semibold"
              />
            </TableCell>
            <TableCell className="py-2 text-right">
              <MoneyText
                valor={aging.totalAReceber}
                className="text-detalhe font-semibold"
              />
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
