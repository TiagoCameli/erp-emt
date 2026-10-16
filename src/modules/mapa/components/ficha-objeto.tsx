"use client";

import * as React from "react";
import { Move, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { LinhaFicha, ObjetoMapa } from "@/modules/mapa/objetos";

/**
 * Ficha do tanque, pilha ou depósito tocado no mapa (pelo nome) ou escolhido na lista "Sem lugar":
 * o que é, o que o cadastro diz dele (material e saldo da pilha, conteúdo e nível do tanque, local)
 * e "Mover no mapa" (ou "Pôr no mapa", quando ainda não tem lugar). O cadastro continua no
 * Estoque.
 */

const ROTULO_ALVO: Record<ObjetoMapa["alvo"], string> = {
  tanque: "Tanque",
  pilha: "Pilha",
  deposito: "Depósito",
};

export function FichaObjeto({
  objeto,
  linhas,
  podeEditar,
  onFechar,
  onMover,
}: {
  objeto: ObjetoMapa;
  linhas: LinhaFicha[];
  podeEditar: boolean;
  onFechar: () => void;
  onMover: () => void;
}) {
  return (
    <section
      className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3"
      aria-label={`Ficha de ${objeto.nome}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-corpo font-semibold">{objeto.nome}</p>
          <p className="text-detalhe text-muted-foreground">
            {ROTULO_ALVO[objeto.alvo]}
          </p>
        </div>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          onClick={onFechar}
          aria-label="Fechar"
        >
          <X />
        </Button>
      </div>
      {linhas.length > 0 ? (
        <div className="flex flex-col gap-1">
          {linhas.map((l) => (
            <div
              key={l.rotulo}
              className="flex items-baseline justify-between gap-3 text-detalhe"
            >
              <span className="shrink-0 text-muted-foreground">{l.rotulo}</span>
              <span className="text-right text-foreground tabular-nums">
                {l.valor}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {objeto.pos ? null : (
        <p className="text-detalhe text-muted-foreground">
          Ainda sem lugar no mapa.
        </p>
      )}
      {podeEditar ? (
        <Button type="button" size="sm" variant="outline" onClick={onMover}>
          <Move />
          {objeto.pos ? "Mover no mapa" : "Pôr no mapa"}
        </Button>
      ) : null}
    </section>
  );
}
