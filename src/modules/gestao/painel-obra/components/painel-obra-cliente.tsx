"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowRight, TrendingUp } from "lucide-react";

import {
  DataTable,
  EmptyState,
  FilterBar,
  FiltroBusca,
  MoneyText,
} from "@/components/canonicos";
import { formatarPercentual } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import type { ResultadoObra } from "@/modules/gestao/_shared/agregacao";
import type { GrupoCusto } from "@/modules/gestao/_shared/calculo";

import { MargemObraGrafico } from "./margem-obra-grafico";
import { MedidoCustoGrafico } from "./medido-custo-grafico";

interface PainelObraClienteProps {
  obras: ResultadoObra[];
}

/** Grupos de custo na ordem de exibição do breakdown. */
const GRUPOS_CUSTO: { chave: GrupoCusto; rotulo: string }[] = [
  { chave: "material", rotulo: "Material" },
  { chave: "combustivel", rotulo: "Combustível" },
  { chave: "manutencao", rotulo: "Manutenção" },
  { chave: "folha", rotulo: "Folha" },
  { chave: "servicos", rotulo: "Serviços" },
];

/** Cor da margem: verde quando dá lucro, vermelho quando dá prejuízo. */
function corMargem(valor: number): string {
  return valor >= 0 ? "text-status-aprovado" : "text-status-rejeitado";
}

const COLUNAS: ColumnDef<ResultadoObra, unknown>[] = [
  {
    accessorKey: "obraNome",
    header: "Obra",
    cell: ({ row }) => (
      <div className="min-w-0">
        {row.original.obraLote ? (
          <span className="mr-1.5 text-legenda text-muted-foreground codigo-doc">
            {row.original.obraLote}
          </span>
        ) : null}
        <span className="font-medium">{row.original.obraNome}</span>
      </div>
    ),
  },
  {
    accessorKey: "contratual",
    header: "Contratual",
    meta: { alinharDireita: true },
    cell: ({ row }) => <MoneyText valor={row.original.contratual} />,
  },
  {
    accessorKey: "medido",
    header: "Medido",
    meta: { alinharDireita: true },
    cell: ({ row }) => (
      <div className="flex flex-col items-end">
        <MoneyText valor={row.original.medido} />
        <span className="text-legenda text-muted-foreground tabular-nums">
          {formatarPercentual(row.original.avancoPct)} avanço
        </span>
      </div>
    ),
  },
  {
    accessorKey: "faturado",
    header: "Faturado",
    meta: { alinharDireita: true },
    cell: ({ row }) => <MoneyText valor={row.original.faturado} />,
  },
  {
    accessorKey: "recebido",
    header: "Recebido",
    meta: { alinharDireita: true },
    cell: ({ row }) => <MoneyText valor={row.original.recebido} />,
  },
  {
    accessorKey: "custoTotal",
    header: "Custo",
    meta: { alinharDireita: true },
    cell: ({ row }) => <MoneyText valor={row.original.custoTotal} />,
  },
  {
    accessorKey: "margem",
    header: "Margem",
    meta: { alinharDireita: true },
    cell: ({ row }) => (
      <div className="flex flex-col items-end">
        <MoneyText
          valor={row.original.margem}
          className={cn("font-medium", corMargem(row.original.margem))}
        />
        <span
          className={cn(
            "text-legenda tabular-nums",
            corMargem(row.original.margem),
          )}
        >
          {formatarPercentual(row.original.margemPct)}
        </span>
      </div>
    ),
  },
];

/** Card de uma obra: medição, faturamento, custo com breakdown e margem + drill-down. */
function CardObra({ obra }: { obra: ResultadoObra }) {
  return (
    <div className="faixa-esquerda flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {obra.obraLote ? (
            <span className="text-legenda text-muted-foreground codigo-doc">
              {obra.obraLote}
            </span>
          ) : null}
          <h3 className="text-secao font-semibold text-foreground">
            {obra.obraNome}
          </h3>
        </div>
        <div className="shrink-0 text-right">
          <MoneyText
            valor={obra.margem}
            className={cn(
              "text-titulo font-semibold",
              corMargem(obra.margem),
            )}
          />
          <p className={cn("text-detalhe tabular-nums", corMargem(obra.margem))}>
            {formatarPercentual(obra.margemPct)} de margem
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        <div>
          <p className="text-legenda uppercase tracking-wide text-muted-foreground">
            Contratual
          </p>
          <MoneyText valor={obra.contratual} className="text-detalhe" />
        </div>
        <div>
          <p className="text-legenda uppercase tracking-wide text-muted-foreground">
            Medido
          </p>
          <MoneyText valor={obra.medido} className="text-detalhe" />
          <p className="text-legenda text-muted-foreground tabular-nums">
            {formatarPercentual(obra.avancoPct)} avanço
          </p>
        </div>
        <div>
          <p className="text-legenda uppercase tracking-wide text-muted-foreground">
            Faturado
          </p>
          <MoneyText valor={obra.faturado} className="text-detalhe" />
        </div>
        <div>
          <p className="text-legenda uppercase tracking-wide text-muted-foreground">
            Recebido
          </p>
          <MoneyText valor={obra.recebido} className="text-detalhe" />
        </div>
      </div>

      <div className="rounded-md border border-border bg-surface/50 p-3">
        <div className="flex items-center justify-between">
          <p className="text-legenda uppercase tracking-wide text-muted-foreground">
            Custo total
          </p>
          <MoneyText valor={obra.custoTotal} className="text-detalhe font-medium" />
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-5">
          {GRUPOS_CUSTO.map((grupo) => (
            <div
              key={grupo.chave}
              className="flex items-baseline justify-between gap-2"
            >
              <dt className="text-legenda text-muted-foreground">
                {grupo.rotulo}
              </dt>
              <dd>
                <MoneyText
                  valor={obra.custo[grupo.chave]}
                  className="text-legenda"
                />
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/medicao/medicoes"
          className="inline-flex items-center gap-1 text-detalhe text-muted-foreground hover:text-foreground hover:underline"
        >
          Ver medições
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
        <Link
          href="/gestao/custos"
          className="inline-flex items-center gap-1 text-detalhe text-muted-foreground hover:text-foreground hover:underline"
        >
          Ver custos
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

/**
 * Painel por obra (somente leitura): "as obras estão dando lucro?". Cards por
 * obra com medição, faturamento, custo (com breakdown por grupo) e margem,
 * gráficos de margem e medido x custo, e uma tabela com as colunas principais.
 * Busca por nome ou lote, client-side.
 */
export function PainelObraCliente({ obras }: PainelObraClienteProps) {
  const [busca, setBusca] = React.useState("");

  const filtradas = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return obras;
    return obras.filter((obra) => {
      const nome = obra.obraNome.toLowerCase();
      const lote = obra.obraLote?.toLowerCase() ?? "";
      return nome.includes(termo) || lote.includes(termo);
    });
  }, [obras, busca]);

  if (obras.length === 0) {
    return (
      <EmptyState
        icone={TrendingUp}
        titulo="Sem obras ativas"
        descricao="Quando houver obras ativas com medições e custos, o resultado de cada uma aparece aqui."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-secao font-semibold text-foreground">
            Margem por obra
          </h2>
          <MargemObraGrafico obras={obras} />
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-secao font-semibold text-foreground">
            Medido x custo
          </h2>
          <MedidoCustoGrafico obras={obras} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <FilterBar>
          <FiltroBusca
            valor={busca}
            onValorChange={setBusca}
            placeholder="Buscar por obra ou lote"
          />
        </FilterBar>
        <DataTable
          columns={COLUNAS}
          data={filtradas}
          emptyState={
            <EmptyState
              icone={TrendingUp}
              titulo="Nenhuma obra encontrada"
              descricao="Ajuste a busca para encontrar a obra."
              className="border-none bg-transparent"
            />
          }
        />
      </div>

      <div className="flex flex-col gap-4">
        {filtradas.map((obra) => (
          <CardObra key={obra.obraId} obra={obra} />
        ))}
      </div>
    </div>
  );
}
