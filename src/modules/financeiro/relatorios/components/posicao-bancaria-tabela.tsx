import { MoneyText } from "@/components/canonicos";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ROTULO_BANCO, type BancoConta } from "@/modules/financeiro/_shared/formato";
import type { PosicaoBancaria } from "../queries";

interface PosicaoBancariaTabelaProps {
  posicao: PosicaoBancaria;
}

function rotuloBanco(banco: string): string {
  return ROTULO_BANCO[banco as BancoConta] ?? banco;
}

/**
 * Posição bancária em tabela: por conta, saldo inicial, entradas, saídas e
 * saldo atual, mais a linha de total. Detalha os KPICards de cada conta.
 */
export function PosicaoBancariaTabela({ posicao }: PosicaoBancariaTabelaProps) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-9 px-3 text-detalhe font-medium text-muted-foreground">
              Conta
            </TableHead>
            <TableHead className="h-9 px-3 text-detalhe font-medium text-muted-foreground">
              Banco
            </TableHead>
            <TableHead className="h-9 px-3 text-right text-detalhe font-medium text-muted-foreground">
              Saldo inicial
            </TableHead>
            <TableHead className="h-9 px-3 text-right text-detalhe font-medium text-muted-foreground">
              Entradas
            </TableHead>
            <TableHead className="h-9 px-3 text-right text-detalhe font-medium text-muted-foreground">
              Saídas
            </TableHead>
            <TableHead className="h-9 px-3 text-right text-detalhe font-medium text-muted-foreground">
              Saldo atual
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="[&_td]:px-3">
          {posicao.contas.map((conta) => (
            <TableRow key={conta.contaId}>
              <TableCell className="py-2 text-detalhe text-foreground">
                {conta.nome}
              </TableCell>
              <TableCell className="py-2 text-detalhe text-muted-foreground">
                {rotuloBanco(conta.banco)}
              </TableCell>
              <TableCell className="py-2 text-right">
                <MoneyText valor={conta.saldoInicial} className="text-detalhe" />
              </TableCell>
              <TableCell className="py-2 text-right">
                <MoneyText valor={conta.entradas} className="text-detalhe" />
              </TableCell>
              <TableCell className="py-2 text-right">
                <MoneyText valor={conta.saidas} className="text-detalhe" />
              </TableCell>
              <TableCell className="py-2 text-right">
                <MoneyText
                  valor={conta.saldoAtual}
                  className="text-detalhe font-medium"
                />
              </TableCell>
            </TableRow>
          ))}
          <TableRow className="border-t-2 bg-surface hover:bg-surface">
            <TableCell
              colSpan={2}
              className="py-2 text-detalhe font-semibold text-foreground"
            >
              Total
            </TableCell>
            <TableCell className="py-2 text-right">
              <MoneyText
                valor={posicao.totalSaldoInicial}
                className="text-detalhe font-semibold"
              />
            </TableCell>
            <TableCell className="py-2 text-right">
              <MoneyText
                valor={posicao.totalEntradas}
                className="text-detalhe font-semibold"
              />
            </TableCell>
            <TableCell className="py-2 text-right">
              <MoneyText
                valor={posicao.totalSaidas}
                className="text-detalhe font-semibold"
              />
            </TableCell>
            <TableCell className="py-2 text-right">
              <MoneyText
                valor={posicao.totalSaldoAtual}
                className="text-detalhe font-semibold"
              />
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
