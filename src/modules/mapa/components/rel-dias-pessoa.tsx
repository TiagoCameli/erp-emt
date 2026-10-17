"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Download } from "lucide-react";

import { EmptyState } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { baixarBase64 } from "@/lib/download";
import { mesSeguinte } from "@/lib/formatadores";
import { gerarPlanilhaDiasPessoa } from "@/modules/mapa/actions";
import { mesAnteriorDe, rotuloMes } from "@/modules/mapa/centros";
import type { RelDiasPessoa } from "@/modules/mapa/centros-pessoa";

/**
 * Tabela do relatório "Dias de pessoa por centro": pessoa nas linhas, centro nas colunas (por
 * total, o maior primeiro), dias trabalhados, parados e total, e a linha de totais. O mês vive
 * na URL, então a navegação é por link e a página relê no servidor.
 */

const href = (mes: string) => `/mapa/dias-de-pessoa?mes=${mes}`;

export function RelDiasPessoaTabela({
  relatorio: rel,
  mes,
  mesHoje,
}: {
  relatorio: RelDiasPessoa;
  mes: string;
  mesHoje: string;
}) {
  const [exportando, setExportando] = React.useState(false);
  const proximo = mesSeguinte(mes);

  async function exportar() {
    setExportando(true);
    const r = await gerarPlanilhaDiasPessoa(mes);
    setExportando(false);
    if ("erro" in r) {
      toast.error(r.erro);
      return;
    }
    baixarBase64(r.base64, r.nomeArquivo);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button asChild size="icon-sm" variant="outline" aria-label="Mês anterior">
            <Link href={href(mesAnteriorDe(mes))}>
              <ChevronLeft />
            </Link>
          </Button>
          <span className="min-w-36 text-center text-corpo font-medium capitalize">
            {rotuloMes(mes)}
          </span>
          {proximo && proximo <= mesHoje ? (
            <Button asChild size="icon-sm" variant="outline" aria-label="Mês seguinte">
              <Link href={href(proximo)}>
                <ChevronRight />
              </Link>
            </Button>
          ) : (
            <Button size="icon-sm" variant="outline" disabled aria-label="Mês seguinte">
              <ChevronRight />
            </Button>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={exportar}
          disabled={exportando || rel.pessoas.length === 0}
        >
          <Download />
          {exportando ? "Gerando…" : "Exportar Excel"}
        </Button>
      </div>

      {rel.pessoas.length === 0 ? (
        <EmptyState
          icone={CalendarDays}
          titulo="Nenhum dia registrado neste mês"
          descricao="Os dias começam a contar quando o registro entra no ar; o fechamento é às 23:55 de Rio Branco."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-10 bg-background">Pessoa</TableHead>
                {rel.centros.map((c) => (
                  <TableHead key={c.id} className="max-w-48 text-right whitespace-normal">
                    {c.nome}
                  </TableHead>
                ))}
                <TableHead className="text-right">Trabalhados</TableHead>
                <TableHead className="text-right">Parados</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rel.pessoas.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="sticky left-0 z-10 bg-background">
                    <span className="block max-w-64 truncate">{p.nome}</span>
                    {p.funcao ? (
                      <span className="block max-w-64 truncate text-legenda text-muted-foreground">
                        {p.funcao}
                      </span>
                    ) : null}
                  </TableCell>
                  {rel.centros.map((c) => (
                    <TableCell key={c.id} className="text-right tabular-nums">
                      {p.dias[c.id] ?? <span className="text-muted-foreground">–</span>}
                    </TableCell>
                  ))}
                  <TableCell className="text-right tabular-nums">{p.trabalhados}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.parados}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{p.total}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="sticky left-0 z-10 bg-muted">Total</TableCell>
                {rel.centros.map((c) => (
                  <TableCell key={c.id} className="text-right tabular-nums">
                    {c.total}
                  </TableCell>
                ))}
                <TableCell className="text-right tabular-nums">{rel.trabalhados}</TableCell>
                <TableCell className="text-right tabular-nums">{rel.parados}</TableCell>
                <TableCell className="text-right tabular-nums">{rel.total}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </div>
  );
}
