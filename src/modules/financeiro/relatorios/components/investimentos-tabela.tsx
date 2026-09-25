import { MoneyText } from "@/components/canonicos";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatarData, formatarMesAno } from "@/lib/formatadores";
import type { Investimentos } from "@/modules/financeiro/relatorios/investimentos";

const CABECALHO = "h-9 px-3 text-detalhe font-medium text-muted-foreground";

function Cabecalho({
  direita,
  children,
}: {
  direita?: boolean;
  children: React.ReactNode;
}) {
  // Centralizado é o padrão de tabela do app; só dinheiro vai à direita.
  return (
    <TableHead className={`${CABECALHO} ${direita ? "text-right" : "text-center"}`}>
      {children}
    </TableHead>
  );
}

/** Posição por aplicação: o saldo do CDB, do fundo, de cada coisa aplicada. */
export function AplicacoesTabela({ dados }: { dados: Investimentos }) {
  const total = dados.aplicacoes.reduce(
    (soma, a) => ({
      aplicado: soma.aplicado + Math.round(a.aplicado * 100),
      resgatado: soma.resgatado + Math.round(a.resgatado * 100),
      posicao: soma.posicao + Math.round(a.posicao * 100),
      aplicadoPeriodo: soma.aplicadoPeriodo + Math.round(a.aplicadoPeriodo * 100),
      resgatadoPeriodo: soma.resgatadoPeriodo + Math.round(a.resgatadoPeriodo * 100),
    }),
    { aplicado: 0, resgatado: 0, posicao: 0, aplicadoPeriodo: 0, resgatadoPeriodo: 0 },
  );

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <Cabecalho>Aplicação</Cabecalho>
            <Cabecalho>Conta</Cabecalho>
            <Cabecalho direita>Aplicado no período</Cabecalho>
            <Cabecalho direita>Resgatado no período</Cabecalho>
            <Cabecalho direita>Aplicado (total)</Cabecalho>
            <Cabecalho direita>Resgatado (total)</Cabecalho>
            <Cabecalho direita>Saldo aplicado</Cabecalho>
          </TableRow>
        </TableHeader>
        <TableBody className="[&_td]:px-3">
          {dados.aplicacoes.map((a) => (
            <TableRow key={a.aplicacaoId}>
              <TableCell className="py-2 text-center text-detalhe font-medium text-foreground">
                {a.nome}
              </TableCell>
              <TableCell className="py-2 text-center text-detalhe text-muted-foreground">
                {a.conta}
              </TableCell>
              <TableCell className="py-2 text-right">
                <MoneyText valor={a.aplicadoPeriodo} className="text-detalhe" />
              </TableCell>
              <TableCell className="py-2 text-right">
                <MoneyText valor={a.resgatadoPeriodo} className="text-detalhe" />
              </TableCell>
              <TableCell className="py-2 text-right">
                <MoneyText valor={a.aplicado} className="text-detalhe" />
              </TableCell>
              <TableCell className="py-2 text-right">
                <MoneyText valor={a.resgatado} className="text-detalhe" />
              </TableCell>
              <TableCell className="py-2 text-right">
                <MoneyText valor={a.posicao} className="text-detalhe font-medium" />
              </TableCell>
            </TableRow>
          ))}
          <TableRow className="border-t-2 bg-surface hover:bg-surface">
            <TableCell colSpan={2} className="py-2 text-center text-detalhe font-semibold text-foreground">
              Total
            </TableCell>
            <TableCell className="py-2 text-right">
              <MoneyText valor={total.aplicadoPeriodo / 100} className="text-detalhe font-semibold" />
            </TableCell>
            <TableCell className="py-2 text-right">
              <MoneyText valor={total.resgatadoPeriodo / 100} className="text-detalhe font-semibold" />
            </TableCell>
            <TableCell className="py-2 text-right">
              <MoneyText valor={total.aplicado / 100} className="text-detalhe font-semibold" />
            </TableCell>
            <TableCell className="py-2 text-right">
              <MoneyText valor={total.resgatado / 100} className="text-detalhe font-semibold" />
            </TableCell>
            <TableCell className="py-2 text-right">
              <MoneyText valor={total.posicao / 100} className="text-detalhe font-semibold" />
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

/** Mês a mês: quanto entrou, quanto saiu e onde a posição fechou. */
export function InvestimentosPorMesTabela({ dados }: { dados: Investimentos }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <Cabecalho>Mês</Cabecalho>
            <Cabecalho direita>Aplicado</Cabecalho>
            <Cabecalho direita>Resgatado</Cabecalho>
            <Cabecalho direita>Líquido do mês</Cabecalho>
            <Cabecalho direita>Posição no fim do mês</Cabecalho>
          </TableRow>
        </TableHeader>
        <TableBody className="[&_td]:px-3">
          {dados.meses.map((m) => (
            <TableRow key={m.mes}>
              <TableCell className="py-2 text-center text-detalhe text-foreground">
                {formatarMesAno(`${m.mes}-01`)}
              </TableCell>
              <TableCell className="py-2 text-right">
                <MoneyText valor={m.aplicado} className="text-detalhe" />
              </TableCell>
              <TableCell className="py-2 text-right">
                <MoneyText valor={m.resgatado} className="text-detalhe" />
              </TableCell>
              <TableCell className="py-2 text-right">
                <MoneyText
                  valor={(Math.round(m.aplicado * 100) - Math.round(m.resgatado * 100)) / 100}
                  className="text-detalhe"
                />
              </TableCell>
              <TableCell className="py-2 text-right">
                <MoneyText valor={m.posicaoFinal} className="text-detalhe font-medium" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** As aplicações e resgates do período, um por linha, do mais recente. */
export function MovimentosInvestimentoTabela({ dados }: { dados: Investimentos }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <Cabecalho>Data</Cabecalho>
            <Cabecalho>Documento</Cabecalho>
            <Cabecalho>Movimento</Cabecalho>
            <Cabecalho>Aplicação</Cabecalho>
            <Cabecalho>Descrição</Cabecalho>
            <Cabecalho direita>Valor</Cabecalho>
          </TableRow>
        </TableHeader>
        <TableBody className="[&_td]:px-3">
          {dados.movimentos.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="py-2 text-center text-detalhe tabular-nums">
                {formatarData(m.data)}
              </TableCell>
              <TableCell className="py-2 text-center text-detalhe">
                <span className="codigo-doc">{m.numero}</span>
              </TableCell>
              <TableCell className="py-2 text-center text-detalhe">
                {m.sentido === "aplicacao" ? "Aplicação" : "Resgate"}
              </TableCell>
              <TableCell className="py-2 text-center text-detalhe text-muted-foreground">
                {m.aplicacaoNome}
              </TableCell>
              <TableCell className="py-2 text-center text-detalhe text-muted-foreground">
                {m.descricao ?? "-"}
              </TableCell>
              <TableCell className="py-2 text-right">
                <MoneyText
                  valor={m.sentido === "aplicacao" ? m.valor : -m.valor}
                  className="text-detalhe"
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
