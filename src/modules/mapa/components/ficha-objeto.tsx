"use client";

import * as React from "react";
import { Move, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ObjetoMapa } from "@/modules/mapa/objetos";

/**
 * Ficha do tanque, pilha ou depósito tocado no mapa (pelo nome) ou escolhido na lista "Sem lugar":
 * o que é e "Mover no mapa" (ou "Pôr no mapa", quando ainda não tem lugar). O cadastro continua
 * no Estoque.
 */

const ROTULO_ALVO: Record<ObjetoMapa["alvo"], string> = {
  tanque: "Tanque",
  pilha: "Pilha",
  deposito: "Depósito",
};

export function FichaObjeto({
  objeto,
  podeEditar,
  onFechar,
  onMover,
}: {
  objeto: ObjetoMapa;
  podeEditar: boolean;
  onFechar: () => void;
  onMover: () => void;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-corpo font-semibold">{objeto.nome}</p>
          <p className="text-detalhe text-muted-foreground">
            {ROTULO_ALVO[objeto.alvo]}
            {objeto.detalhe && objeto.detalhe !== objeto.alvo
              ? ` · ${objeto.detalhe}`
              : ""}
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
      <p className="text-detalhe text-muted-foreground">
        {objeto.pos
          ? `No mapa em ${objeto.pos[1].toFixed(5)}, ${objeto.pos[0].toFixed(5)}`
          : "Ainda sem lugar no mapa."}
      </p>
      {podeEditar ? (
        <Button type="button" size="sm" variant="outline" onClick={onMover}>
          <Move />
          {objeto.pos ? "Mover no mapa" : "Pôr no mapa"}
        </Button>
      ) : null}
    </section>
  );
}
