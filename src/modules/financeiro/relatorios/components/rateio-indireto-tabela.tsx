"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import type { ColumnDef } from "@tanstack/react-table";

import { ConfirmDialog, DataTable, InputPercentual, MoneyText } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import {
  faltaPara100,
  lerPercentual,
  ROTULO_STATUS_RATEIO,
  type LinhaRateio,
  type RateioDoMes,
} from "@/modules/financeiro/relatorios/rateio-indireto";
import { salvarRateioIndireto, voltarRateioAutomatico } from "@/modules/financeiro/relatorios/rateio-indireto-actions";

interface RateioIndiretoTabelaProps {
  rateio: RateioDoMes;
  /** Quem fecha o mês (financeiro.competencias aprovar). Sem isso, só leitura. */
  podeAjustar: boolean;
}

const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%`;

type Acao = null | "salvar" | "confirmar" | "automatico";

/**
 * Uma obra do rateio, com o percentual que está sendo digitado, ou a linha do
 * que ficou sem obra para receber.
 */
type LinhaTabela =
  | (LinhaRateio & { tipo: "obra"; digitado: string })
  | { tipo: "naoRateado"; indireto: number };

/**
 * O rateio de um mês: custo direto de cada obra, % sugerido (pelo custo
 * direto), % vigente e o indireto que a obra recebe. Quem fecha o mês ajusta os
 * percentuais, salva e confirma; o motivo é obrigatório e fica no histórico.
 */
export function RateioIndiretoTabela({ rateio, podeAjustar }: RateioIndiretoTabelaProps) {
  const router = useRouter();
  const [valores, setValores] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(rateio.linhas.map((l) => [l.centroId, String(l.pctVigente).replace(".", ",")])),
  );
  const [acao, setAcao] = React.useState<Acao>(null);

  const numeros = rateio.linhas.map((l) => lerPercentual(valores[l.centroId] ?? "0"));
  const falta = faltaPara100(numeros);
  const fecha = Math.abs(falta) < 0.0001;

  const dados = React.useMemo<LinhaTabela[]>(
    () => [
      ...rateio.linhas.map((l) => ({ ...l, tipo: "obra" as const, digitado: valores[l.centroId] ?? "" })),
      ...(rateio.naoRateado > 0 ? [{ tipo: "naoRateado" as const, indireto: rateio.naoRateado }] : []),
    ],
    [rateio, valores],
  );

  // Sem ordenação: a linha do não rateado fecha a tabela, e ordenar a jogaria
  // no meio das obras.
  const colunas = React.useMemo<ColumnDef<LinhaTabela, unknown>[]>(
    () => [
      {
        id: "obra",
        header: "Obra",
        size: 280,
        enableSorting: false,
        meta: { celular: "titulo" },
        cell: ({ row }) => {
          const l = row.original;
          if (l.tipo === "naoRateado") {
            return <span className="text-status-pendente">Não rateado (sem obra com custo para receber)</span>;
          }
          return (
            <>
              {l.centro}
              {l.semCusto ? <span className="text-status-pendente"> (sem custo direto neste mês)</span> : null}
            </>
          );
        },
      },
      {
        id: "custoDireto",
        header: "Custo direto",
        size: 150,
        enableSorting: false,
        meta: { alinharDireita: true, atomico: true, rotulo: "Custo direto" },
        cell: ({ row }) => (row.original.tipo === "obra" ? <MoneyText valor={row.original.custoDireto} /> : null),
      },
      {
        id: "pctSugerido",
        header: "% sugerido",
        size: 120,
        enableSorting: false,
        meta: { alinharDireita: true, atomico: true, rotulo: "% sugerido" },
        cell: ({ row }) =>
          row.original.tipo === "obra" ? <span className="tabular-nums">{pct(row.original.pctSugerido)}</span> : null,
      },
      {
        id: "pctMes",
        header: "% do mês",
        size: 150,
        enableSorting: false,
        // O campo monta o próprio layout; o corte de uma linha cortaria o anel de foco.
        meta: { alinharDireita: true, naoTruncar: true, rotulo: "% do mês" },
        cell: ({ row }) => {
          const l = row.original;
          if (l.tipo !== "obra") return null;
          return podeAjustar ? (
            <InputPercentual
              ariaLabel={`Percentual de ${l.centro}`}
              className="ml-auto w-28 text-right tabular-nums"
              valor={l.digitado}
              onValorChange={(v) => setValores((atual) => ({ ...atual, [l.centroId]: v }))}
            />
          ) : (
            <span className="tabular-nums">{pct(l.pctVigente)}</span>
          );
        },
      },
      {
        id: "indireto",
        header: "Indireto recebido",
        size: 160,
        enableSorting: false,
        meta: { alinharDireita: true, atomico: true, rotulo: "Indireto recebido", celular: "valor" },
        cell: ({ row }) => <MoneyText valor={row.original.indireto} className="font-medium" />,
      },
    ],
    [podeAjustar],
  );

  async function executar(motivo?: string): Promise<boolean> {
    const m = motivo ?? "";
    const resultado =
      acao === "automatico"
        ? await voltarRateioAutomatico({ mes: rateio.mes, motivo: m })
        : await salvarRateioIndireto({
            mes: rateio.mes,
            percentuais: rateio.linhas.map((l, i) => ({ centroId: l.centroId, percentual: numeros[i] ?? 0 })),
            motivo: m,
            confirmar: acao === "confirmar",
          });
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return false;
    }
    toast.success(acao === "automatico" ? "Rateio voltou ao automático" : acao === "confirmar" ? "Rateio confirmado" : "Ajuste salvo");
    router.refresh();
    return true;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-detalhe text-muted-foreground">
        Situação do mês: <span className="font-medium text-foreground">{ROTULO_STATUS_RATEIO[rateio.status]}</span> · Custo indireto do mês{" "}
        <MoneyText valor={rateio.custoIndiretoMes} />
      </p>
      <DataTable
        idTabela="financeiro.relatorios.rateio-indireto"
        columns={colunas}
        data={dados}
        idDaLinha={(l) => (l.tipo === "obra" ? l.centroId : "nao-rateado")}
        semPaginacao
        emptyState="Nenhuma obra recebe indireto neste mês."
      />

      {podeAjustar && rateio.linhas.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className={fecha ? "text-detalhe text-muted-foreground" : "text-detalhe text-status-rejeitado"}>
            {fecha ? "Soma 100%" : falta > 0 ? `Faltam ${pct(falta)}` : `Passou ${pct(-falta)}`}
          </span>
          <Button type="button" size="sm" variant="outline" disabled={!fecha} onClick={() => setAcao("salvar")}>
            Salvar ajuste
          </Button>
          <Button type="button" size="sm" disabled={!fecha} onClick={() => setAcao("confirmar")}>
            Confirmar mês
          </Button>
          {rateio.status !== "automatico" ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => setAcao("automatico")}>
              Voltar ao automático
            </Button>
          ) : null}
        </div>
      ) : null}

      <ConfirmDialog
        aberto={acao !== null}
        onAbertoChange={(aberto) => !aberto && setAcao(null)}
        titulo={acao === "automatico" ? "Voltar ao automático" : acao === "confirmar" ? "Confirmar o rateio do mês" : "Salvar o ajuste do rateio"}
        descricao="O motivo fica registrado no histórico do rateio, com o seu nome."
        textoConfirmar={acao === "automatico" ? "Voltar ao automático" : acao === "confirmar" ? "Confirmar" : "Salvar"}
        exigeMotivo
        minMotivo={3}
        onConfirmar={executar}
      />
    </div>
  );
}
