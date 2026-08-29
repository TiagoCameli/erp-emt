import Link from "next/link";

import { MoneyText } from "@/components/canonicos";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { dataHojeISO, formatarData } from "@/lib/formatadores";
import type { Creditos } from "../creditos";
import type { EmprestimosPorContrato } from "../queries";

interface CreditosTabelaProps {
  creditos: Creditos;
  /** Sem permissão de ver lançamentos, o contrato não vira link (daria 404). */
  podeVerLancamentos: boolean;
}

const CABECALHO = "h-9 px-3 text-detalhe font-medium text-muted-foreground";

/**
 * Um contrato por linha: quanto foi contratado, quanto já foi pago, quanto
 * ainda se deve, em quantas parcelas e quando vence a próxima.
 *
 * O clique leva ao LANÇAMENTO, e não a uma lista filtrada: cada contrato é um
 * documento só, com as parcelas dele. É lá que se paga, se anexa o contrato e
 * se vê o histórico.
 */
export function CreditosTabela({
  creditos,
  podeVerLancamentos,
}: CreditosTabelaProps) {
  const hoje = dataHojeISO();

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={`${CABECALHO} text-center`}>Credor</TableHead>
            <TableHead className={`${CABECALHO} text-center`}>
              Contrato
            </TableHead>
            <TableHead className={`${CABECALHO} text-right`}>
              Contratado
            </TableHead>
            <TableHead className={`${CABECALHO} text-right`}>Pago</TableHead>
            <TableHead className={`${CABECALHO} text-right`}>
              Saldo devedor
            </TableHead>
            <TableHead className={`${CABECALHO} text-right`}>
              Parcelas
            </TableHead>
            <TableHead className={`${CABECALHO} text-center`}>
              Próximo vencimento
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="[&_td]:px-3">
          {creditos.contratos.map((contrato) => {
            const quitado = contrato.proximoVencimento === null;
            const vencido =
              contrato.proximoVencimento !== null &&
              contrato.proximoVencimento < hoje;
            return (
              <TableRow key={contrato.lancamentoId}>
                <TableCell className="py-2 text-center text-detalhe text-foreground">
                  {podeVerLancamentos ? (
                    <Link
                      href={`/financeiro/lancamentos/${contrato.lancamentoId}`}
                      title={`Abrir o lançamento de ${contrato.credor}`}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {contrato.credor}
                    </Link>
                  ) : (
                    contrato.credor
                  )}
                </TableCell>
                <TableCell className="max-w-[22rem] py-2 text-left text-detalhe text-muted-foreground">
                  <span className="block truncate" title={contrato.descricao}>
                    {contrato.descricao}
                  </span>
                  <span className="text-legenda">{contrato.categoria}</span>
                </TableCell>
                <TableCell className="py-2 text-right">
                  <MoneyText
                    valor={contrato.valorContratado}
                    className="text-detalhe"
                  />
                </TableCell>
                <TableCell className="py-2 text-right">
                  <MoneyText
                    valor={contrato.totalPago}
                    className="text-detalhe"
                  />
                </TableCell>
                <TableCell className="py-2 text-right">
                  <MoneyText
                    valor={contrato.saldoDevedor}
                    className="text-detalhe font-medium"
                  />
                </TableCell>
                <TableCell className="py-2 text-right text-detalhe tabular-nums text-foreground">
                  {contrato.parcelasPagas} de {contrato.parcelas}
                </TableCell>
                <TableCell className="py-2 text-center text-detalhe">
                  {quitado ? (
                    <span className="text-muted-foreground">Quitado</span>
                  ) : (
                    <span
                      className={
                        vencido
                          ? "font-medium text-destructive"
                          : "text-foreground"
                      }
                      title={
                        vencido ? "Parcela vencida e ainda não paga" : undefined
                      }
                    >
                      {formatarData(contrato.proximoVencimento)}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
          <TableRow className="border-t-2 bg-surface hover:bg-surface">
            <TableCell
              colSpan={2}
              className="py-2 text-center text-detalhe font-semibold text-foreground"
            >
              Total
            </TableCell>
            <TableCell className="py-2 text-right">
              <MoneyText
                valor={creditos.totalContratado}
                className="text-detalhe font-semibold"
              />
            </TableCell>
            <TableCell className="py-2 text-right">
              <MoneyText
                valor={creditos.totalPago}
                className="text-detalhe font-semibold"
              />
            </TableCell>
            <TableCell className="py-2 text-right">
              <MoneyText
                valor={creditos.totalSaldo}
                className="text-detalhe font-semibold"
              />
            </TableCell>
            <TableCell colSpan={2} />
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * O que vence pela frente, mês a mês. Parcela vencida e não paga aparece no mês
 * CORRENTE, e não no mês em que venceu: para o caixa ela é compromisso de agora.
 */
export function CreditosPorMesTabela({
  meses,
  total,
}: {
  meses: Creditos["proximosMeses"];
  total: number;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={`${CABECALHO} text-center`}>Mês</TableHead>
            <TableHead className={`${CABECALHO} text-right`}>
              Parcelas
            </TableHead>
            <TableHead className={`${CABECALHO} text-right`}>
              A pagar no mês
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="[&_td]:px-3">
          {meses.map((mes) => (
            <TableRow key={mes.mes}>
              <TableCell className="py-2 text-center text-detalhe text-foreground">
                {mes.rotulo}
              </TableCell>
              <TableCell className="py-2 text-right text-detalhe tabular-nums text-muted-foreground">
                {mes.parcelas}
              </TableCell>
              <TableCell className="py-2 text-right">
                <MoneyText valor={mes.valor} className="text-detalhe" />
              </TableCell>
            </TableRow>
          ))}
          <TableRow className="border-t-2 bg-surface hover:bg-surface">
            <TableCell
              colSpan={2}
              className="py-2 text-center text-detalhe font-semibold text-foreground"
            >
              Total no período
            </TableCell>
            <TableCell className="py-2 text-right">
              <MoneyText valor={total} className="text-detalhe font-semibold" />
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Os contratos do centro de Empréstimos, um por etapa: quanto o banco liberou,
 * quanto já foi amortizado e o que falta.
 *
 * Morava dentro de `relatorios/page.tsx`, montada em `<table>` cru com `<tfoot>`
 * próprio, ao lado desta mesma tela que já fazia o mesmo trabalho com o `Table`
 * canônico. Tabela construída na página é o começo de um segundo jeito de
 * desenhar tabela no app, e este relatório já mostrava os dois lado a lado.
 *
 * `tomado` e `pago` NÃO se comparam ainda: parte das prestações antigas está nos
 * extratos e não foi lançada. As duas colunas ficam lado a lado justamente para
 * essa lacuna aparecer.
 */
export function ContratosEmprestimoTabela({
  contratos,
}: {
  contratos: EmprestimosPorContrato;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col" className={`${CABECALHO} text-center`}>
              Contrato
            </TableHead>
            <TableHead scope="col" className={`${CABECALHO} text-right`}>
              Tomado
            </TableHead>
            <TableHead scope="col" className={`${CABECALHO} text-right`}>
              Pago
            </TableHead>
            <TableHead scope="col" className={`${CABECALHO} text-right`}>
              A pagar
            </TableHead>
            <TableHead scope="col" className={`${CABECALHO} text-right`}>
              Parcelas
            </TableHead>
            <TableHead scope="col" className={`${CABECALHO} text-center`}>
              Próxima
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="[&_td]:px-3">
          {contratos.contratos.map((contrato) => (
            <TableRow key={contrato.centroCustoId}>
              <TableCell className="py-2 text-center text-detalhe text-foreground">
                {contrato.contrato}
              </TableCell>
              <TableCell className="py-2 text-right">
                <MoneyText valor={contrato.tomado} className="text-detalhe" />
              </TableCell>
              <TableCell className="py-2 text-right">
                <MoneyText valor={contrato.pago} className="text-detalhe" />
              </TableCell>
              <TableCell className="py-2 text-right">
                <MoneyText valor={contrato.aPagar} className="text-detalhe" />
              </TableCell>
              <TableCell className="py-2 text-right text-detalhe tabular-nums text-muted-foreground">
                {contrato.parcelas === 0
                  ? "—"
                  : `${contrato.parcelasPagas} de ${contrato.parcelas}`}
              </TableCell>
              <TableCell className="py-2 text-center text-detalhe tabular-nums text-foreground">
                {contrato.proximoVencimento
                  ? formatarData(contrato.proximoVencimento)
                  : "—"}
              </TableCell>
            </TableRow>
          ))}
          <TableRow className="border-t-2 bg-surface hover:bg-surface">
            <TableCell className="py-2 text-center text-detalhe font-semibold text-foreground">
              Total
            </TableCell>
            <TableCell className="py-2 text-right">
              <MoneyText
                valor={contratos.totalTomado}
                className="text-detalhe font-semibold"
              />
            </TableCell>
            <TableCell className="py-2 text-right">
              <MoneyText
                valor={contratos.totalPago}
                className="text-detalhe font-semibold"
              />
            </TableCell>
            <TableCell className="py-2 text-right">
              <MoneyText
                valor={contratos.totalAPagar}
                className="text-detalhe font-semibold"
              />
            </TableCell>
            <TableCell colSpan={2} />
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
