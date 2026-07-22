"use client";

import type { CSSProperties, ReactNode } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Uma coluna da tabela de itens. `largura` é um trilho de grid CSS. */
export interface ColunaItem {
  chave: string;
  rotulo: string;
  /** Trilho de grid no desktop, ex.: "1fr", "120px", "140px". */
  largura: string;
  alinhamento?: "left" | "right";
  obrigatorio?: boolean;
}

export interface TabelaItensProps<L> {
  colunas: ColunaItem[];
  linhas: L[];
  chaveLinha: (linha: L, indice: number) => string;
  renderCelula: (chave: string, indice: number) => ReactNode;
  erroCelula?: (chave: string, indice: number) => string | undefined;
  onRemover: (indice: number) => void;
  podeRemover?: (indice: number) => boolean;
  rotuloRemover?: string;
  rodape?: ReactNode;
  className?: string;
}

/**
 * Tabela compacta de itens que repetem (ex.: insumos de uma OC). O rótulo de
 * cada coluna aparece 1x como cabeçalho no desktop; no celular cada linha vira
 * um card empilhado com rótulo por campo. Genérica: não conhece react-hook-form,
 * recebe as linhas e um renderCelula. Cálculo (subtotal/total) fica fora dela.
 */
export function TabelaItens<L>({
  colunas,
  linhas,
  chaveLinha,
  renderCelula,
  erroCelula,
  onRemover,
  podeRemover,
  rotuloRemover = "Remover",
  rodape,
  className,
}: TabelaItensProps<L>) {
  // trilhos das colunas + coluna auto pra lixeira
  const template = `${colunas.map((c) => c.largura).join(" ")} auto`;
  const estiloGrid = { "--cols-itens": template } as CSSProperties;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Cabeçalho: só no desktop, 1x */}
      <div
        data-testid="tabela-itens-header"
        style={estiloGrid}
        className="hidden gap-3 px-3 sm:grid sm:grid-cols-[var(--cols-itens)]"
      >
        {colunas.map((coluna) => (
          <span
            key={coluna.chave}
            className={cn(
              "text-legenda font-medium text-muted-foreground",
              coluna.alinhamento === "right" && "text-right",
            )}
          >
            {coluna.rotulo}
            {coluna.obrigatorio ? (
              <span className="text-destructive" aria-hidden>
                {" "}*
              </span>
            ) : null}
          </span>
        ))}
        <span aria-hidden />
      </div>

      {linhas.map((linha, indice) => {
        const removivel = podeRemover ? podeRemover(indice) : true;
        return (
          <div
            key={chaveLinha(linha, indice)}
            data-testid="tabela-itens-linha"
            style={estiloGrid}
            className="grid grid-cols-1 gap-2 rounded-md bg-card px-3 py-2 sm:grid-cols-[var(--cols-itens)] sm:items-start sm:gap-3"
          >
            {colunas.map((coluna) => {
              const erro = erroCelula?.(coluna.chave, indice);
              return (
                <div key={coluna.chave} className="flex flex-col gap-1">
                  {/* rótulo só no mobile (no desktop está no cabeçalho) */}
                  <Label className="text-legenda text-muted-foreground sm:hidden">
                    {coluna.rotulo}
                  </Label>
                  <div
                    className={cn(
                      coluna.alinhamento === "right" && "sm:text-right",
                    )}
                  >
                    {renderCelula(coluna.chave, indice)}
                  </div>
                  {erro ? (
                    <p className="text-legenda text-destructive" role="alert">
                      {erro}
                    </p>
                  ) : null}
                </div>
              );
            })}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="justify-self-end"
              aria-label={rotuloRemover}
              disabled={!removivel}
              onClick={() => onRemover(indice)}
            >
              <Trash2 />
            </Button>
          </div>
        );
      })}

      {rodape ? <div>{rodape}</div> : null}
    </div>
  );
}
