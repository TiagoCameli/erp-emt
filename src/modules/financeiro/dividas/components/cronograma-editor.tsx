"use client";

import * as React from "react";
import { ClipboardPaste, Plus, Trash2 } from "lucide-react";

import { InputMoeda, MoneyText } from "@/components/canonicos";
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

  function mudar(indice: number, parcial: Partial<LinhaEditavel>) {
    onLinhasChange(linhas.map((l, i) => (i === indice ? { ...l, ...parcial } : l)));
  }

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

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-detalhe">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="h-9 w-10 px-2 text-right font-medium">Nº</th>
              <th className="h-9 px-2 text-left font-medium">Vencimento</th>
              {colunas.map((c) => (
                <th key={c} className="h-9 px-2 text-right font-medium">
                  {c}
                </th>
              ))}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">
                  Nenhuma parcela. Cole do banco ou adicione uma a uma.
                </td>
              </tr>
            ) : (
              linhas.map((l, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{i + 1}</td>
                  <td className="px-2 py-1">
                    <Input
                      type="date"
                      aria-label={`Vencimento da parcela ${i + 1}`}
                      value={l.vencimento}
                      onChange={(e) => mudar(i, { vencimento: e.target.value })}
                      disabled={disabled}
                      className="h-8"
                    />
                  </td>
                  {[0, 1, 2].map((c) => (
                    <td key={c} className="px-2 py-1">
                      <InputMoeda
                        ariaLabel={`${colunas[c]} da parcela ${i + 1}`}
                        valor={l.valores[c]}
                        onValorChange={(v) => {
                          const valores = [...l.valores] as LinhaEditavel["valores"];
                          valores[c] = v;
                          mudar(i, { valores });
                        }}
                        disabled={disabled}
                        className="h-8 text-right"
                      />
                    </td>
                  ))}
                  <td className="px-1 py-1">
                    {disabled ? null : (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        aria-label={`Tirar a parcela ${i + 1}`}
                        onClick={() => onLinhasChange(linhas.filter((_, j) => j !== i))}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-surface">
              <td colSpan={2} className="px-2 py-2 font-semibold">
                {lidas.length} parcela(s)
              </td>
              {somas.map((s, i) => (
                <td key={i} className="px-2 py-2 text-right">
                  <MoneyText valor={s} className="font-semibold" />
                </td>
              ))}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

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
