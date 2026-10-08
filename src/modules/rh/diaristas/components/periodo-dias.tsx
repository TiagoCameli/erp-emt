"use client";

import { cn } from "@/lib/utils";
import { diasDoPeriodo, type TipoDia } from "@/modules/rh/diaristas/periodo";

const DIA_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const ROTULO: Record<TipoDia, string> = {
  integral: "Integral",
  meia: "Meia diária",
  falta: "Não trabalhou",
};

const CLASSES: Record<TipoDia, string> = {
  integral: "border-border bg-background text-foreground",
  meia: "border-status-pendente/40 bg-status-pendente/10 text-status-pendente",
  falta:
    "border-status-rejeitado/40 bg-status-rejeitado/10 text-status-rejeitado line-through",
};

export interface PeriodoDiasProps {
  inicio: string;
  fim: string;
  meias: readonly string[];
  faltas: readonly string[];
  /** Clique no dia: a tela decide o próximo tipo (integral → meia → falta). */
  onAlternar: (dia: string, atual: TipoDia) => void;
  disabled?: boolean;
}

/**
 * Grade com os dias do período. Cada dia é um botão que alterna entre integral,
 * meia diária e não trabalhou. Sem período válido não mostra nada: o erro de
 * período aparece no campo de datas.
 */
export function PeriodoDias({
  inicio,
  fim,
  meias,
  faltas,
  onAlternar,
  disabled,
}: PeriodoDiasProps) {
  const dias = diasDoPeriodo(inicio, fim);
  if (dias.length === 0 || dias.length > 31) return null;

  const meiasSet = new Set(meias);
  const faltasSet = new Set(faltas);
  const tipoDe = (dia: string): TipoDia =>
    meiasSet.has(dia) ? "meia" : faltasSet.has(dia) ? "falta" : "integral";

  // Alinha o primeiro dia com o dia da semana dele (colunas dom..sáb).
  const primeiroDiaSemana = new Date(`${dias[0]}T12:00:00Z`).getUTCDay();

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {DIA_SEMANA.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: primeiroDiaSemana }, (_, i) => (
          <span key={`vazio-${i}`} aria-hidden />
        ))}
        {dias.map((dia) => {
          const tipo = tipoDe(dia);
          const numero = Number(dia.slice(8, 10));
          return (
            <button
              key={dia}
              type="button"
              disabled={disabled}
              onClick={() => onAlternar(dia, tipo)}
              aria-label={`Dia ${numero}: ${ROTULO[tipo]}`}
              title={ROTULO[tipo]}
              className={cn(
                "flex h-10 flex-col items-center justify-center rounded-md border text-sm tabular-nums transition-colors hover:border-primary disabled:pointer-events-none disabled:opacity-50",
                CLASSES[tipo],
              )}
            >
              <span className="leading-none">{numero}</span>
              {tipo === "meia" ? (
                <span className="text-[10px] leading-none">½</span>
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Clique no dia para alternar: integral → meia diária → não trabalhou.
      </p>
    </div>
  );
}
