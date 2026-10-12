"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { ConfirmDialog, InputPercentual, MoneyText } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  faltaPara100,
  lerPercentual,
  ROTULO_STATUS_RATEIO,
  type RateioDoMes,
} from "@/modules/financeiro/relatorios/rateio-indireto";
import { salvarRateioIndireto, voltarRateioAutomatico } from "@/modules/financeiro/relatorios/rateio-indireto-actions";

interface RateioIndiretoTabelaProps {
  rateio: RateioDoMes;
  /** Quem fecha o mês (financeiro.competencias aprovar). Sem isso, só leitura. */
  podeAjustar: boolean;
}

const CAB = "h-9 px-3 text-detalhe font-medium text-muted-foreground";
const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%`;

type Acao = null | "salvar" | "confirmar" | "automatico";

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
      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className={CAB}>Obra</TableHead>
              <TableHead className={`${CAB} text-right`}>Custo direto</TableHead>
              <TableHead className={`${CAB} text-right`}>% sugerido</TableHead>
              <TableHead className={`${CAB} text-right`}>% do mês</TableHead>
              <TableHead className={`${CAB} text-right`}>Indireto recebido</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rateio.linhas.map((l) => (
              <TableRow key={l.centroId}>
                <TableCell className="px-3 py-2 text-corpo">
                  {l.centro}
                  {l.semCusto ? <span className="text-detalhe text-status-pendente"> (sem custo direto neste mês)</span> : null}
                </TableCell>
                <TableCell className="px-3 py-2 text-right"><MoneyText valor={l.custoDireto} /></TableCell>
                <TableCell className="px-3 py-2 text-right tabular-nums">{pct(l.pctSugerido)}</TableCell>
                <TableCell className="px-3 py-2 text-right">
                  {podeAjustar ? (
                    <InputPercentual
                      ariaLabel={`Percentual de ${l.centro}`}
                      className="ml-auto w-28 text-right tabular-nums"
                      valor={valores[l.centroId] ?? ""}
                      onValorChange={(v) => setValores((atual) => ({ ...atual, [l.centroId]: v }))}
                    />
                  ) : (
                    <span className="tabular-nums">{pct(l.pctVigente)}</span>
                  )}
                </TableCell>
                <TableCell className="px-3 py-2 text-right font-medium"><MoneyText valor={l.indireto} /></TableCell>
              </TableRow>
            ))}
            {rateio.naoRateado > 0 ? (
              <TableRow>
                <TableCell className="px-3 py-2 text-corpo text-status-pendente" colSpan={4}>
                  Não rateado (sem obra com custo para receber)
                </TableCell>
                <TableCell className="px-3 py-2 text-right font-medium"><MoneyText valor={rateio.naoRateado} /></TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

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
