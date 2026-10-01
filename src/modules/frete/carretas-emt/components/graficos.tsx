"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

/** Carrega o Recharts sob demanda; o Skeleton tem a altura do gráfico (h-72) para não pular layout. */
const carregando = () => <Skeleton className="h-72 w-full" />;

export const PorCarretaMensalGrafico = dynamic(() => import("./graficos-impl").then((m) => m.PorCarretaMensalGrafico), {
  ssr: false,
  loading: carregando,
});

export const ProducaoVsGastosGrafico = dynamic(() => import("./graficos-impl").then((m) => m.ProducaoVsGastosGrafico), {
  ssr: false,
  loading: carregando,
});

export const ResultadoAcumuladoGrafico = dynamic(() => import("./graficos-impl").then((m) => m.ResultadoAcumuladoGrafico), {
  ssr: false,
  loading: carregando,
});

export const ComparativoCarretasGrafico = dynamic(() => import("./graficos-impl").then((m) => m.ComparativoCarretasGrafico), {
  ssr: false,
  loading: carregando,
});
