"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

/** Recharts sob demanda, fora do bundle inicial. Skeleton da mesma altura (h-72). */
export const PosicaoGrafico = dynamic(
  () => import("./posicao-grafico-impl").then((mod) => mod.PosicaoGrafico),
  { ssr: false, loading: () => <Skeleton className="h-72 w-full" /> },
);
