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
  type MudancaPessoa,
} from "@/modules/mapa/centros-pessoa";

/**
 * Dias da pessoa na ficha (pedido do Tiago, 17/10/2026): trabalhando ou parado (marcado aqui),
 * o centro de custo de agora e o dia em que começou nele, cada troca de centro com a data, os dias
 * trabalhados e parados do mês, os dias por centro e os períodos dos últimos 90 dias. O mesmo
 * "desde quando" e as trocas do local de trabalho saem em `HistoricoLocal`, embaixo do campo do
 * local. Parado vai para Pessoal Sem Alocação; trabalhando, para o centro escolhido na ficha ou,
 * sem ele, para a obra onde a pessoa está no mapa. Não toca o RH.
 */

const dias = (n: number) => (n === 1 ? "1 dia" : `${n} dias`);

const ROTULO_ESTADO: Record<EstadoPessoa, string> = {
  trabalhando: "Trabalhando",
  parado: "Parado",
};

type Resultado = { centros: Centros } | { erro: string } | null;

export interface DiasPessoa {
  resultado: Resultado;
  recarregar: () => void;
}

/**
 * Carrega os dias da pessoa uma vez para a ficha inteira. `lugar` muda quando a pessoa se mexe
 * no mapa (o centro e o local mudam junto), e aí relê.
 */
export function useDiasPessoa(colaboradorId: string, lugar: string): DiasPessoa {
  const [resultado, setResultado] = React.useState<Resultado>(null);
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

  const recarregar = React.useCallback(() => setRecarga((v) => v + 1), []);
  return { resultado, recarregar };
}

/** "Desde 16/10/2026" do local e as trocas de local, embaixo do campo "Local de trabalho". */
export function HistoricoLocal({ dados }: { dados: DiasPessoa }) {
  const r = dados.resultado;
  if (!r || "erro" in r || !r.centros.localAtual) return null;
  const { localAtual, mudancasLocal } = r.centros;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-legenda text-muted-foreground">
        {localAtual.nome ? `Neste local desde ` : `Sem local desde `}
        {formatarData(localAtual.desde)}
      </span>
      <ListaMudancas mudancas={mudancasLocal} vazio="Sem local" />
    </div>
  );
}

export function CentrosPessoa({
  colaboradorId,
  podeEditar,
  relatorioHref,
  dados,
}: {
  colaboradorId: string;
  podeEditar: boolean;
  /** Relatório mensal; nulo sem permissão de ver os relatórios do Mapa. */
  relatorioHref: string | null;
  dados: DiasPessoa;
}) {
  const [gravando, setGravando] = React.useState(false);
  const { resultado, recarregar } = dados;

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
    recarregar();
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

/**
 * As trocas, a mais nova primeiro: "20/10/2026 · 009 (antes: Pessoal Sem Alocação)". A última é o
 * primeiro dia registrado. Com uma linha só não há troca, e o "desde" já diz tudo.
 */
function ListaMudancas({
  mudancas,
  vazio,
}: {
  mudancas: MudancaPessoa[];
  vazio: string;
}) {
  if (mudancas.length < 2) return null;
  return (
    <ul className="flex flex-col gap-0.5 border-l border-border pl-2 text-legenda">
      {mudancas.map((m) => (
        <li key={m.data} className="flex flex-col">
          <span>
            <span className="tabular-nums">{formatarData(m.data)}</span> ·{" "}
            {m.nome || vazio}
          </span>
          <span className="text-muted-foreground">
            {m.antes === null
              ? "início do registro"
              : `antes: ${m.antes || vazio}`}
          </span>
        </li>
      ))}
    </ul>
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

      {c.centroAtual ? (
        <div className="flex flex-col gap-0.5 text-detalhe">
          <span className="text-legenda text-muted-foreground">Centro de custo</span>
          <span className="font-medium text-foreground">{c.centroAtual.centroNome}</span>
          <span className="text-muted-foreground">
            desde {formatarData(c.centroAtual.desde)}
            {c.atual ? ` · ${rotuloMotivoPessoa(c.atual.motivo)}` : ""}
          </span>
          <ListaMudancas mudancas={c.mudancasCentro} vazio="–" />
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
