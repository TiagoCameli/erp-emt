"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Wrapper fino: carrega o gráfico (Recharts) sob demanda no client, tirando a
 * biblioteca do bundle inicial da rota. O Skeleton tem a mesma altura do gráfico
 * (h-72) pra não pular layout.
 */
export const CustoCcSerie = dynamic(
  () => import("./custo-cc-serie-impl").then((mod) => mod.CustoCcSerie),
  {
    ssr: false,
    loading: () => <Skeleton className="h-72 w-full" />,
  },
);
