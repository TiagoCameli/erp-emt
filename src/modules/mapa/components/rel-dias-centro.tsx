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
import { gerarPlanilhaDiasCentro } from "@/modules/mapa/actions";
import {
  mesAnteriorDe,
  rotuloMes,
  type RelDiasCentro,
} from "@/modules/mapa/centros";
import { ROTULO_PROPRIEDADE, type Propriedade } from "@/modules/mapa/tipos";

/**
 * Tabela do relatório "Dias por centro de custo": máquina nas linhas, centro nas colunas (por
 * total, o maior primeiro), total da máquina e linha de totais. Mês e propriedade vivem na URL,
 * então a navegação é por link e a página relê no servidor.
 */

const FILTROS: { valor: string; rotulo: string }[] = [
  { valor: "", rotulo: "Todas" },
  { valor: "propria", rotulo: "Própria" },
  { valor: "colorado", rotulo: "Colorado" },
  { valor: "alugada", rotulo: "Alugada" },
];

function href(mes: string, propriedade: string): string {
  const p = new URLSearchParams({ mes });
  if (propriedade) p.set("propriedade", propriedade);
  return `/mapa/dias-por-centro?${p.toString()}`;
}

export function RelDiasCentroTabela({
  relatorio: rel,
  mes,
  mesHoje,
  propriedade,
}: {
  relatorio: RelDiasCentro;
  mes: string;
  mesHoje: string;
  propriedade: string;
}) {
  const [exportando, setExportando] = React.useState(false);
  const proximo = mesSeguinte(mes);

  async function exportar() {
    setExportando(true);
    const r = await gerarPlanilhaDiasCentro(mes, propriedade);
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
            <Link href={href(mesAnteriorDe(mes), propriedade)}>
              <ChevronLeft />
            </Link>
          </Button>
          <span className="min-w-36 text-center text-corpo font-medium capitalize">
            {rotuloMes(mes)}
          </span>
          {proximo && proximo <= mesHoje ? (
            <Button asChild size="icon-sm" variant="outline" aria-label="Mês seguinte">
              <Link href={href(proximo, propriedade)}>
                <ChevronRight />
              </Link>
            </Button>
          ) : (
            <Button size="icon-sm" variant="outline" disabled aria-label="Mês seguinte">
              <ChevronRight />
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Propriedade">
          {FILTROS.map((f) => (
            <Button
              key={f.valor || "todas"}
              asChild
              size="sm"
              variant={f.valor === propriedade ? "secondary" : "ghost"}
            >
              <Link href={href(mes, f.valor)} aria-current={f.valor === propriedade ? "page" : undefined}>
                {f.rotulo}
              </Link>
            </Button>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={exportar}
          disabled={exportando || rel.equipamentos.length === 0}
        >
          <Download />
          {exportando ? "Gerando…" : "Exportar Excel"}
        </Button>
      </div>

      {rel.equipamentos.length === 0 ? (
        <EmptyState
          icone={CalendarDays}
          titulo="Nenhum dia registrado neste mês"
          descricao="Os dias começam a contar quando a máquina entra no mapa; o fechamento é às 23:59 de Rio Branco."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-10 bg-background">Máquina</TableHead>
                <TableHead>Propriedade</TableHead>
                {rel.centros.map((c) => (
                  <TableHead key={c.id} className="max-w-48 text-right whitespace-normal">
                    {c.nome}
                  </TableHead>
                ))}
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rel.equipamentos.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="sticky left-0 z-10 bg-background">
                    <span className="font-mono">{e.codigo}</span>
                    <span className="block max-w-56 truncate text-legenda text-muted-foreground">
                      {e.descricao}
                    </span>
                  </TableCell>
                  <TableCell>
                    {ROTULO_PROPRIEDADE[e.propriedade as Propriedade] ?? e.propriedade}
                  </TableCell>
                  {rel.centros.map((c) => (
                    <TableCell key={c.id} className="text-right tabular-nums">
                      {e.dias[c.id] ?? <span className="text-muted-foreground">–</span>}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-medium tabular-nums">{e.total}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="sticky left-0 z-10 bg-muted">Total</TableCell>
                <TableCell />
                {rel.centros.map((c) => (
                  <TableCell key={c.id} className="text-right tabular-nums">
                    {c.total}
                  </TableCell>
                ))}
                <TableCell className="text-right tabular-nums">{rel.total}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </div>
  );
}
