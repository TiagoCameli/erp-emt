"use client";

import * as React from "react";
import Link from "next/link";

import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatarData } from "@/lib/formatadores";
import {
  carregarCentrosColaborador,
  marcarEstadoPessoa,
} from "@/modules/mapa/actions";
import {
  rotuloMotivoPessoa,
  type CentrosColaborador as Centros,
  type EstadoPessoa,
} from "@/modules/mapa/centros-pessoa";

/**
 * Dias da pessoa na ficha (pedido do Tiago, 17/10/2026): trabalhando ou parado (marcado aqui),
 * o centro de agora e desde quando, os dias trabalhados e parados do mês, os dias por centro e os
 * períodos dos últimos 90 dias. Parado vai para Pessoal Sem Alocação; trabalhando, para o centro
 * escolhido na ficha ou, sem ele, para a obra onde a pessoa está no mapa. Não toca o RH. O pai
 * monta com `key` = id da pessoa e passa em `lugar` onde ela está (relê quando ela se mexe).
 */

const dias = (n: number) => (n === 1 ? "1 dia" : `${n} dias`);

const ROTULO_ESTADO: Record<EstadoPessoa, string> = {
  trabalhando: "Trabalhando",
  parado: "Parado",
};

export function CentrosPessoa({
  colaboradorId,
  podeEditar,
  relatorioHref,
  lugar = "",
}: {
  colaboradorId: string;
  podeEditar: boolean;
  /** Relatório mensal; nulo sem permissão de ver os relatórios do Mapa. */
  relatorioHref: string | null;
  /** Muda quando a pessoa troca de lugar (o centro pode mudar junto). */
  lugar?: string;
}) {
  const [resultado, setResultado] = React.useState<
    { centros: Centros } | { erro: string } | null
  >(null);
  const [gravando, setGravando] = React.useState(false);
  const [recarga, setRecarga] = React.useState(0);

  React.useEffect(() => {
    let vivo = true;
    void carregarCentrosColaborador(colaboradorId).then((r) => {
      if (vivo)
        setResultado("erro" in r ? { erro: r.erro } : { centros: r.centros });
    });
    return () => {
      vivo = false;
    };
  }, [colaboradorId, lugar, recarga]);

  async function marcar(estado: EstadoPessoa) {
    setGravando(true);
    const r = await marcarEstadoPessoa({ colaboradorId, estado });
    setGravando(false);
    if ("erro" in r) {
      toast.error(r.erro);
      return;
    }
    toast.success(
      estado === "parado"
        ? "Parado: os dias vão para Pessoal Sem Alocação"
        : "Trabalhando: os dias voltam para o centro da pessoa",
    );
    setRecarga((v) => v + 1);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-legenda font-medium text-muted-foreground">
          Dias e centro de custo
        </span>
        {relatorioHref ? (
          <Link
            href={relatorioHref}
            className="text-legenda text-primary underline-offset-2 hover:underline"
          >
            Ver relatório
          </Link>
        ) : null}
      </div>

      {!resultado ? (
        <div className="flex flex-col gap-1.5" aria-busy="true">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      ) : "erro" in resultado ? (
        <p className="text-detalhe text-muted-foreground">{resultado.erro}</p>
      ) : (
        <Conteudo
          centros={resultado.centros}
          podeEditar={podeEditar}
          gravando={gravando}
          onMarcar={marcar}
        />
      )}
    </div>
  );
}

function Conteudo({
  centros: c,
  podeEditar,
  gravando,
  onMarcar,
}: {
  centros: Centros;
  podeEditar: boolean;
  gravando: boolean;
  onMarcar: (estado: EstadoPessoa) => void;
}) {
  return (
    <>
      {podeEditar ? (
        <div className="grid grid-cols-2 gap-1" role="group" aria-label="Estado da pessoa">
          {(["trabalhando", "parado"] as const).map((e) => (
            <Button
              key={e}
              type="button"
              size="sm"
              variant={c.estado === e ? "default" : "outline"}
              aria-pressed={c.estado === e}
              disabled={gravando}
              onClick={() => {
                if (c.estado !== e) onMarcar(e);
              }}
            >
              {ROTULO_ESTADO[e]}
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-detalhe">{ROTULO_ESTADO[c.estado]}</p>
      )}

      {c.atual ? (
        <div className="flex flex-col text-detalhe">
          <span className="font-medium text-foreground">{c.atual.centroNome}</span>
          <span className="text-muted-foreground">
            {rotuloMotivoPessoa(c.atual.motivo)} · desde{" "}
            {formatarData(c.atual.desde)}
          </span>
        </div>
      ) : null}

      <div className="flex items-baseline justify-between gap-3 text-detalhe">
        <span className="text-muted-foreground">Neste mês</span>
        <span className="tabular-nums">
          {dias(c.trabalhados)} trabalhando · {dias(c.parados)} parado
        </span>
      </div>

      {c.mes.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          {c.mes.map((m) => (
            <div
              key={m.centroId}
              className="flex items-baseline justify-between gap-3 text-detalhe"
            >
              <span className="min-w-0 truncate">{m.centroNome}</span>
              <span className="shrink-0 tabular-nums">{dias(m.dias)}</span>
            </div>
          ))}
        </div>
      ) : null}

      {c.periodos.length > 0 ? (
        <details className="text-detalhe">
          <summary className="cursor-pointer text-legenda text-muted-foreground">
            Períodos (90 dias)
          </summary>
          <ul className="mt-1 flex flex-col gap-1">
            {c.periodos.map((p) => (
              <li key={`${p.centroId}-${p.motivo}-${p.de}`} className="flex flex-col">
                <span className="truncate">{p.centroNome}</span>
                <span className="text-legenda text-muted-foreground">
                  {formatarData(p.de)}
                  {p.ate !== p.de ? ` a ${formatarData(p.ate)}` : ""} ·{" "}
                  {dias(p.dias)} · {rotuloMotivoPessoa(p.motivo)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}
