"use client";

import * as React from "react";
import { MapPin, Pentagon, Route, Trash2, X } from "lucide-react";

import { ConfirmDialog } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import type { ObraMapa } from "@/modules/mapa/tipos";

/**
 * A ficha da obra tocada no mapa (pelo nome). Mostra como a obra está desenhada e deixa refazer:
 * pavimentação (trecho: início, curvas, fim), edificação (polígono de 4 cantos ou mais), mover o
 * ponto ou tirar a obra do mapa. O cadastro da obra continua no Cadastros.
 */

export interface DesenhoDaObra {
  trechos: number;
  areas: number;
}

export function FichaObra({
  obra,
  desenho,
  podeEditar,
  salvando,
  onFechar,
  onDesenhar,
  onMoverPonto,
  onTirar,
}: {
  obra: ObraMapa;
  desenho: DesenhoDaObra;
  podeEditar: boolean;
  salvando: boolean;
  onFechar: () => void;
  onDesenhar: (forma: "trecho" | "area") => void;
  onMoverPonto: () => void;
  /** false = recusou (o toast já avisou). */
  onTirar: () => Promise<boolean>;
}) {
  const [confirmandoTirar, setConfirmandoTirar] = React.useState(false);
  const comoEsta =
    desenho.trechos > 0
      ? `Pavimentação: ${desenho.trechos} ${desenho.trechos === 1 ? "trecho" : "trechos"}`
      : desenho.areas > 0
        ? "Edificação: área desenhada"
        : obra.pos
          ? "Só um ponto no mapa"
          : "Fora do mapa";

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-corpo font-semibold">{obra.nome}</p>
          <p className="text-detalhe text-muted-foreground">{comoEsta}</p>
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

      {podeEditar ? (
        <div className="flex flex-col gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={salvando}
            onClick={() => onDesenhar("trecho")}
            className="justify-start"
          >
            <Route />
            {desenho.trechos > 0
              ? "Redesenhar pavimentação"
              : "Desenhar pavimentação (início e fim)"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={salvando}
            onClick={() => onDesenhar("area")}
            className="justify-start"
          >
            <Pentagon />
            {desenho.areas > 0
              ? "Redesenhar edificação"
              : "Desenhar edificação (polígono)"}
          </Button>
          {desenho.trechos === 0 && desenho.areas === 0 ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={salvando}
              onClick={onMoverPonto}
              className="justify-start"
            >
              <MapPin />
              {obra.pos ? "Mover o ponto" : "Pôr um ponto no mapa"}
            </Button>
          ) : null}
          {obra.pos || desenho.trechos > 0 || desenho.areas > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={salvando}
              onClick={() => setConfirmandoTirar(true)}
              className="justify-start text-destructive"
            >
              <Trash2 />
              Tirar do mapa
            </Button>
          ) : null}
        </div>
      ) : null}

      {confirmandoTirar ? (
        <ConfirmDialog
          aberto
          onAbertoChange={(aberto) => {
            if (!aberto) setConfirmandoTirar(false);
          }}
          titulo={`Tirar ${obra.nome} do mapa?`}
          descricao="Some o ponto, os trechos e a área desta obra no mapa. O cadastro da obra e as máquinas não mudam."
          textoConfirmar="Tirar do mapa"
          variante="destrutivo"
          onConfirmar={onTirar}
        />
      ) : null}
    </section>
  );
}
