"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

/** Recharts sob demanda, fora do bundle inicial; o Skeleton tem a altura do gráfico. */
export const VencimentosGrafico = dynamic(
  () => import("./vencimentos-grafico-impl").then((mod) => mod.VencimentosGrafico),
  { ssr: false, loading: () => <Skeleton className="h-72 w-full" /> },
);
