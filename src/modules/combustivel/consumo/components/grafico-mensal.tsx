"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

/** O Recharts sob demanda, no cliente (padrão do painel): fora do bundle inicial. */
export const GraficoMensalConsumo = dynamic(() => import("./grafico-mensal-impl").then((m) => m.GraficoMensalConsumo), {
  ssr: false,
  loading: () => <Skeleton className="h-[300px] w-full rounded-lg" />,
});
