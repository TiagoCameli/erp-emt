"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable, MoneyText } from "@/components/canonicos";
import { formatarPercentual } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import { classeDoSinal, sinalDoResultado } from "@/modules/financeiro/relatorios/relatorios";
import type {
  Janela,
  LinhaObra,
  Valores,
} from "@/modules/financeiro/relatorios/resultado-por-obra";

/** Margem em pontos, ou traço sem receita: zero se leria como "não sobrou nada". */
function Margem({ valor, forte }: { valor: number | null; forte?: boolean }) {
  return (
    <span className={cn("tabular-nums", forte && "font-semibold")}>
      {valor === null ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        formatarPercentual(valor, 1)
      )}
    </span>
  );
}

function Resultado({ valor, forte }: { valor: number; forte?: boolean }) {
  return (
    <MoneyText
      valor={valor}
      className={cn(classeDoSinal(sinalDoResultado(valor)), forte && "font-semibold")}
    />
  );
}

type Campo = "receita" | "direto" | "indireto" | "resultado" | "margem";

const ROTULO_CAMPO: Record<Campo, string> = {
  receita: "Receita líquida",
  direto: "Custo direto",
  indireto: "Indireto",
  resultado: "Resultado",
  margem: "Margem",
};

function coluna(j: Janela, campo: Campo, sufixo: string): ColumnDef<LinhaObra, unknown> {
  const header = `${ROTULO_CAMPO[campo]}${sufixo}`;
  return {
    id: `${j}-${campo}`,
    // Sem receita não há margem: vai para o fim da ordenação, não para o zero.
    accessorFn: (l) => l[j][campo] ?? undefined,
    sortUndefined: "last",
    header,
    size: campo === "margem" ? 110 : 150,
    meta: {
      alinharDireita: true,
      atomico: true,
      rotulo: header,
      celular: campo === "resultado" && j !== "inicio" ? "valor" : undefined,
    },
    cell: ({ row }) => {
      const v = row.original[j];
      if (campo === "margem") return <Margem valor={v.margem} />;
      if (campo === "resultado") return <Resultado valor={v.resultado} />;
      return <MoneyText valor={v[campo]} />;
    },
  };
}

function rodapeDe(j: Janela, total: Valores, campos: readonly Campo[]) {
  return Object.fromEntries(
    campos.map((campo) => [
      `${j}-${campo}`,
      campo === "margem" ? (
        <Margem valor={total.margem} forte />
      ) : campo === "resultado" ? (
        <Resultado valor={total.resultado} forte />
      ) : (
        <MoneyText valor={total[campo]} className="font-semibold" />
      ),
    ]),
  );
}

const CAMPOS: readonly Campo[] = ["receita", "direto", "indireto", "resultado", "margem"];

/**
 * A tabela do centro do Resultado por obra: uma linha por obra, com receita,
 * custo direto, indireto rateado, resultado e margem na janela escolhida, e o
 * resultado desde o início sempre ao lado.
 *
 * A janela abre no ANO até o mês: a receita chega aos saltos, por medição, e o
 * resultado de um mês sozinho pode ser só o mês sem medição. O mês e a história
 * inteira ficam a um clique.
 */
export function ResultadoPorObraTabela({
  obras,
  total,
  rotulos,
}: {
  obras: readonly LinhaObra[];
  total: Record<Janela, Valores>;
  /** Como cada janela se chama na tela ("setembro de 2026", "2026 até setembro"...). */
  rotulos: Record<Janela, string>;
}) {
  const [janela, setJanela] = React.useState<Janela>("ano");
  const dados = React.useMemo(() => [...obras], [obras]);

  const colunas = React.useMemo<ColumnDef<LinhaObra, unknown>[]>(() => {
    const nome: ColumnDef<LinhaObra, unknown> = {
      accessorKey: "nome",
      header: "Obra",
      size: 260,
      meta: { celular: "titulo" },
      cell: ({ row }) => <span className="text-foreground">{row.original.nome}</span>,
    };
    const principais = CAMPOS.map((c) => coluna(janela, c, ""));
    const historia =
      janela === "inicio"
        ? []
        : [coluna("inicio", "resultado", " desde o início"), coluna("inicio", "margem", " desde o início")];
    return [nome, ...principais, ...historia];
  }, [janela]);

  const opcoes: { valor: Janela; rotulo: string }[] = [
    { valor: "mes", rotulo: rotulos.mes },
    { valor: "ano", rotulo: rotulos.ano },
    { valor: "inicio", rotulo: rotulos.inicio },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Janela da tabela" className="flex flex-wrap gap-1">
        {opcoes.map((o) => (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={janela === o.valor}
            onClick={() => setJanela(o.valor)}
            className={cn(
              "foco-anel rounded-md border px-2.5 py-1 text-detalhe",
              janela === o.valor
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {o.rotulo}
          </button>
        ))}
      </div>
      <DataTable
        idTabela={`financeiro.relatorios.resultado-obra.${janela}`}
        columns={colunas}
        data={dados}
        idDaLinha={(l) => l.centroId}
        semPaginacao
        rodape={{
          nome: <span className="font-semibold text-foreground">Obras</span>,
          ...rodapeDe(janela, total[janela], CAMPOS),
          ...(janela === "inicio" ? {} : rodapeDe("inicio", total.inicio, ["resultado", "margem"])),
        }}
      />
    </div>
  );
}
