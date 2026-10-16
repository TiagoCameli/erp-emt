"use client";

import * as React from "react";
import { Compass, Move, RotateCcw, RotateCw, X } from "lucide-react";

import { InputQuantidade } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { CASAS_TAXA } from "@/lib/casas-decimais";
import { normalizarNumeroDigitado } from "@/lib/numero-digitado";
import type { LinhaFicha, ObjetoMapa } from "@/modules/mapa/objetos";

/**
 * Ficha do tanque, pilha ou depósito tocado no mapa (pelo nome) ou escolhido na lista "Sem lugar":
 * o que é, o que o cadastro diz dele (material e saldo da pilha, conteúdo e nível do tanque, local)
 * e "Mover no mapa" (ou "Pôr no mapa", quando ainda não tem lugar). O cadastro continua no
 * Estoque.
 *
 * Depósito: "Tamanho no mapa" (16/10/2026, "deixa eu poder escolher o tamanho dele"), em metros e
 * em tamanho real.
 */

export interface TamanhoDeposito {
  largura: number;
  comprimento: number;
  altura: number;
}

/** "12,5" para 12.5; vazio ou inválido, null. */
function metros(texto: string): number | null {
  const n = normalizarNumeroDigitado(texto, CASAS_TAXA);
  return n === null ? null : Number(n.replace(",", "."));
}

const paraTexto = (n: number) => String(n).replace(".", ",");

function TamanhoNoMapa({
  objeto,
  onSalvar,
}: {
  objeto: ObjetoMapa;
  onSalvar: (t: TamanhoDeposito) => Promise<boolean>;
}) {
  const [largura, setLargura] = React.useState(paraTexto(objeto.largura));
  const [comprimento, setComprimento] = React.useState(
    paraTexto(objeto.comprimento),
  );
  const [altura, setAltura] = React.useState(paraTexto(objeto.altura));
  const [salvando, setSalvando] = React.useState(false);
  const t = {
    largura: metros(largura),
    comprimento: metros(comprimento),
    altura: metros(altura),
  };
  const valido =
    t.largura !== null &&
    t.largura > 0 &&
    t.comprimento !== null &&
    t.comprimento > 0 &&
    t.altura !== null &&
    t.altura > 0;
  const mudou =
    t.largura !== objeto.largura ||
    t.comprimento !== objeto.comprimento ||
    t.altura !== objeto.altura;
  const campos: [string, string, (v: string) => void][] = [
    ["Largura", largura, setLargura],
    ["Comprimento", comprimento, setComprimento],
    ["Altura", altura, setAltura],
  ];
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-legenda font-medium text-muted-foreground">
        Tamanho no mapa (m)
      </span>
      <div className="grid grid-cols-3 gap-2">
        {campos.map(([rotulo, valor, mudar]) => (
          <label key={rotulo} className="flex flex-col gap-1 text-legenda">
            <span className="text-muted-foreground">{rotulo}</span>
            <InputQuantidade
              valor={valor}
              onValorChange={mudar}
              disabled={salvando}
              ariaLabel={`${rotulo} do depósito em metros`}
            />
          </label>
        ))}
      </div>
      <Button
        type="button"
        size="sm"
        disabled={!valido || !mudou || salvando}
        onClick={async () => {
          if (!valido) return;
          setSalvando(true);
          try {
            await onSalvar({
              largura: t.largura!,
              comprimento: t.comprimento!,
              altura: t.altura!,
            });
          } finally {
            setSalvando(false);
          }
        }}
      >
        Salvar tamanho
      </Button>
    </div>
  );
}

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
  onSalvarTamanho,
  rumo = 0,
  onGirar,
  acoes = null,
}: {
  objeto: ObjetoMapa;
  linhas: LinhaFicha[];
  podeEditar: boolean;
  onFechar: () => void;
  onMover: () => void;
  onSalvarTamanho: (t: TamanhoDeposito) => Promise<boolean>;
  /** Rumo mostrado (com a prévia do giro), em graus. */
  rumo?: number;
  /** Gira o depósito: graus a somar; null volta ao norte. */
  onGirar?: (delta: number | null) => void;
  /** Botões do módulo dono do objeto (na pilha: entrada avulsa e saída do Estoque). */
  acoes?: React.ReactNode;
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
      {podeEditar && objeto.alvo === "deposito" ? (
        <TamanhoNoMapa objeto={objeto} onSalvar={onSalvarTamanho} />
      ) : null}
      {podeEditar && objeto.alvo === "deposito" && objeto.pos && onGirar ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-legenda font-medium text-muted-foreground">
            Girar no mapa ·{" "}
            <span className="tabular-nums">{Math.round(rumo)}°</span>
          </span>
          <div className="flex gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onGirar(-15)}
              aria-label="Girar 15° para a esquerda"
              title="Girar 15° para a esquerda"
            >
              <RotateCcw />
              15°
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onGirar(15)}
              aria-label="Girar 15° para a direita"
              title="Girar 15° para a direita"
            >
              <RotateCw />
              15°
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onGirar(null)}
              disabled={rumo === 0}
              title="Voltar ao norte"
            >
              <Compass />
              Norte
            </Button>
          </div>
        </div>
      ) : null}
      {acoes}
      {podeEditar ? (
        <Button type="button" size="sm" variant="outline" onClick={onMover}>
          <Move />
          {objeto.pos ? "Mover no mapa" : "Pôr no mapa"}
        </Button>
      ) : null}
    </section>
  );
}
