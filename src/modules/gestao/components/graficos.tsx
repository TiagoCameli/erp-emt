"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Wrappers finos: carregam o Recharts sob demanda no client, tirando a
 * biblioteca do bundle inicial do painel (que é a primeira tela depois do
 * login). Os três gráficos vêm do mesmo módulo, então é um chunk só. O
 * Skeleton tem a mesma altura do gráfico (h-64) pra não pular layout.
 */

const carregando = () => <Skeleton className="h-64 w-full" />;

export const CustoMesGrafico = dynamic(
  () => import("./graficos-impl").then((mod) => mod.CustoMesGrafico),
  { ssr: false, loading: carregando },
);

export const VencimentosGrafico = dynamic(
  () => import("./graficos-impl").then((mod) => mod.VencimentosGrafico),
  { ssr: false, loading: carregando },
);

export const CustoCentroGrafico = dynamic(
  () => import("./graficos-impl").then((mod) => mod.CustoCentroGrafico),
  { ssr: false, loading: carregando },
);
