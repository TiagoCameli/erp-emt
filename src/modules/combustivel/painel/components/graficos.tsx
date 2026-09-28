"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

import { ALTURA_RANKING } from "./lista-ranking";

/**
 * O Recharts sob demanda, no cliente (padrão do painel de Gestão): tira a biblioteca do
 * bundle inicial. O esqueleto tem a altura do cartão (título + 300px) para a página não pular.
 */
const carregando = () => <Skeleton className="h-[360px] w-full rounded-lg" />;
/** Top e Custo por obra: título + a área do ranking (a mesma constante que o cartão usa). */
const carregandoRanking = () => <Skeleton className="w-full rounded-lg" style={{ height: ALTURA_RANKING + 60 }} />;

export const EvolucaoTemporal = dynamic(() => import("./graficos-impl").then((m) => m.EvolucaoTemporal), {
  ssr: false,
  loading: carregando,
});

export const MixCombustivel = dynamic(() => import("./graficos-impl").then((m) => m.MixCombustivel), {
  ssr: false,
  loading: carregando,
});

export const TopConsumidores = dynamic(() => import("./graficos-impl").then((m) => m.TopConsumidores), {
  ssr: false,
  loading: carregandoRanking,
});

export const CustoPorObra = dynamic(() => import("./graficos-impl").then((m) => m.CustoPorObra), {
  ssr: false,
  loading: carregandoRanking,
});

export const CustoPorFornecedor = dynamic(() => import("./graficos-impl").then((m) => m.CustoPorFornecedor), {
  ssr: false,
  loading: carregando,
});
