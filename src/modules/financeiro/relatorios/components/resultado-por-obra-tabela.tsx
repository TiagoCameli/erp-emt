"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable, MoneyText } from "@/components/canonicos";
import { formatarPercentual } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import { BarraDivergente } from "@/modules/financeiro/relatorios/components/movimento";
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
/**
 * Quem deu lucro e quem está no vermelho na janela escolhida, do maior para o
 * menor resultado, com a barra saindo do zero. É a resposta da tela antes da
 * tabela: a tabela tem as colunas, o quadro tem a ordem.
 */
function QuadroDoResultado({ obras, janela }: { obras: readonly LinhaObra[]; janela: Janela }) {
  const linhas = [...obras]
    .filter((o) => Math.round(o[janela].resultado * 100) !== 0)
    .sort((a, b) => b[janela].resultado - a[janela].resultado);
  if (linhas.length === 0) return null;
  const maximo = Math.max(...linhas.map((o) => Math.abs(o[janela].resultado)));
  return (
    <ol aria-label="Resultado de cada obra" className="flex flex-col gap-1.5">
      {linhas.map((o, i) => (
        <li
          // A chave leva a janela: trocar de janela refaz o crescimento das barras.
          key={`${janela}-${o.centroId}`}
          className="grid grid-cols-[minmax(0,1fr)_8.5rem] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(10rem,16rem)_minmax(0,1fr)_8.5rem]"
        >
          <span className="truncate text-detalhe text-foreground" title={o.nome}>
            {o.nome}
          </span>
          <BarraDivergente
            valor={o[janela].resultado}
            maximo={maximo}
            ordem={i}
            className="col-span-2 row-start-2 sm:col-span-1 sm:col-start-2 sm:row-start-1"
          />
          <MoneyText
            valor={o[janela].resultado}
            className={cn("text-right text-detalhe", classeDoSinal(sinalDoResultado(o[janela].resultado)))}
          />
        </li>
      ))}
    </ol>
  );
}

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
      <QuadroDoResultado obras={obras} janela={janela} />
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
