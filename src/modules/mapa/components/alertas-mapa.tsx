"use client";

import * as React from "react";
import { Info, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { COR_ESTADO, ORDEM_ESTADOS, type Rgb } from "@/modules/mapa/rotulos";
import { ROTULO_ESTADO, type AlertaMapa } from "@/modules/mapa/tipos";

/**
 * Faixa de alertas e legenda do mapa (17/10/2026, análise do módulo). Os alertas já eram
 * calculados de hora em hora pelo cron (`fn_mapa_alertas_recalcular`) e ninguém lia; agora o botão
 * no canto do mapa mostra quantos estão abertos e tocar num deles leva até a máquina, o tanque ou
 * a carreta. A legenda explica as cores e os desenhos.
 */

const CLASSE_BOTAO =
  "pointer-events-auto bg-background/95 backdrop-blur max-sm:size-8 max-sm:px-0";

/** Ordem de gravidade: o que para a obra primeiro, o que custa caixa depois. */
const PESO_TIPO: Record<string, number> = {
  quebrado_obra: 0,
  esperando_conserto: 1,
  conserto_atrasado: 2,
  frete_sem_chegada: 3,
  tanque_minimo: 4,
  locacao_vencendo: 5,
  parado_patio: 6,
  diarias_a_pagar: 7,
};

export function ordenarAlertas(alertas: readonly AlertaMapa[]): AlertaMapa[] {
  return [...alertas].sort(
    (a, b) =>
      (PESO_TIPO[a.tipo] ?? 9) - (PESO_TIPO[b.tipo] ?? 9) ||
      a.mensagem.localeCompare(b.mensagem, "pt-BR"),
  );
}

export interface AlertasMapaProps {
  alertas: readonly AlertaMapa[];
  /** Leva até o alvo do alerta; devolve false quando o alvo não está no mapa. */
  onIrPara: (alerta: AlertaMapa) => boolean;
}

export function AlertasMapa({ alertas, onIrPara }: AlertasMapaProps) {
  const [aberto, setAberto] = React.useState(false);
  const ordenados = React.useMemo(() => ordenarAlertas(alertas), [alertas]);
  if (alertas.length === 0) return null;
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="xs"
          variant="outline"
          className={cn(
            CLASSE_BOTAO,
            "border-status-pendente/60 text-status-pendente",
          )}
          title="Alertas abertos do mapa"
        >
          <TriangleAlert className="size-3" />
          <span className="tabular-nums">{alertas.length}</span>
          <span className="max-sm:sr-only">
            {alertas.length === 1 ? "alerta" : "alertas"}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-1">
        <p className="px-2 pt-1.5 pb-1 text-legenda text-muted-foreground">
          Recalculados de hora em hora. Toque para ir até o item.
        </p>
        <ul className="max-h-80 overflow-y-auto">
          {ordenados.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                className="w-full rounded-sm px-2 py-1.5 text-left text-detalhe hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  if (onIrPara(a)) setAberto(false);
                }}
              >
                {a.mensagem}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function Amostra({ cor, forma }: { cor: Rgb; forma: "rotulo" | "linha" | "circulo" }) {
  const rgb = `rgb(${cor.join(",")})`;
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block shrink-0",
        forma === "rotulo" && "h-3 w-5 rounded-sm",
        forma === "linha" && "h-1 w-5 rounded-full",
        forma === "circulo" && "size-3 rounded-full border-2",
      )}
      style={
        forma === "circulo"
          ? { borderColor: rgb, backgroundColor: `rgba(${cor.join(",")},0.15)` }
          : { backgroundColor: rgb }
      }
    />
  );
}

/** Cores e desenhos do mapa, iguais aos de camadas.ts e rotulos.ts. */
export function LegendaMapa() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="xs"
          variant="outline"
          className={CLASSE_BOTAO}
          title="O que cada cor e desenho quer dizer"
        >
          <Info className="size-3" />
          <span className="max-sm:sr-only">Legenda</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 text-detalhe">
        <p className="mb-1.5 font-medium">Estado da máquina (cor do rótulo)</p>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
          {ORDEM_ESTADOS.filter((e) => e !== "sem_posicao").map((e) => (
            <li key={e} className="flex items-center gap-1.5">
              <Amostra cor={COR_ESTADO[e]} forma="rotulo" />
              {ROTULO_ESTADO[e]}
            </li>
          ))}
        </ul>
        <p className="mt-3 mb-1.5 font-medium">No mapa</p>
        <ul className="flex flex-col gap-1">
          <li className="flex items-center gap-1.5">
            <Amostra cor={[205, 205, 205]} forma="rotulo" />
            Miniatura acinzentada: parada; escura: fora de funcionamento
          </li>
          <li className="flex items-center gap-1.5">
            <Amostra cor={[255, 230, 150]} forma="rotulo" />
            Miniatura amarelada com anel: selecionada
          </li>
          <li className="flex items-center gap-1.5">
            <Amostra cor={[62, 119, 68]} forma="linha" />
            Traçado da obra, com os marcos de km
          </li>
          <li className="flex items-center gap-1.5">
            <Amostra cor={[69, 70, 75]} forma="linha" />
            Rota de frete (carreta andando pela estimativa)
          </li>
          <li className="flex items-center gap-1.5">
            <Amostra cor={[62, 119, 68]} forma="circulo" />
            Pino da obra (nome em verde)
          </li>
          <li className="flex items-center gap-1.5">
            <Amostra cor={[42, 120, 214]} forma="circulo" />
            Local e o raio dele (nome em azul)
          </li>
          <li className="flex items-center gap-1.5">
            <Amostra cor={[207, 148, 58]} forma="rotulo" />
            Tanque, pilha (cone) e depósito (caixa)
          </li>
        </ul>
        <p className="mt-3 text-legenda text-muted-foreground">
          Os nomes aparecem conforme aproxima: obras primeiro, máquinas por
          último.
        </p>
      </PopoverContent>
    </Popover>
  );
}
