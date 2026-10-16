"use client";

import * as React from "react";
import { LocateFixed, X } from "lucide-react";

import { Combobox } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import type { LocalidadeMapa, PessoaMapa } from "@/modules/mapa/tipos";

/**
 * Ficha da pessoa tocada no mapa: quem é, qual máquina opera e o local onde trabalha (pedido do
 * Tiago, 16/10/2026: "assinalar pessoas a localizações onde elas estão trabalhando"). Trocar o
 * local põe a pessoa no ponto do local; quem opera uma máquina deixa de operar (o pai confirma).
 * Sem "nenhum local": tirar do local é arrastar a pessoa para outro ponto.
 */

export function FichaPessoa({
  pessoa,
  maquina,
  localidades,
  podeEditar,
  salvando,
  onFechar,
  onFocar,
  onTrocarLocal,
}: {
  pessoa: PessoaMapa;
  /** Código da máquina que a pessoa opera (null = nenhuma). */
  maquina: string | null;
  localidades: readonly LocalidadeMapa[];
  podeEditar: boolean;
  salvando: boolean;
  onFechar: () => void;
  onFocar: () => void;
  onTrocarLocal: (localidadeId: string) => void;
}) {
  const opcoes = React.useMemo(
    () =>
      [...localidades]
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
        .map((l) => ({ valor: l.id, rotulo: l.nome })),
    [localidades],
  );
  const local = pessoa.localidadeId
    ? (localidades.find((l) => l.id === pessoa.localidadeId) ?? null)
    : null;

  return (
    <section
      className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3 text-detalhe"
      aria-label={`Ficha de ${pessoa.nome}`}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-corpo font-semibold">{pessoa.nome}</p>
          <p className="text-muted-foreground">
            {[pessoa.funcao, pessoa.vinculo, pessoa.equipeNome]
              .filter(Boolean)
              .join(" · ") || "Sem função cadastrada"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {pessoa.pos ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={onFocar}
              aria-label="Centralizar no mapa"
              title="Centralizar no mapa"
            >
              <LocateFixed />
            </Button>
          ) : null}
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={onFechar}
            aria-label="Fechar ficha"
          >
            <X />
          </Button>
        </div>
      </header>

      <div className="flex items-baseline justify-between gap-3">
        <span className="shrink-0 text-muted-foreground">Opera</span>
        <span className="text-right">
          {maquina ?? (
            <span className="text-muted-foreground">nenhuma máquina</span>
          )}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground">Local de trabalho</span>
        {podeEditar ? (
          <Combobox
            valor={pessoa.localidadeId ?? ""}
            onValorChange={(v) => {
              if (v && v !== pessoa.localidadeId) onTrocarLocal(v);
            }}
            opcoes={opcoes}
            rotuloDoValor={local?.nome}
            placeholder="Escolher o local"
            buscaPlaceholder="Nome do local"
            size="sm"
            disabled={salvando}
            ariaLabel="Local de trabalho"
          />
        ) : (
          <p>{local?.nome ?? "–"}</p>
        )}
      </div>

      {podeEditar ? (
        <p className="text-legenda text-muted-foreground">
          Arraste a pessoa até uma máquina para assinalar como operador, ou até
          um local para pôr ela lá.
        </p>
      ) : null}
    </section>
  );
}
