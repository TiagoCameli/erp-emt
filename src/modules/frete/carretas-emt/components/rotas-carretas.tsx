"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { TriangleAlert } from "lucide-react";

import { MoneyText } from "@/components/canonicos";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Alternador } from "@/modules/combustivel/painel/components/cartao-grafico";
import type { LinhaRota } from "@/modules/frete/carretas-emt/rotas";
import { ROTULO_TIPO_FRETE, type TipoFrete } from "@/modules/frete/fretes/schemas";

import type { CamadaMapa } from "./mapa-rotas-impl";

/** O Leaflet mexe em `window` no import: só no navegador, com a altura reservada. */
const MapaRotas = dynamic(() => import("./mapa-rotas-impl").then((m) => m.MapaRotas), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

const CAMADAS = [
  { id: "mapa", rotulo: "Mapa" },
  { id: "satelite", rotulo: "Satélite" },
] as const;

const TH = "px-3 py-2 font-medium";
const TD = "px-3 py-1.5";

const numero = (v: number | null, casas = 0) =>
  v === null ? null : v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

function Vazio({ texto = "Sem dado" }: { texto?: string }) {
  return <span className="text-muted-foreground">{texto}</span>;
}

function tempo(rota: LinhaRota) {
  if (rota.diasMedio === null) return <Vazio texto="Sem chegada" />;
  if (rota.diasMedio < 0.5) return <span>No mesmo dia</span>;
  return <span className="tabular-nums">{`${numero(rota.diasMedio, 1)} dias`}</span>;
}

export function RotasCarretas({ rotas }: { rotas: LinhaRota[] }) {
  const [camada, setCamada] = React.useState<CamadaMapa>("mapa");
  const [selecionada, setSelecionada] = React.useState<string | null>(null);
  const totalProducao = rotas.reduce((s, r) => s + Math.round(r.producao * 100), 0) / 100;
  const totalViagens = rotas.reduce((s, r) => s + r.viagens, 0);
  const comAlerta = rotas.filter((r) => r.alertas.length > 0);

  if (rotas.length === 0) {
    return <p className="py-2 text-detalhe text-muted-foreground">Nenhum frete com origem e destino no recorte escolhido.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3 pb-2">
          <p className="text-detalhe text-muted-foreground">
            Linha mais grossa = mais produção.{" "}
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-1 w-4 rounded-full" style={{ background: "var(--viz-producao)" }} /> material
            </span>{" "}
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-1 w-4 rounded-full" style={{ background: "var(--viz-custo)" }} /> transferência
            </span>
            . Clique numa rota para destacar.
          </p>
          <Alternador rotulo="Tipo de mapa" opcoes={CAMADAS} valor={camada} onValorChange={setCamada} />
        </div>
        {/* `isolate`: os painéis do Leaflet têm z-index 400+, e sem um contexto próprio passariam
            por cima dos menus e do cabeçalho do app. */}
        <div className="isolate h-[480px] px-2 pb-2">
          <MapaRotas rotas={rotas} camada={camada} selecionada={selecionada} onSelecionar={setSelecionada} />
        </div>
      </div>

      {comAlerta.length > 0 ? (
        <div className="flex items-start gap-2 rounded-md border border-status-pendente/40 bg-status-pendente/5 px-3 py-2 text-detalhe text-foreground">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-pendente" aria-hidden />
          <ul className="space-y-0.5">
            {comAlerta.flatMap((r) =>
              r.alertas.map((a) => (
                <li key={`${r.chave}-${a}`}>
                  <span className="font-medium">
                    {rotas.indexOf(r) + 1}. {r.origem.nome} → {r.destino.nome}:
                  </span>{" "}
                  {a}
                </li>
              )),
            )}
          </ul>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <table className="w-full text-detalhe">
          <thead>
            <tr className="border-b border-border text-legenda text-muted-foreground">
              {[
                ["#", false],
                ["Rota", false],
                ["Tipo", false],
                ["Viagens", true],
                ["Toneladas", true],
                ["Produção", true],
                ["% da produção", true],
                ["Por viagem", true],
                ["Km estrada / lançado", true],
                ["Tempo médio", true],
              ].map(([rotulo, direita]) => (
                <th key={String(rotulo)} className={cn(TH, direita ? "text-right" : "text-left", "whitespace-nowrap")}>
                  {rotulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rotas.map((r, i) => (
              <tr
                key={r.chave}
                onClick={() => setSelecionada(selecionada === r.chave ? null : r.chave)}
                className={cn(
                  "cursor-pointer border-b border-border last:border-b-0 hover:bg-surface",
                  selecionada === r.chave && "bg-primary/5",
                )}
              >
                <td className={cn(TD, "tabular-nums text-muted-foreground")}>{i + 1}</td>
                <td className={cn(TD, "whitespace-nowrap font-medium")}>
                  {r.origem.nome} → {r.destino.nome}
                  {r.alertas.length > 0 ? (
                    <TriangleAlert className="ml-1.5 inline size-3.5 text-status-pendente" aria-label="Rota com alerta" />
                  ) : null}
                </td>
                <td className={cn(TD, "whitespace-nowrap text-muted-foreground")}>
                  {r.tipos.map((t) => ROTULO_TIPO_FRETE[t as TipoFrete] ?? t).join(", ")}
                </td>
                <td className={cn(TD, "text-right tabular-nums")}>{numero(r.viagens)}</td>
                <td className={cn(TD, "text-right tabular-nums")}>{numero(r.toneladas, 2)}</td>
                <td className={cn(TD, "text-right")}>
                  <MoneyText valor={r.producao} />
                </td>
                <td className={cn(TD, "text-right tabular-nums whitespace-nowrap")}>
                  {totalProducao > 0 ? `${numero((r.producao / totalProducao) * 100, 1)}%` : <Vazio />}
                </td>
                <td className={cn(TD, "text-right")}>{r.producaoPorViagem === null ? <Vazio /> : <MoneyText valor={r.producaoPorViagem} />}</td>
                <td className={cn(TD, "text-right tabular-nums whitespace-nowrap")}>
                  <span className="inline-flex flex-col items-end">
                    <span>
                      {r.kmMapa === null ? <Vazio texto="Sem traçado" /> : `${numero(r.kmMapa)} km`}
                      <span className="text-muted-foreground"> / </span>
                      {r.kmMedio === null ? <Vazio /> : `${numero(r.kmMedio)} km`}
                    </span>
                    {r.horasMapa !== null ? (
                      <span className="text-legenda text-muted-foreground">{`~${numero(r.horasMapa, 1)} h de estrada`}</span>
                    ) : null}
                  </span>
                </td>
                <td className={cn(TD, "text-right whitespace-nowrap")}>{tempo(r)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-border bg-surface font-semibold">
              <td className={TD} colSpan={3}>
                Total
              </td>
              <td className={cn(TD, "text-right tabular-nums")}>{numero(totalViagens)}</td>
              <td className={cn(TD, "text-right tabular-nums")}>{numero(rotas.reduce((s, r) => s + r.toneladas, 0), 2)}</td>
              <td className={cn(TD, "text-right")}>
                <MoneyText valor={totalProducao} />
              </td>
              <td className={TD} colSpan={4} />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-legenda text-muted-foreground">
        Tempo médio = dias entre a data de saída e a de chegada do frete (o frete não guarda hora). Km estrada: calculado no
        OpenStreetMap; km lançado: a média do que está nos fretes.
      </p>
    </div>
  );
}
