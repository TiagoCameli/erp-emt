"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";
import { alturaDoGrafico } from "./custo-cc-altura";
import type { CustoCentroCusto } from "../queries";

const Grafico = dynamic(
  () => import("./custo-cc-grafico-impl").then((mod) => mod.CustoCcGrafico),
  {
    ssr: false,
    loading: () => <Skeleton className="size-full" />,
  },
);

interface CustoCcGraficoProps {
  centros: CustoCentroCusto[];
  destinos?: Map<string, string>;
}

/**
 * Wrapper fino: carrega o gráfico (Recharts) sob demanda no client, tirando a
 * biblioteca do bundle inicial da rota.
 *
 * A ALTURA é medida aqui, não lá dentro, porque o `loading` do `next/dynamic`
 * não recebe props: o Skeleton e o gráfico precisam do mesmo número, senão a
 * página pula quando o gráfico chega. Quem sabe quantos centros existem é este
 * componente, então é ele que reserva o espaço.
 */
export function CustoCcGrafico({ centros, destinos }: CustoCcGraficoProps) {
  return (
    <div className="w-full" style={{ height: alturaDoGrafico(centros.length) }}>
      <Grafico centros={centros} destinos={destinos} />
    </div>
  );
}
