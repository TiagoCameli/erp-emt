"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { KPICard, StatusBadge } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatarBRL, formatarPercentual, formatarQuantidade } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import type {
  OrcamentoCabecalho,
  OrcamentoItem,
} from "@/modules/cadastros/orcamentos/queries";
import {
  STATUS_ORCAMENTO_CONFIG,
  type TipoItemOrcamento,
} from "@/modules/cadastros/orcamentos/schemas";

export interface OrcamentoArvoreProps {
  cabecalho: OrcamentoCabecalho;
  itens: OrcamentoItem[];
}

/** Recuo da primeira coluna por tipo de linha (etapa > subetapa > item). */
const RECUO_POR_TIPO: Record<TipoItemOrcamento, string> = {
  etapa: "pl-3",
  subetapa: "pl-8",
  item: "pl-12",
};

/** Ênfase do texto da linha por tipo: etapa em negrito, item normal. */
const FONTE_POR_TIPO: Record<TipoItemOrcamento, string> = {
  etapa: "font-semibold",
  subetapa: "font-medium",
  item: "font-normal",
};

/** Cor de fundo da linha por tipo, pra reforçar a hierarquia visual. */
const FUNDO_POR_TIPO: Record<TipoItemOrcamento, string> = {
  etapa: "bg-muted/50",
  subetapa: "bg-muted/20",
  item: "",
};

/**
 * Detalhe read-only de um orçamento: cabeçalho com os totais e a árvore de
 * itens (etapa > subetapa > item) numa tabela única, indentada por tipo e
 * ordenada por `ordem`.
 */
export function OrcamentoArvore({ cabecalho, itens }: OrcamentoArvoreProps) {
  const router = useRouter();
  const config = STATUS_ORCAMENTO_CONFIG[cabecalho.status];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Voltar para a lista de orçamentos"
            onClick={() => router.push("/cadastros/orcamentos")}
          >
            <ArrowLeft />
          </Button>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h1 className="text-titulo font-semibold">
                {cabecalho.numero ?? "Orçamento"}
              </h1>
              <StatusBadge
                status={cabecalho.status}
                rotulo={config.rotulo}
                className={config.classes}
              />
            </div>
            {cabecalho.descricao ? (
              <p className="text-detalhe text-muted-foreground">
                {cabecalho.descricao}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard titulo="Obra" valor={cabecalho.obraNome ?? "-"} />
        <KPICard titulo="Custo total" valor={formatarBRL(cabecalho.custoTotal)} />
        <KPICard
          titulo="BDI"
          valor={
            cabecalho.bdi !== null ? formatarPercentual(cabecalho.bdi) : "-"
          }
        />
        <KPICard titulo="Preço total" valor={formatarBRL(cabecalho.precoTotal)} />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-secao font-semibold">Itens</h2>
        <div className="overflow-hidden rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 px-3 text-detalhe font-medium text-muted-foreground">
                  Índice
                </TableHead>
                <TableHead className="h-9 px-3 text-detalhe font-medium text-muted-foreground">
                  Descrição
                </TableHead>
                <TableHead className="h-9 px-3 text-detalhe font-medium text-muted-foreground">
                  Unidade
                </TableHead>
                <TableHead className="h-9 px-3 text-right text-detalhe font-medium text-muted-foreground">
                  Quantidade
                </TableHead>
                <TableHead className="h-9 px-3 text-right text-detalhe font-medium text-muted-foreground">
                  Custo total
                </TableHead>
                <TableHead className="h-9 px-3 text-right text-detalhe font-medium text-muted-foreground">
                  Preço total
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itens.length > 0 ? (
                itens.map((item) => (
                  <TableRow
                    key={item.id}
                    className={cn("h-9 hover:bg-transparent", FUNDO_POR_TIPO[item.tipo])}
                  >
                    <TableCell
                      className={cn(
                        "px-3 text-detalhe tabular-nums",
                        FONTE_POR_TIPO[item.tipo],
                      )}
                    >
                      {item.indice ?? (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "px-3 text-detalhe",
                        RECUO_POR_TIPO[item.tipo],
                        FONTE_POR_TIPO[item.tipo],
                      )}
                    >
                      {item.descricao}
                    </TableCell>
                    <TableCell className="px-3 text-detalhe">
                      {item.unidade ?? (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="px-3 text-right text-detalhe tabular-nums">
                      {item.quantidade !== null ? (
                        formatarQuantidade(item.quantidade)
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="px-3 text-right text-detalhe tabular-nums">
                      {item.custoTotal !== null ? (
                        formatarBRL(item.custoTotal)
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="px-3 text-right text-detalhe tabular-nums">
                      {item.precoTotal !== null ? (
                        formatarBRL(item.precoTotal)
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={6}
                    className="h-32 text-center text-detalhe text-muted-foreground"
                  >
                    Este orçamento ainda não tem itens
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
