"use client";

import * as React from "react";

import { Skeleton } from "@/components/ui/skeleton";
import {
  formatarBRL,
  formatarData,
  formatarMesAno,
  formatarQuantidade,
} from "@/lib/formatadores";
import { carregarFichaEquipamento } from "@/modules/mapa/actions";
import type { FichaNumeros } from "@/modules/mapa/tipos";

/**
 * Os números da máquina na ficha (pedido do Tiago, 15/10/2026): último abastecimento, consumo dos
 * últimos 30 dias (só máquina própria), última manutenção (OS) e o gasto em manutenção pelo
 * Financeiro (rateio no centro de custo da máquina, categorias de manutenção) desde sempre, nos
 * últimos 12 meses, no ano e no mês passado. Carrega quando a ficha abre; o pai monta com
 * `key` = id da máquina, então cada máquina começa do zero.
 *
 * Ao lado do Financeiro, o custo das OS concluídas (16/10/2026): na US-001 o Financeiro dava
 * R$ 0,00 com três OS somando R$ 10.612,97. As fontes podem se sobrepor (a peça da OS pode ter sido
 * paga no Financeiro), então ficam em blocos separados, sem total somado.
 */

const ROTULO_STATUS_OS: Record<string, string> = {
  aberta: "aberta",
  concluida: "concluída",
  cancelada: "cancelada",
};

function Linha({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-detalhe">
      <span className="shrink-0 text-muted-foreground">{rotulo}</span>
      <span className="text-right text-foreground">{children}</span>
    </div>
  );
}

const litros = (n: number) => `${formatarQuantidade(n)} L`;

export function NumerosEquipamento({
  equipamentoId,
  propria,
}: {
  equipamentoId: string;
  propria: boolean;
}) {
  const [resultado, setResultado] = React.useState<
    { ficha: FichaNumeros } | { erro: string } | null
  >(null);

  React.useEffect(() => {
    let vivo = true;
    void carregarFichaEquipamento(equipamentoId).then((r) => {
      if (vivo)
        setResultado("erro" in r ? { erro: r.erro } : { ficha: r.ficha });
    });
    return () => {
      vivo = false;
    };
  }, [equipamentoId]);

  if (!resultado)
    return (
      <div className="flex flex-col gap-1.5" aria-busy="true">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
      </div>
    );
  if ("erro" in resultado)
    return (
      <p className="text-detalhe text-muted-foreground">{resultado.erro}</p>
    );

  const {
    ultimoAbastecimento: abast,
    consumo30Dias: consumo,
    ultimaManutencao: os,
    gastoManutencao: gasto,
    custoOs,
  } = resultado.ficha;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Linha rotulo="Último abastecimento">
          {abast
            ? `${formatarData(abast.data)} · ${litros(abast.litros)} · ${formatarBRL(abast.valor)}`
            : "–"}
        </Linha>
        {propria ? (
          <Linha rotulo="Combustível em 30 dias">
            {consumo.abastecimentos > 0
              ? `${litros(consumo.litros)} · ${formatarBRL(consumo.valor)}`
              : "nenhum abastecimento"}
          </Linha>
        ) : null}
        <Linha rotulo="Última manutenção">
          {os
            ? `${os.numero} · ${os.tipo} · ${ROTULO_STATUS_OS[os.status] ?? os.status}${
                os.conclusao
                  ? ` em ${formatarData(os.conclusao)}`
                  : os.abertura
                    ? ` desde ${formatarData(os.abertura)}`
                    : ""
              }${os.custo ? ` · ${formatarBRL(os.custo)}` : ""}`
            : "–"}
        </Linha>
        {os?.descricao ? (
          <p className="line-clamp-2 text-legenda text-muted-foreground">
            {os.descricao}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-legenda font-medium text-muted-foreground">
          Gasto em manutenção (Financeiro)
        </span>
        {gasto.temCentro ? (
          <>
            <Linha rotulo="Desde sempre">{formatarBRL(gasto.total)}</Linha>
            <Linha rotulo="Últimos 12 meses">
              {formatarBRL(gasto.ultimos12Meses)}
            </Linha>
            <Linha rotulo={`Em ${gasto.anoRef}`}>
              {formatarBRL(gasto.ano)}
            </Linha>
            <Linha rotulo={`Em ${formatarMesAno(gasto.mesPassadoRef)}`}>
              {formatarBRL(gasto.mesPassado)}
            </Linha>
          </>
        ) : (
          <p className="text-detalhe text-muted-foreground">
            A máquina não tem centro de custo no Financeiro.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-legenda font-medium text-muted-foreground">
          Custo das OS concluídas (Manutenção)
        </span>
        {custoOs.quantidade > 0 ? (
          <>
            <Linha rotulo={`Desde sempre (${custoOs.quantidade} OS)`}>
              {formatarBRL(custoOs.total)}
            </Linha>
            <Linha rotulo="Últimos 12 meses">
              {formatarBRL(custoOs.ultimos12Meses)}
            </Linha>
            <Linha rotulo={`Em ${gasto.anoRef}`}>
              {formatarBRL(custoOs.ano)}
            </Linha>
            <Linha rotulo={`Em ${formatarMesAno(gasto.mesPassadoRef)}`}>
              {formatarBRL(custoOs.mesPassado)}
            </Linha>
          </>
        ) : (
          <p className="text-detalhe text-muted-foreground">
            Nenhuma OS concluída.
          </p>
        )}
        <p className="text-legenda text-muted-foreground">
          Fontes diferentes: a mesma peça pode estar nas duas, por isso não se
          somam.
        </p>
      </div>
    </div>
  );
}
