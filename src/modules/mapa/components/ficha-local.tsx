"use client";

import * as React from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { rotuloTipoLocalidade } from "@/modules/mapa/rotulos";
import type { LocalidadeMapa } from "@/modules/mapa/tipos";

/**
 * A ficha do local tocado no mapa: o que está ali (tanques, depósitos) e o tamanho da área, que
 * decide até onde uma máquina solta "cai" no local (pátio = parado, oficina = conserto). O raio
 * muda no mapa enquanto a pessoa mexe (prévia) e só grava em "Salvar área".
 */

const RAIO_MIN = 10;
const RAIO_MAX = 5000;
/** O slider vai até 2 km (passo de 10 m); o campo aceita até 5 km. */
const SLIDER_MAX = 2000;

export function FichaLocal({
  local,
  itens,
  padraoM,
  podeEditar,
  salvando,
  onFechar,
  onPrevia,
  onSalvar,
}: {
  local: LocalidadeMapa;
  /** Tanques e depósitos ligados ao local. */
  itens: readonly string[];
  /** Raio quando o local não tem um próprio (configuração mapa.snap_local_m). */
  padraoM: number;
  podeEditar: boolean;
  salvando: boolean;
  onFechar: () => void;
  /** Raio em prévia no mapa; null tira a prévia. */
  onPrevia: (raioM: number | null) => void;
  /** null volta ao padrão. false = recusou (o toast já avisou). */
  onSalvar: (raioM: number | null) => Promise<boolean>;
}) {
  const atual = local.raioM ?? padraoM;
  const [raio, setRaio] = React.useState(atual);
  const [texto, setTexto] = React.useState(String(Math.round(atual)));
  const idRaio = React.useId();
  const mudou = Math.round(raio) !== Math.round(atual);

  const aplicar = (valor: number) => {
    const limitado = Math.min(RAIO_MAX, Math.max(RAIO_MIN, Math.round(valor)));
    setRaio(limitado);
    setTexto(String(limitado));
    onPrevia(limitado);
  };

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-corpo font-semibold">{local.nome}</p>
          <p className="text-detalhe text-muted-foreground">
            {rotuloTipoLocalidade(local.tipo)}
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

      {itens.length > 0 ? (
        <ul className="flex flex-col gap-0.5 text-detalhe">
          {itens.map((nome) => (
            <li key={nome} className="text-foreground">
              {nome}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-detalhe text-muted-foreground">
          Nenhum tanque ou depósito ligado a este local.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor={idRaio}>Área (raio)</Label>
          <span className="text-legenda text-muted-foreground">
            {local.raioM === null
              ? `padrão, ${Math.round(padraoM)} m`
              : "próprio"}
          </span>
        </div>
        <Slider
          value={[Math.min(raio, SLIDER_MAX)]}
          min={RAIO_MIN}
          max={SLIDER_MAX}
          step={10}
          disabled={!podeEditar || salvando}
          onValueChange={(v) => aplicar(v[0] ?? raio)}
          aria-label="Raio da área"
        />
        <div className="flex items-center gap-2">
          <Input
            id={idRaio}
            inputMode="numeric"
            value={texto}
            disabled={!podeEditar || salvando}
            onChange={(e) => setTexto(e.target.value.replace(/\D/g, ""))}
            onBlur={() => aplicar(Number(texto) || atual)}
            onKeyDown={(e) => {
              if (e.key === "Enter") aplicar(Number(texto) || atual);
            }}
            className="w-24"
          />
          <span className="text-detalhe text-muted-foreground">metros</span>
        </div>
      </div>

      {podeEditar ? (
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            size="sm"
            disabled={!mudou || salvando}
            onClick={async () => {
              if (await onSalvar(raio)) onPrevia(null);
            }}
          >
            Salvar área
          </Button>
          {mudou ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={salvando}
              onClick={() => {
                setRaio(atual);
                setTexto(String(Math.round(atual)));
                onPrevia(null);
              }}
            >
              Desfazer
            </Button>
          ) : null}
          {local.raioM !== null ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={salvando}
              onClick={async () => {
                if (await onSalvar(null)) {
                  setRaio(padraoM);
                  setTexto(String(Math.round(padraoM)));
                  onPrevia(null);
                }
              }}
            >
              Voltar ao padrão
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
