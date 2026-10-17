"use client";

import { Plus, X } from "lucide-react";

import { Combobox, InputPercentual } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { formatarBRL } from "@/lib/formatadores";
import { paraNumero } from "@/modules/rh/diaristas/numero";
import type { CentroDiaria } from "@/modules/rh/diaristas/queries";
import {
  dividirValor,
  formatarPercentual,
  percentualValido,
  somaPercentual,
} from "@/modules/rh/diaristas/rateio";

/** Uma linha do rateio como o formulário guarda: percentual em string pt-BR. */
export interface LinhaRateioForm {
  centroCustoId: string;
  percentual: string;
}

export interface RateioObrasProps {
  linhas: LinhaRateioForm[];
  onLinhasChange: (linhas: LinhaRateioForm[]) => void;
  centros: CentroDiaria[];
  /** Total da diária, para mostrar quanto cabe a cada obra. 0 = ainda sem valor. */
  total: number;
  /** Centros que esta diária já usa: inativos continuam escolhíveis nela. */
  centrosDaDiaria?: string[];
  erro?: string;
}

/** "100" -> número; vazio/ inválido -> NaN. */
function pct(linha: LinhaRateioForm): number {
  return paraNumero(linha.percentual);
}

/**
 * Obra da diária, com rateio por percentual. Começa com uma linha de 100%;
 * "Adicionar obra" abre outra já com o que falta para 100. Cada linha mostra o
 * R$ que cabe a ela pela mesma conta do banco (`dividirValor`).
 */
export function RateioObras({
  linhas,
  onLinhasChange,
  centros,
  total,
  centrosDaDiaria = [],
  erro,
}: RateioObrasProps) {
  const opcoes = centros
    .filter((c) => c.ativo || centrosDaDiaria.includes(c.id))
    .map((c) => ({ valor: c.id, rotulo: c.nome }));

  const numeros = linhas.map((l) => ({
    centroCustoId: l.centroCustoId,
    percentual: pct(l),
  }));
  const todosValidos = numeros.every((l) => percentualValido(l.percentual));
  const soma = todosValidos ? somaPercentual(numeros) : null;
  const valores = todosValidos && total > 0 ? dividirValor(total, numeros) : null;

  function alterar(indice: number, parcial: Partial<LinhaRateioForm>) {
    onLinhasChange(
      linhas.map((l, i) => (i === indice ? { ...l, ...parcial } : l)),
    );
  }

  function adicionar() {
    const resto = soma !== null ? Math.round((100 - soma) * 10000) / 10000 : 0;
    onLinhasChange([
      ...linhas,
      {
        centroCustoId: "",
        percentual: resto > 0 ? String(resto).replace(".", ",") : "",
      },
    ]);
  }

  function remover(indice: number) {
    const restantes = linhas.filter((_, i) => i !== indice);
    // Sobrou uma linha: ela volta a ser a obra inteira.
    onLinhasChange(
      restantes.length === 1
        ? [{ ...restantes[0]!, percentual: "100" }]
        : restantes,
    );
  }

  const varias = linhas.length > 1;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Obra</span>
        <Button type="button" variant="ghost" size="sm" onClick={adicionar}>
          <Plus className="size-4" aria-hidden />
          Adicionar obra
        </Button>
      </div>

      {linhas.map((linha, i) => (
        <div key={i} className="flex items-center gap-2">
          <Combobox
            valor={linha.centroCustoId}
            onValorChange={(valor) => alterar(i, { centroCustoId: valor })}
            opcoes={opcoes}
            placeholder="Selecione a obra"
            className="min-w-0 flex-1"
            id={i === 0 ? "diaria-obra" : `diaria-obra-${i}`}
          />
          {varias ? (
            <>
              <InputPercentual
                valor={linha.percentual}
                onValorChange={(valor) => alterar(i, { percentual: valor })}
                ariaLabel={`Percentual da obra ${i + 1}`}
                placeholder="%"
                className="w-24 shrink-0"
              />
              <span className="w-24 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                {valores ? formatarBRL(valores[i]!) : "—"}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remover obra ${i + 1}`}
                onClick={() => remover(i)}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </>
          ) : null}
        </div>
      ))}

      {varias && soma !== null && soma !== 100 ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Somando {formatarPercentual(soma)}:{" "}
          {soma < 100 ? "falta" : "passa"}{" "}
          {formatarPercentual(Math.round(Math.abs(100 - soma) * 10000) / 10000)}{" "}
          {soma < 100 ? "para" : "de"} 100%
        </p>
      ) : null}
      {erro ? <p className="text-sm text-destructive">{erro}</p> : null}
    </div>
  );
}
