"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";

import { MoneyText } from "@/components/canonicos";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatarData, formatarPercentual } from "@/lib/formatadores";
import { SeloContrato, SeloCota } from "@/modules/financeiro/dividas/components/selos";
import {
  somar,
  type ConsorcioRelatorio,
  type ContratoRelatorio,
} from "@/modules/financeiro/dividas/relatorio";

const CABECALHO = "h-9 px-3 text-detalhe font-medium text-muted-foreground";

/** "2,0000% a.m. · 26,82% a.a.", ou traço sem cronograma. */
export function textoCet(contrato: ContratoRelatorio): string {
  if (!contrato.cet) return "—";
  return `${formatarPercentual(contrato.cet.mensal * 100, 4)} a.m. · ${formatarPercentual(contrato.cet.anual * 100, 2)} a.a.`;
}

/**
 * Os contratos de dívida pelo cronograma (Financeiro > Dívidas): o liberado,
 * o principal pago e o que falta (saldo devedor de PRINCIPAL, o que o banco
 * cobraria para quitar), os juros pagos e a pagar e o CET. A seta abre as
 * próximas 12 parcelas.
 *
 * É a leitura que a tabela de prestações acima não dá: lá a prestação vem
 * inteira, com o juro futuro dentro. Contrato sem cronograma mostra o liberado
 * como saldo e traço no CET, com o aviso na linha.
 */
export function DividasContratosTabela({
  contratos,
  podeVerDividas,
}: {
  contratos: ContratoRelatorio[];
  /** Sem a permissão de Dívidas, o credor não vira link (daria 404). */
  podeVerDividas: boolean;
}) {
  const [abertos, setAbertos] = React.useState<ReadonlySet<string>>(new Set());

  function alternar(id: string) {
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col" className={`${CABECALHO} w-8`} />
            <TableHead scope="col" className={`${CABECALHO} text-left`}>Contrato</TableHead>
            <TableHead scope="col" className={`${CABECALHO} text-center`}>Status</TableHead>
            <TableHead scope="col" className={`${CABECALHO} text-right`}>Liberado</TableHead>
            <TableHead scope="col" className={`${CABECALHO} text-right`}>Principal pago</TableHead>
            <TableHead scope="col" className={`${CABECALHO} text-right`}>Saldo devedor</TableHead>
            <TableHead scope="col" className={`${CABECALHO} text-right`}>Juros pagos</TableHead>
            <TableHead scope="col" className={`${CABECALHO} text-right`}>Juros a pagar</TableHead>
            <TableHead scope="col" className={`${CABECALHO} text-right`}>CET</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="[&_td]:px-3">
          {contratos.map((c) => {
            const aberto = abertos.has(c.contratoId);
            return (
              <React.Fragment key={c.contratoId}>
                <TableRow>
                  <TableCell className="py-2">
                    {c.proximas.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => alternar(c.contratoId)}
                        aria-expanded={aberto}
                        aria-label={`${aberto ? "Fechar" : "Abrir"} as próximas parcelas de ${c.credor} ${c.numero}`}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {aberto ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      </button>
                    ) : null}
                  </TableCell>
                  <TableCell className="py-2 text-left text-detalhe">
                    {podeVerDividas ? (
                      <Link
                        href={`/financeiro/dividas/contratos/${c.contratoId}`}
                        className="text-primary underline-offset-2 hover:underline"
                      >
                        {c.credor}
                      </Link>
                    ) : (
                      <span className="text-foreground">{c.credor}</span>
                    )}
                    <span className="block text-legenda text-muted-foreground">
                      {c.numero}
                      {c.temCronograma ? "" : " · sem cronograma"}
                    </span>
                  </TableCell>
                  <TableCell className="py-2 text-center">
                    <SeloContrato status={c.status} />
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <MoneyText valor={c.valorLiberado} className="text-detalhe" />
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <MoneyText valor={c.principalPago} className="text-detalhe" />
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <MoneyText valor={c.saldoDevedor} className="text-detalhe font-medium" />
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <MoneyText valor={c.jurosPagos} className="text-detalhe" />
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <MoneyText valor={c.jurosAPagar} className="text-detalhe" />
                  </TableCell>
                  <TableCell className="py-2 text-right text-detalhe tabular-nums text-foreground">
                    {textoCet(c)}
                  </TableCell>
                </TableRow>
                {aberto ? (
                  <TableRow className="bg-surface hover:bg-surface">
                    <TableCell />
                    <TableCell colSpan={8} className="py-2">
                      <ProximasParcelas contrato={c} />
                    </TableCell>
                  </TableRow>
                ) : null}
              </React.Fragment>
            );
          })}
          <TableRow className="border-t-2 bg-surface hover:bg-surface">
            <TableCell />
            <TableCell colSpan={2} className="py-2 text-left text-detalhe font-semibold text-foreground">
              Total
            </TableCell>
            {[
              somar(contratos, (c) => c.valorLiberado),
              somar(contratos, (c) => c.principalPago),
              somar(contratos, (c) => c.saldoDevedor),
              somar(contratos, (c) => c.jurosPagos),
              somar(contratos, (c) => c.jurosAPagar),
            ].map((valor, i) => (
              <TableCell key={i} className="py-2 text-right">
                <MoneyText valor={valor} className="text-detalhe font-semibold" />
              </TableCell>
            ))}
            <TableCell />
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

function ProximasParcelas({ contrato }: { contrato: ContratoRelatorio }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-legenda text-muted-foreground">
        Próximas {contrato.proximas.length} parcelas (as atrasadas e não pagas entram primeiro)
      </p>
      <table className="w-full max-w-3xl text-legenda">
        <thead>
          <tr className="text-muted-foreground">
            <th className="px-2 py-1 text-right font-medium">Nº</th>
            <th className="px-2 py-1 text-center font-medium">Vencimento</th>
            <th className="px-2 py-1 text-right font-medium">Principal</th>
            <th className="px-2 py-1 text-right font-medium">Juros</th>
            <th className="px-2 py-1 text-right font-medium">Encargos</th>
            <th className="px-2 py-1 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {contrato.proximas.map((p, i) => (
            <tr key={`${p.vencimento}-${i}`}>
              <td className="px-2 py-0.5 text-right tabular-nums">{p.numero ?? "—"}</td>
              <td className="px-2 py-0.5 text-center tabular-nums">{formatarData(p.vencimento)}</td>
              <td className="px-2 py-0.5 text-right">
                <MoneyText valor={p.principal} />
              </td>
              <td className="px-2 py-0.5 text-right">
                <MoneyText valor={p.juros} />
              </td>
              <td className="px-2 py-0.5 text-right">
                <MoneyText valor={p.encargos} />
              </td>
              <td className="px-2 py-0.5 text-right font-medium">
                <MoneyText valor={p.total} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * As cotas de consórcio: quanto do fundo comum e da taxa já foi pago, o que
 * falta e, depois da contemplação, a dívida (o que falta pagar de uma cota
 * contemplada é dívida, D9) e a carta.
 */
export function ConsorciosCreditosTabela({
  cotas,
  podeVerDividas,
}: {
  cotas: ConsorcioRelatorio[];
  podeVerDividas: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col" className={`${CABECALHO} text-left`}>Cota</TableHead>
            <TableHead scope="col" className={`${CABECALHO} text-center`}>Status</TableHead>
            <TableHead scope="col" className={`${CABECALHO} text-right`}>Pagas</TableHead>
            <TableHead scope="col" className={`${CABECALHO} text-right`}>Fundo comum pago</TableHead>
            <TableHead scope="col" className={`${CABECALHO} text-right`}>Taxa paga</TableHead>
            <TableHead scope="col" className={`${CABECALHO} text-right`}>A pagar</TableHead>
            <TableHead scope="col" className={`${CABECALHO} text-right`}>Dívida</TableHead>
            <TableHead scope="col" className={`${CABECALHO} text-right`}>Carta</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="[&_td]:px-3">
          {cotas.map((q) => (
            <TableRow key={q.cotaId}>
              <TableCell className="py-2 text-left text-detalhe">
                {podeVerDividas ? (
                  <Link
                    href={`/financeiro/dividas/consorcios/${q.cotaId}`}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    {q.administradora}
                  </Link>
                ) : (
                  <span className="text-foreground">{q.administradora}</span>
                )}
                <span className="block text-legenda text-muted-foreground">
                  Grupo {q.grupo} · cota {q.cota} · {q.bem}
                </span>
              </TableCell>
              <TableCell className="py-2 text-center">
                <SeloCota status={q.status} />
              </TableCell>
              <TableCell className="py-2 text-right text-detalhe tabular-nums text-foreground">
                {q.parcelasPagas} de {q.prazo}
              </TableCell>
              <TableCell className="py-2 text-right">
                <MoneyText valor={q.fundoComumPago} className="text-detalhe" />
              </TableCell>
              <TableCell className="py-2 text-right">
                <MoneyText valor={q.taxaPaga} className="text-detalhe" />
              </TableCell>
              <TableCell className="py-2 text-right">
                <MoneyText valor={q.aPagar} className="text-detalhe" />
              </TableCell>
              <TableCell className="py-2 text-right">
                <MoneyText valor={q.divida} className="text-detalhe font-medium" />
              </TableCell>
              <TableCell className="py-2 text-right">
                {q.valorCarta === null ? (
                  <span className="text-detalhe text-muted-foreground">—</span>
                ) : (
                  <MoneyText valor={q.valorCarta} className="text-detalhe" />
                )}
              </TableCell>
            </TableRow>
          ))}
          <TableRow className="border-t-2 bg-surface hover:bg-surface">
            <TableCell colSpan={3} className="py-2 text-left text-detalhe font-semibold text-foreground">
              Total
            </TableCell>
            {[
              somar(cotas, (q) => q.fundoComumPago),
              somar(cotas, (q) => q.taxaPaga),
              somar(cotas, (q) => q.aPagar),
              somar(cotas, (q) => q.divida),
            ].map((valor, i) => (
              <TableCell key={i} className="py-2 text-right">
                <MoneyText valor={valor} className="text-detalhe font-semibold" />
              </TableCell>
            ))}
            <TableCell />
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
