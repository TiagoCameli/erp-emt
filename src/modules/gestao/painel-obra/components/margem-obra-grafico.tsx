"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Wrapper fino: carrega o gráfico (Recharts) sob demanda no client, tirando a
 * biblioteca do bundle inicial da rota. O Skeleton tem a mesma altura do
 * gráfico (h-80) pra não pular layout.
 */
export const MargemObraGrafico = dynamic(
  () => import("./margem-obra-grafico-impl").then((mod) => mod.MargemObraGrafico),
  {
    ssr: false,
    loading: () => <Skeleton className="h-80 w-full" />,
  },
);
