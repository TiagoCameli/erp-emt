import { MoneyText } from "@/components/canonicos";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { drillAging } from "@/modules/financeiro/relatorios/drill";
import { LinkDrill } from "@/modules/financeiro/relatorios/components/link-drill";
import type { Aging } from "../queries";

interface AgingTabelaProps {
  aging: Aging;
  /** Sem permissão de ver lançamentos, o valor não vira link (daria 404). */
  podeVerLancamentos: boolean;
}

/**
 * Aging em tabela: uma linha por faixa, colunas a pagar e a receber.
 *
 * O link fica no VALOR, e não na faixa, porque a faixa é a mesma nas duas colunas
 * e o que se clica é "esses R$ X a pagar vencidos 8 a 15 dias" — a coluna faz
 * parte da identidade do que abre.
 */
export function AgingTabela({ aging, podeVerLancamentos }: AgingTabelaProps) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {/* Centralizado é o padrão de tabela do app (ver DataTable); só
                dinheiro, quantidade, total, percentual e horas vão à direita. */}
            <TableHead className="h-9 px-3 text-center text-detalhe font-medium text-muted-foreground">
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
              <TableCell className="py-2 text-center text-detalhe text-foreground">
                {faixa.rotulo}
              </TableCell>
              <TableCell className="py-2 text-right">
                {/* Faixa zerada não vira link: abriria uma lista vazia, o que é
                    um clique que não leva a nada. */}
                {faixa.valor > 0 && podeVerLancamentos ? (
                  <LinkDrill
                    href={drillAging({ faixa: faixa.faixa, tipo: "a_pagar" })}
                    titulo={`Ver as parcelas a pagar ${faixa.rotulo.toLowerCase()}`}
                  >
                    <MoneyText valor={faixa.valor} className="text-detalhe" />
                  </LinkDrill>
                ) : (
                  <MoneyText valor={faixa.valor} className="text-detalhe" />
                )}
              </TableCell>
              <TableCell className="py-2 text-right">
                {(aging.aReceber[indice]?.valor ?? 0) > 0 &&
                podeVerLancamentos ? (
                  <LinkDrill
                    href={drillAging({ faixa: faixa.faixa, tipo: "a_receber" })}
                    titulo={`Ver as parcelas a receber ${faixa.rotulo.toLowerCase()}`}
                  >
                    <MoneyText
                      valor={aging.aReceber[indice]?.valor ?? 0}
                      className="text-detalhe"
                    />
                  </LinkDrill>
                ) : (
                  <MoneyText
                    valor={aging.aReceber[indice]?.valor ?? 0}
                    className="text-detalhe"
                  />
                )}
              </TableCell>
            </TableRow>
          ))}
          <TableRow className="border-t-2 bg-surface hover:bg-surface">
            <TableCell className="py-2 text-center text-detalhe font-semibold text-foreground">
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
