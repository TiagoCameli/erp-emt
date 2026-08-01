import Link from "next/link";

import { CelulaVazia, MoneyText } from "@/components/canonicos";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatarData, formatarMesAno } from "@/lib/formatadores";
import type { MaiorCusto } from "../queries";

/**
 * Os maiores lançamentos a pagar do período. Tabela crua de leitura, não a
 * DataTable: não tem filtro, ordenação nem coluna configurável, é um recorte
 * fixo com link para o lançamento. Quem quer a lista inteira abre o Financeiro.
 */
export function MaioresCustosTabela({ custos }: { custos: MaiorCusto[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-9 px-3 text-detalhe font-medium text-muted-foreground">
              Documento
            </TableHead>
            <TableHead className="h-9 px-3 text-detalhe font-medium text-muted-foreground">
              Descrição
            </TableHead>
            <TableHead className="h-9 px-3 text-detalhe font-medium text-muted-foreground">
              Fornecedor
            </TableHead>
            <TableHead className="h-9 px-3 text-detalhe font-medium text-muted-foreground">
              Competência
            </TableHead>
            <TableHead className="h-9 px-3 text-detalhe font-medium text-muted-foreground">
              Vencimento
            </TableHead>
            <TableHead className="h-9 px-3 text-right text-detalhe font-medium text-muted-foreground">
              Valor
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="[&_td]:px-3">
          {custos.map((custo) => (
            <TableRow key={custo.id}>
              <TableCell className="codigo-doc py-2 text-detalhe text-muted-foreground">
                <Link
                  href={`/financeiro/lancamentos/${custo.id}`}
                  className="hover:text-foreground hover:underline"
                >
                  {custo.numero ?? <CelulaVazia />}
                </Link>
              </TableCell>
              <TableCell className="max-w-72 truncate py-2 text-detalhe text-foreground">
                {custo.descricao}
              </TableCell>
              <TableCell className="max-w-56 truncate py-2 text-detalhe text-muted-foreground">
                {custo.fornecedor ?? <CelulaVazia />}
              </TableCell>
              <TableCell className="py-2 text-detalhe tabular-nums text-muted-foreground">
                {formatarMesAno(custo.mesCompetencia)}
              </TableCell>
              <TableCell className="py-2 text-detalhe tabular-nums text-muted-foreground">
                {custo.dataVencimento ? (
                  formatarData(custo.dataVencimento)
                ) : (
                  <CelulaVazia />
                )}
              </TableCell>
              <TableCell className="py-2 text-right">
                <MoneyText valor={custo.valor} className="text-detalhe" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
