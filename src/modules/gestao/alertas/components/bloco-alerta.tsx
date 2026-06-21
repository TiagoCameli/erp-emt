"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowRight, type LucideIcon } from "lucide-react";

import { DataTable, EmptyState } from "@/components/canonicos";
import { Badge } from "@/components/ui/badge";

/** Quantas ocorrências cada bloco mostra na tabela curta. */
const MAX_LINHAS = 10;

export interface BlocoAlertaProps<T> {
  titulo: string;
  /** Contagem total da categoria (pode ser maior que os itens exibidos). */
  total: number;
  /** Ocorrências; o bloco já corta nas primeiras MAX_LINHAS. */
  itens: T[];
  colunas: ColumnDef<T, unknown>[];
  /** Rota de drill-down pro módulo de origem. */
  href: string;
  rotuloVerTodos?: string;
  /** Ícone do estado vazio (quando a categoria está zerada). */
  iconeVazio: LucideIcon;
  tituloVazio: string;
  descricaoVazia?: string;
}

/**
 * Bloco de uma categoria de alerta (somente leitura): título com a contagem
 * (badge), uma tabela curta com as primeiras ocorrências e um link "ver todos"
 * pro módulo de origem. Quando a categoria está zerada, mostra um EmptyState
 * amigável no lugar da tabela.
 */
export function BlocoAlerta<T>({
  titulo,
  total,
  itens,
  colunas,
  href,
  rotuloVerTodos = "Ver todos",
  iconeVazio: IconeVazio,
  tituloVazio,
  descricaoVazia,
}: BlocoAlertaProps<T>) {
  const temAlertas = total > 0;

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-corpo font-semibold text-foreground">{titulo}</h2>
          <Badge
            variant="secondary"
            className={
              temAlertas
                ? "border-transparent bg-status-rejeitado/10 text-status-rejeitado tabular-nums"
                : "border-transparent bg-status-aprovado/10 text-status-aprovado tabular-nums"
            }
          >
            {total}
          </Badge>
        </div>
        {temAlertas ? (
          <Link
            href={href}
            className="inline-flex shrink-0 items-center gap-1 text-detalhe font-medium text-primary hover:underline"
          >
            {rotuloVerTodos}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        ) : null}
      </div>

      {temAlertas ? (
        <DataTable columns={colunas} data={itens.slice(0, MAX_LINHAS)} />
      ) : (
        <EmptyState
          icone={IconeVazio}
          titulo={tituloVazio}
          descricao={descricaoVazia}
          className="border-none bg-transparent py-8"
        />
      )}
    </section>
  );
}
