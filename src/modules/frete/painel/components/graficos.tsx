"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

/** Carrega o Recharts sob demanda; o Skeleton tem a altura do gráfico (h-72) para não pular layout. */
const carregando = () => <Skeleton className="h-72 w-full" />;

export const EvolucaoGrafico = dynamic(() => import("./graficos-impl").then((m) => m.EvolucaoGrafico), {
  ssr: false,
  loading: carregando,
});

export const MaterialVsFreteGrafico = dynamic(() => import("./graficos-impl").then((m) => m.MaterialVsFreteGrafico), {
  ssr: false,
  loading: carregando,
});
