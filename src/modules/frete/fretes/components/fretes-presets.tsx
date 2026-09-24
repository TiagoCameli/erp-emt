"use client";

import * as React from "react";
import { Trophy, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  periodoEsteMes,
  periodoEstaSemana,
  periodoMesPassado,
  type PresetFrete,
  type TransportadoraTop,
} from "@/modules/frete/fretes/filtros";

export interface FretesPresetsProps {
  hoje: string;
  ativo: PresetFrete | null;
  /** Há preset ou transportadora escolhida: mostra "Limpar preset". */
  temAlgo: boolean;
  top: TransportadoraTop[];
  transportadoraId: string;
  onAplicar: (mudancas: Record<string, string | null>) => void;
}

/**
 * Presets rápidos da origem (FretePresets.tsx): "Sem chegada", "Esta semana", "Este
 * mês", "Mês passado" e "Top transportadora" (as 5 com mais fretes nos últimos 90 dias).
 * "Limpar preset" zera as datas, a transportadora e o "sem chegada".
 */
export function FretesPresets({ hoje, ativo, temAlgo, top, transportadoraId, onAplicar }: FretesPresetsProps) {
  const [topAberto, setTopAberto] = React.useState(false);

  const chip = (preset: PresetFrete, rotulo: string, mudancas: Record<string, string | null>) => (
    <Button
      key={preset}
      type="button"
      size="sm"
      variant={ativo === preset ? "default" : "outline"}
      aria-pressed={ativo === preset}
      className="h-7 rounded-full px-3 text-detalhe"
      onClick={() => onAplicar(mudancas)}
    >
      {rotulo}
    </Button>
  );

  const periodo = (p: { de: string; ate: string }) => ({ de: p.de, ate: p.ate, sem_chegada: null });

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Presets rápidos">
      {chip("sem_chegada", "Sem chegada", { de: null, ate: null, sem_chegada: "sim" })}
      {chip("esta_semana", "Esta semana", periodo(periodoEstaSemana(hoje)))}
      {chip("este_mes", "Este mês", periodo(periodoEsteMes(hoje)))}
      {chip("mes_passado", "Mês passado", periodo(periodoMesPassado(hoje)))}
      <Popover open={topAberto} onOpenChange={setTopAberto}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant={transportadoraId && top.some((t) => t.id === transportadoraId) ? "default" : "outline"}
            className="h-7 rounded-full px-3 text-detalhe"
          >
            <Trophy />
            Top transportadora
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-2">
          <p className="px-2 pb-1 text-legenda text-muted-foreground">Mais fretes nos últimos 90 dias</p>
          {top.length === 0 ? (
            <p className="px-2 py-1 text-detalhe text-muted-foreground">Nenhum frete nos últimos 90 dias</p>
          ) : (
            <ul className="flex flex-col">
              {top.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-detalhe hover:bg-surface",
                      t.id === transportadoraId && "font-medium",
                    )}
                    onClick={() => {
                      onAplicar({ transportadora: t.id });
                      setTopAberto(false);
                    }}
                  >
                    <span className="truncate">{t.nome}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {t.quantidade} {t.quantidade === 1 ? "frete" : "fretes"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </PopoverContent>
      </Popover>
      {temAlgo ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-detalhe"
          onClick={() => onAplicar({ de: null, ate: null, transportadora: null, sem_chegada: null })}
        >
          <X />
          Limpar preset
        </Button>
      ) : null}
    </div>
  );
}
