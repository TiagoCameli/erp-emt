"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ClipboardPaste, Plus, Trash2 } from "lucide-react";

import { DataTable, InputMoeda, MoneyText } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { paraNumero } from "@/modules/compras/ordens/calculo";
import { lerCronogramaColado, somarCentavos } from "@/modules/financeiro/dividas/calculo";

/** Uma linha em edição: o vencimento e as três colunas de valor como texto do InputMoeda. */
export interface LinhaEditavel {
  vencimento: string;
  valores: [string, string, string];
}

/** A linha na tabela: a posição (que numera a parcela) e as ações sobre ela. */
type LinhaTabela = LinhaEditavel & {
  indice: number;
  mudar: (parcial: Partial<LinhaEditavel>) => void;
  tirar: () => void;
};

/** Linha lida, com os valores em número, na ordem das colunas. */
export interface LinhaLida {
  vencimento: string;
  valores: [number, number, number];
}

function paraCampo(valor: number): string {
  return valor.toFixed(2).replace(".", ",");
}

export function linhaEditavel(vencimento: string, valores: [number, number, number]): LinhaEditavel {
  return { vencimento, valores: [paraCampo(valores[0]), paraCampo(valores[1]), paraCampo(valores[2])] };
}

/** As linhas preenchidas (com vencimento), em número. */
export function lerLinhas(linhas: readonly LinhaEditavel[]): LinhaLida[] {
  return linhas
    .filter((l) => l.vencimento !== "")
    .map((l) => ({
      vencimento: l.vencimento,
      valores: [paraNumero(l.valores[0]), paraNumero(l.valores[1]), paraNumero(l.valores[2])],
    }));
}

export interface CronogramaEditorProps {
  /** Rótulo das três colunas de valor (principal, juros, encargos; ou fundo comum, taxa, reserva). */
  colunas: [string, string, string];
  linhas: LinhaEditavel[];
  onLinhasChange: (linhas: LinhaEditavel[]) => void;
  /** A soma que a primeira coluna precisa fechar (o liberado, o saldo, o crédito). */
  alvo?: { rotulo: string; valor: number };
  disabled?: boolean;
}

/**
 * Tabela editável do cronograma: uma linha por parcela, digitada ou colada do
 * PDF do banco (vencimento e as três colunas, separadas por tab ou ponto e
 * vírgula). A conferência da soma fica embaixo, ANTES de salvar: o banco
 * recusa a soma errada, e aqui a diferença já aparece em reais.
 */
export function CronogramaEditor({ colunas, linhas, onLinhasChange, alvo, disabled }: CronogramaEditorProps) {
  const [colando, setColando] = React.useState(false);
  const [textoColado, setTextoColado] = React.useState("");
  const [errosColagem, setErrosColagem] = React.useState<string[]>([]);

  const lidas = lerLinhas(linhas);
  const somas = [0, 1, 2].map((i) => somarCentavos(lidas.map((l) => l.valores[i])));
  const diferenca = alvo ? somarCentavos([alvo.valor, -somas[0]]) : 0;

  // Cada linha leva as próprias ações, montadas com as linhas desta
  // renderização. Assim as colunas não dependem de `linhas` e não são recriadas
  // a cada tecla: coluna nova trocaria a função da célula, o React remontaria o
  // campo e o foco sairia no meio da digitação.
  const dados = React.useMemo<LinhaTabela[]>(
    () =>
      linhas.map((l, i) => ({
        ...l,
        indice: i,
        mudar: (parcial: Partial<LinhaEditavel>) =>
          onLinhasChange(linhas.map((outra, j) => (j === i ? { ...outra, ...parcial } : outra))),
        tirar: () => onLinhasChange(linhas.filter((_, j) => j !== i)),
      })),
    [linhas, onLinhasChange],
  );

  const [rotulo0, rotulo1, rotulo2] = colunas;
  // Sem ordenação: a ordem é a das parcelas. A linha não tem id próprio (é
  // digitada), então a posição identifica a linha, como antes.
  const colunasTabela = React.useMemo<ColumnDef<LinhaTabela, unknown>[]>(() => {
    const rotulos = [rotulo0, rotulo1, rotulo2] as const;

    const valores: ColumnDef<LinhaTabela, unknown>[] = [0, 1, 2].map((c) => ({
      id: `valor${c}`,
      header: rotulos[c],
      size: 150,
      enableSorting: false,
      // O campo monta o próprio layout; o corte de uma linha cortaria o anel de foco.
      meta: { alinharDireita: true, naoTruncar: true, rotulo: rotulos[c] },
      cell: ({ row }) => {
        const l = row.original;
        return (
          <InputMoeda
            ariaLabel={`${rotulos[c]} da parcela ${l.indice + 1}`}
            valor={l.valores[c]}
            onValorChange={(v) => {
              const novos = [...l.valores] as LinhaEditavel["valores"];
              novos[c] = v;
              l.mudar({ valores: novos });
            }}
            disabled={disabled}
            className="h-8 text-right"
          />
        );
      },
    }));

    return [
      {
        id: "numero",
        header: "Nº",
        size: 60,
        enableSorting: false,
        meta: { alinharDireita: true, atomico: true, rotulo: "Nº", celular: "titulo" },
        cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{row.original.indice + 1}</span>,
      },
      {
        id: "vencimento",
        header: "Vencimento",
        size: 160,
        enableSorting: false,
        meta: { naoTruncar: true, rotulo: "Vencimento" },
        cell: ({ row }) => (
          <Input
            type="date"
            aria-label={`Vencimento da parcela ${row.original.indice + 1}`}
            value={row.original.vencimento}
            onChange={(e) => row.original.mudar({ vencimento: e.target.value })}
            disabled={disabled}
            className="h-8"
          />
        ),
      },
      ...valores,
      ...(disabled
        ? []
        : [
            {
              id: "remover",
              header: "",
              size: 48,
              enableSorting: false,
              meta: { fixa: true, naoTruncar: true, rotulo: "Tirar parcela" },
              cell: ({ row }) => (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  aria-label={`Tirar a parcela ${row.original.indice + 1}`}
                  onClick={row.original.tirar}
                >
                  <Trash2 />
                </Button>
              ),
            } satisfies ColumnDef<LinhaTabela, unknown>,
          ]),
    ];
  }, [rotulo0, rotulo1, rotulo2, disabled]);

  function aplicarColagem() {
    const { linhas: novas, erros } = lerCronogramaColado(textoColado);
    setErrosColagem(erros);
    if (novas.length === 0) {
      if (erros.length === 0) setErrosColagem(["Nenhuma linha começando por data"]);
      return;
    }
    onLinhasChange(novas.map((l) => linhaEditavel(l.vencimento, [l.principal, l.juros, l.encargos])));
    if (erros.length === 0) {
      setColando(false);
      setTextoColado("");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {disabled ? null : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setColando((v) => !v)}>
            <ClipboardPaste />
            Colar do banco
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onLinhasChange([...linhas, { vencimento: "", valores: ["", "", ""] }])}
          >
            <Plus />
            Parcela
          </Button>
        </div>
      )}

      {colando ? (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3">
          <label htmlFor="cronograma-colado" className="text-legenda text-muted-foreground">
            Uma parcela por linha: vencimento, {colunas[0].toLowerCase()}, {colunas[1].toLowerCase()},{" "}
            {colunas[2].toLowerCase()}. Copie da planilha ou do PDF; cabeçalho e total são pulados. Substitui as
            linhas abaixo.
          </label>
          <Textarea
            id="cronograma-colado"
            rows={6}
            value={textoColado}
            onChange={(e) => setTextoColado(e.target.value)}
            className="font-mono text-legenda"
          />
          {errosColagem.length > 0 ? (
            <ul className="text-legenda text-destructive">
              {errosColagem.slice(0, 5).map((e) => (
                <li key={e}>{e}</li>
              ))}
              {errosColagem.length > 5 ? <li>e mais {errosColagem.length - 5}</li> : null}
            </ul>
          ) : null}
          <div>
            <Button type="button" size="sm" onClick={aplicarColagem} disabled={textoColado.trim() === ""}>
              Ler parcelas
            </Button>
          </div>
        </div>
      ) : null}

      <DataTable
        idTabela="financeiro.dividas.cronograma.edicao"
        columns={colunasTabela}
        data={dados}
        semPaginacao
        emptyState="Nenhuma parcela. Cole do banco ou adicione uma a uma."
        rodape={{
          vencimento: <span className="font-semibold">{lidas.length} parcela(s)</span>,
          valor0: <MoneyText valor={somas[0]} className="font-semibold" />,
          valor1: <MoneyText valor={somas[1]} className="font-semibold" />,
          valor2: <MoneyText valor={somas[2]} className="font-semibold" />,
        }}
      />

      {alvo ? (
        <p
          className={diferenca === 0 ? "text-legenda text-muted-foreground" : "text-legenda font-medium text-destructive"}
          aria-live="polite"
        >
          {diferenca === 0 ? (
            <>
              {colunas[0]} fecha {alvo.rotulo.toLowerCase()} (<MoneyText valor={alvo.valor} />)
            </>
          ) : (
            <>
              {colunas[0]} soma <MoneyText valor={somas[0]} /> e {alvo.rotulo.toLowerCase()} é{" "}
              <MoneyText valor={alvo.valor} />: {diferenca > 0 ? "faltam" : "sobram"}{" "}
              <MoneyText valor={Math.abs(diferenca)} />
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
