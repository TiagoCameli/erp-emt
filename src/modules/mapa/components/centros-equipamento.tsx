"use client";

import * as React from "react";
import Link from "next/link";

import { toast } from "@/components/canonicos/toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { formatarData } from "@/lib/formatadores";
import {
  carregarCentrosEquipamento,
  marcarVariosCentros,
} from "@/modules/mapa/actions";
import {
  rotuloMotivoCentro,
  type CentrosEquipamento as Centros,
} from "@/modules/mapa/centros";

/**
 * Centro de custo da máquina na ficha (pedido do Tiago, 16/10/2026): onde ela está agora e desde
 * quando, os dias do mês por centro e os períodos dos últimos 90 dias. O centro sai sozinho da obra
 * e do estado marcados no mapa; a única coisa que se marca aqui é "atende vários centros" (os
 * dias vão para Equipamento Sem Alocação, rateado como o Escritório Central). O pai monta com
 * `key` = id da máquina.
 */

const dias = (n: number) => (n === 1 ? "1 dia" : `${n} dias`);

export function CentrosEquipamento({
  equipamentoId,
  podeEditar,
  relatorioHref,
}: {
  equipamentoId: string;
  podeEditar: boolean;
  /** Relatório mensal; nulo sem permissão de ver os relatórios do Mapa. */
  relatorioHref: string | null;
}) {
  const [resultado, setResultado] = React.useState<
    { centros: Centros } | { erro: string } | null
  >(null);
  const [gravando, setGravando] = React.useState(false);
  const [versao, setVersao] = React.useState(0);

  React.useEffect(() => {
    let vivo = true;
    void carregarCentrosEquipamento(equipamentoId).then((r) => {
      if (vivo)
        setResultado("erro" in r ? { erro: r.erro } : { centros: r.centros });
    });
    return () => {
      vivo = false;
    };
  }, [equipamentoId, versao]);

  async function alternar(valor: boolean) {
    setGravando(true);
    const r = await marcarVariosCentros({ equipamentoId, valor });
    setGravando(false);
    if ("erro" in r) {
      toast.error(r.erro);
      return;
    }
    toast.success(
      valor
        ? "Os dias desta máquina vão para Equipamento Sem Alocação"
        : "Os dias desta máquina voltam para a obra",
    );
    setVersao((v) => v + 1);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-legenda font-medium text-muted-foreground">
          Centro de custo
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
          onAlternar={alternar}
        />
      )}
    </div>
  );
}

function Conteudo({
  centros: c,
  podeEditar,
  gravando,
  onAlternar,
}: {
  centros: Centros;
  podeEditar: boolean;
  gravando: boolean;
  onAlternar: (valor: boolean) => void;
}) {
  const idSwitch = React.useId();
  return (
    <>
      {c.atual ? (
        <div className="flex flex-col text-detalhe">
          <span className="font-medium text-foreground">{c.atual.centroNome}</span>
          <span className="text-muted-foreground">
            {rotuloMotivoCentro(c.atual.motivo)} · desde{" "}
            {formatarData(c.atual.desde)}
          </span>
        </div>
      ) : (
        <p className="text-detalhe text-muted-foreground">
          Sem centro hoje: fora de funcionamento não conta dias.
        </p>
      )}

      {podeEditar ? (
        <label
          htmlFor={idSwitch}
          className="flex items-center justify-between gap-3 text-detalhe"
        >
          <span>
            Atende vários centros
            <span className="block text-legenda text-muted-foreground">
              Os dias vão para Equipamento Sem Alocação
            </span>
          </span>
          <Switch
            id={idSwitch}
            checked={c.variosCentros}
            disabled={gravando}
            onCheckedChange={onAlternar}
          />
        </label>
      ) : c.variosCentros ? (
        <p className="text-detalhe text-muted-foreground">Atende vários centros.</p>
      ) : null}

      {c.mes.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          <span className="text-legenda text-muted-foreground">Neste mês</span>
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
                  {dias(p.dias)} · {rotuloMotivoCentro(p.motivo)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}
