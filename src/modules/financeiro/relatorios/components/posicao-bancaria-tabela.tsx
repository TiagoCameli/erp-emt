import { MoneyText } from "@/components/canonicos";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ROTULO_BANCO,
  type BancoConta,
} from "@/modules/financeiro/_shared/formato";
import { formatarData } from "@/lib/formatadores";
import { drillContaBancaria } from "@/modules/financeiro/relatorios/drill";
import { LinkDrill } from "@/modules/financeiro/relatorios/components/link-drill";
import type { PosicaoBancaria } from "../queries";

interface PosicaoBancariaTabelaProps {
  posicao: PosicaoBancaria;
  /** Sem permissão de ver lançamentos, a conta não vira link (daria 404). */
  podeVerLancamentos: boolean;
}

function rotuloBanco(banco: string): string {
  return ROTULO_BANCO[banco as BancoConta] ?? banco;
}

/**
 * Posição bancária em tabela: por conta, saldo inicial, entradas, saídas e
 * saldo atual, mais a linha de total. Detalha os KPICards de cada conta.
 */
export function PosicaoBancariaTabela({
  posicao,
  podeVerLancamentos,
}: PosicaoBancariaTabelaProps) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {/* Centralizado é o padrão de tabela do app (ver DataTable); só
                dinheiro, quantidade, total, percentual e horas vão à direita. */}
            <TableHead className="h-9 px-3 text-center text-detalhe font-medium text-muted-foreground">
              Conta
            </TableHead>
            <TableHead className="h-9 px-3 text-center text-detalhe font-medium text-muted-foreground">
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
              <TableCell className="py-2 text-center text-detalhe text-foreground">
                {/* O clique abre as parcelas PAGAS por esta conta, que é o que a
                    posição soma (pelo líquido). Sem o recorte a lista traria
                    também o que ainda não passou por ela. */}
                {podeVerLancamentos ? (
                  <LinkDrill
                    href={drillContaBancaria({
                      contaId: conta.contaId,
                      tipo: "a_pagar",
                    })}
                    titulo={`Ver os pagamentos feitos por ${conta.nome}`}
                  >
                    {conta.nome}
                  </LinkDrill>
                ) : (
                  conta.nome
                )}
              </TableCell>
              <TableCell className="py-2 text-center text-detalhe text-muted-foreground">
                {rotuloBanco(conta.banco)}
              </TableCell>
              <TableCell className="py-2 text-right">
                <div className="flex flex-col items-end gap-0.5">
                  <MoneyText
                    valor={conta.saldoInicial}
                    className="text-detalhe"
                  />
                  {/* Com data de corte, "Saldo inicial" não é a abertura da conta
                      e as colunas ao lado não são o histórico todo: as três
                      falam de um período. Certo na aritmética e mudo sobre o
                      recorte seria a mesma armadilha do plug antigo, que também
                      era um número sem data. */}
                  {conta.saldoInicialData ? (
                    <span
                      className="text-legenda text-muted-foreground"
                      title={`Saldo lido do extrato de ${formatarData(conta.saldoInicialData)}. As colunas ao lado somam só o movimento posterior a essa data.`}
                    >
                      em {formatarData(conta.saldoInicialData)}
                    </span>
                  ) : null}
                </div>
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
              className="py-2 text-center text-detalhe font-semibold text-foreground"
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
