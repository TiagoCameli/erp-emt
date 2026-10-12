"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable, MoneyText } from "@/components/canonicos";
import {
  rotuloTipoSocioLigada,
  type SocioLigadaLinha,
} from "@/modules/financeiro/relatorios/socios-ligadas";

interface SociosLigadasTabelaProps {
  ano: number;
  doAno: SocioLigadaLinha[];
  acumulado: SocioLigadaLinha[];
}

/** A linha do acumulado com o ano corrente do mesmo centro ao lado. */
interface LinhaSocio extends SocioLigadaLinha {
  enviadoAno: number;
  devolvidoAno: number;
}

/** Soma em centavos: a linha de total não pode errar o centavo. */
function somar(linhas: SocioLigadaLinha[], campo: "enviado" | "devolvido" | "saldo"): number {
  return linhas.reduce((s, l) => s + Math.round(l[campo] * 100), 0) / 100;
}

function colunaValor(
  id: keyof LinhaSocio & string,
  header: string,
  forte = false,
): ColumnDef<LinhaSocio, unknown> {
  return {
    accessorKey: id,
    header,
    size: 160,
    meta: { alinharDireita: true, atomico: true, rotulo: header },
    cell: ({ row }) => (
      <MoneyText
        valor={row.original[id] as number}
        className={forte ? "font-medium" : undefined}
      />
    ),
  };
}

/**
 * Um centro por linha, com o ano corrente e o acumulado lado a lado. O
 * acumulado do mútuo é o que a empresa ligada deve hoje; o da distribuição é
 * quanto cada sócio já tirou.
 */
export function SociosLigadasTabela({ ano, doAno, acumulado }: SociosLigadasTabelaProps) {
  const linhas = React.useMemo<LinhaSocio[]>(() => {
    const doAnoPorCentro = new Map(doAno.map((l) => [l.centroId, l]));
    return acumulado.map((l) => {
      const a = doAnoPorCentro.get(l.centroId);
      return { ...l, enviadoAno: a?.enviado ?? 0, devolvidoAno: a?.devolvido ?? 0 };
    });
  }, [doAno, acumulado]);

  const colunas = React.useMemo<ColumnDef<LinhaSocio, unknown>[]>(
    () => [
      {
        accessorKey: "centro",
        header: "Centro",
        size: 260,
        meta: { celular: "titulo" },
        cell: ({ row }) => (
          <>
            {row.original.centro}
            {row.original.ativo ? null : <span className="text-muted-foreground"> (inativo)</span>}
          </>
        ),
      },
      {
        id: "tipo",
        accessorFn: (l) => rotuloTipoSocioLigada(l.tipo),
        header: "Tipo",
        size: 180,
        cell: ({ row }) => (
          <span className="text-muted-foreground">{rotuloTipoSocioLigada(row.original.tipo)}</span>
        ),
      },
      colunaValor("enviadoAno", `Enviado em ${ano}`),
      colunaValor("devolvidoAno", `Devolvido em ${ano}`),
      colunaValor("enviado", "Enviado (acumulado)"),
      colunaValor("devolvido", "Devolvido (acumulado)"),
      {
        ...colunaValor("saldo", "Saldo (acumulado)", true),
        meta: { alinharDireita: true, atomico: true, rotulo: "Saldo (acumulado)", celular: "valor" },
      },
    ],
    [ano],
  );

  return (
    <DataTable
      idTabela="financeiro.relatorios.socios-ligadas"
      columns={colunas}
      data={linhas}
      idDaLinha={(l) => l.centroId}
      semPaginacao
      rodape={{
        centro: <span className="font-semibold">Total</span>,
        enviadoAno: <MoneyText valor={somar(doAno, "enviado")} className="font-semibold" />,
        devolvidoAno: <MoneyText valor={somar(doAno, "devolvido")} className="font-semibold" />,
        enviado: <MoneyText valor={somar(acumulado, "enviado")} className="font-semibold" />,
        devolvido: <MoneyText valor={somar(acumulado, "devolvido")} className="font-semibold" />,
        saldo: <MoneyText valor={somar(acumulado, "saldo")} className="font-semibold" />,
      }}
    />
  );
}
