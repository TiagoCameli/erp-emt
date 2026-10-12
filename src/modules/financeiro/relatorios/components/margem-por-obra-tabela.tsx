"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable, MoneyText } from "@/components/canonicos";
import { formatarPercentual } from "@/lib/formatadores";
import type { MargemDaObra } from "@/modules/financeiro/relatorios/indireto-nos-relatorios";

/** Margem em pontos, ou traço sem receita: zero se leria como "não sobrou nada". */
function Margem({ valor, forte }: { valor: number | null; forte?: boolean }) {
  return (
    <span className={`tabular-nums ${forte ? "font-semibold" : ""}`}>
      {valor === null ? <span className="text-muted-foreground">—</span> : formatarPercentual(valor, 1)}
    </span>
  );
}

type CampoValor = "receita" | "custoDireto" | "indireto" | "resultadoCom";

function colunaValor(
  id: CampoValor,
  header: string,
  celular?: "valor",
): ColumnDef<MargemDaObra, unknown> {
  return {
    accessorKey: id,
    header,
    size: 150,
    meta: { alinharDireita: true, atomico: true, rotulo: header, celular },
    cell: ({ row }) => <MoneyText valor={row.original[id]} />,
  };
}

function colunaMargem(
  id: "margemSem" | "margemCom",
  header: string,
): ColumnDef<MargemDaObra, unknown> {
  return {
    id,
    // Sem receita não há margem: vai para o fim da ordenação, não para o zero.
    accessorFn: (l) => l[id] ?? undefined,
    sortUndefined: "last",
    header,
    size: 130,
    meta: { alinharDireita: true, atomico: true, rotulo: header },
    cell: ({ row }) => <Margem valor={row.original[id]} />,
  };
}

const COLUNAS: ColumnDef<MargemDaObra, unknown>[] = [
  {
    accessorKey: "nome",
    header: "Obra",
    size: 240,
    meta: { celular: "titulo" },
    cell: ({ row }) => <span className="text-foreground">{row.original.nome}</span>,
  },
  colunaValor("receita", "Receita líquida"),
  colunaValor("custoDireto", "Custo direto"),
  colunaValor("indireto", "Indireto"),
  colunaValor("resultadoCom", "Resultado", "valor"),
  colunaMargem("margemSem", "Margem sem indireto"),
  colunaMargem("margemCom", "Margem com indireto"),
];

/**
 * Margem por obra, sem e com o indireto rateado (PR 3, frente C).
 *
 * O resultado mostrado é o COM indireto, que é a pergunta do dono ("quanto a
 * obra deu de verdade"); a margem sem indireto fica ao lado para comparar. O
 * total soma em centavos para fechar com as linhas.
 */
export function MargemPorObraTabela({ linhas }: { linhas: readonly MargemDaObra[] }) {
  const soma = (campo: "receita" | "custoDireto" | "indireto" | "resultadoSem" | "resultadoCom") =>
    linhas.reduce((s, l) => s + Math.round(l[campo] * 100), 0);
  const receitaCent = soma("receita");
  const margem = (cent: number) => (receitaCent === 0 ? null : (cent / receitaCent) * 100);
  const dados = React.useMemo(() => [...linhas], [linhas]);

  return (
    <DataTable
      idTabela="financeiro.relatorios.custo-receita.margem-por-obra"
      columns={COLUNAS}
      data={dados}
      idDaLinha={(l) => l.centroId}
      semPaginacao
      rodape={{
        nome: <span className="font-semibold text-foreground">Total</span>,
        receita: <MoneyText valor={receitaCent / 100} className="font-semibold" />,
        custoDireto: <MoneyText valor={soma("custoDireto") / 100} className="font-semibold" />,
        indireto: <MoneyText valor={soma("indireto") / 100} className="font-semibold" />,
        resultadoCom: <MoneyText valor={soma("resultadoCom") / 100} className="font-semibold" />,
        margemSem: <Margem valor={margem(soma("resultadoSem"))} forte />,
        margemCom: <Margem valor={margem(soma("resultadoCom"))} forte />,
      }}
    />
  );
}
