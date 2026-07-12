"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Wrapper fino: carrega o gráfico (Recharts) sob demanda no client, tirando a
 * biblioteca do bundle inicial da rota. O Skeleton tem a mesma altura do
 * gráfico (h-80) pra não pular layout.
 */
export const FluxoCaixaGrafico = dynamic(
  () => import("./fluxo-caixa-grafico-impl").then((mod) => mod.FluxoCaixaGrafico),
  {
    ssr: false,
    loading: () => <Skeleton className="h-80 w-full" />,
  },
);
