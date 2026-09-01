"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Wrappers finos: carregam o Recharts sob demanda no client, tirando a
 * biblioteca do bundle inicial do painel (que é a primeira tela depois do
 * login). Os dois gráficos vêm do mesmo módulo, então é um chunk só. O
 * Skeleton tem a mesma altura do gráfico (h-64) pra não pular layout.
 *
 * Eram três até 01/09/2026. Os rankings (custo por centro de custo, a pagar por
 * prazo) saíram do Recharts e viraram `BarrasHorizontais`, que é HTML e roda no
 * servidor: o eixo Y do gráfico cortava o nome do centro de custo justamente na
 * parte que distingue uma linha da outra.
 */

const carregando = () => <Skeleton className="h-64 w-full" />;

export const ReceitaDespesaGrafico = dynamic(
  () => import("./graficos-impl").then((mod) => mod.ReceitaDespesaGrafico),
  { ssr: false, loading: carregando },
);

export const ResultadoMesGrafico = dynamic(
  () => import("./graficos-impl").then((mod) => mod.ResultadoMesGrafico),
  { ssr: false, loading: carregando },
);
