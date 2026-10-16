"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

export type {
  Alvo,
  ArrasteSolto,
  CartaoNoMapa,
  CenaBase,
  Foco,
  GiroMapa,
  ItemSolto,
  MapaEmtProps,
  ModoFundo,
  TipoMotor,
} from "./mapa-emt-impl";

/**
 * O deck.gl e o loader do Google tocam `window` no import: o mapa só existe no navegador, com a
 * altura já reservada pelo esqueleto enquanto o código (pesado) chega.
 */
export const MapaEmt = dynamic(
  () => import("./mapa-emt-impl").then((m) => m.MapaEmtImpl),
  {
    ssr: false,
    loading: () => <Skeleton className="h-full w-full rounded-none" />,
  },
);
