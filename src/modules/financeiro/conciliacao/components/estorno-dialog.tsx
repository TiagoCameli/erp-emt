"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Undo2 } from "lucide-react";

import { EmptyState } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatarData } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import { casarEstorno } from "@/modules/financeiro/conciliacao/actions";
import type { MovimentoCasavel } from "@/modules/financeiro/conciliacao/casamento";
import {
  JANELA_ESTORNO_DIAS,
  paresPossiveis,
  pareceEstorno,
} from "@/modules/financeiro/conciliacao/estorno";
import type { TransacaoPainel } from "@/modules/financeiro/conciliacao/painel";

import { ValorMovimento } from "./valor-movimento";

export interface EstornoDialogProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  transacao: TransacaoPainel | null;
  /** Movimentos sem par do período e os vizinhos fora dele. */
  movimentos: MovimentoCasavel[];
}

/**
 * Casa o movimento com outro do extrato como estorno: o envio que o banco
 * devolveu (PIX rejeitado, TED devolvida, boleto devolvido). Os dois saem do
 * "Faltam no app" sem virar lançamento. Desfazer solta os dois.
 */
export function EstornoDialog({
  aberto,
  onAbertoChange,
  transacao,
  movimentos,
}: EstornoDialogProps) {
  const router = useRouter();
  const opcoes = React.useMemo(
    () => (transacao ? paresPossiveis(transacao, movimentos) : []),
    [transacao, movimentos],
  );
  // O pai remonta o diálogo a cada abertura (key): já vem o mais provável.
  const [selecionado, setSelecionado] = React.useState(opcoes[0]?.id ?? "");
  const [enviando, setEnviando] = React.useState(false);

  async function confirmar() {
    if (!transacao || !selecionado) return;
    setEnviando(true);
    const resposta = await casarEstorno({ transacaoId: transacao.id, parId: selecionado });
    setEnviando(false);
    if ("erro" in resposta) {
      toast.error(resposta.erro);
      return;
    }
    toast.success("Estorno casado: envio e devolução saíram do Faltam no app");
    onAbertoChange(false);
    router.refresh();
  }

  const devolucao = transacao ? pareceEstorno(transacao.memo) : false;

  return (
    <Dialog open={aberto} onOpenChange={(novo) => !enviando && onAbertoChange(novo)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Casar com estorno</DialogTitle>
          <DialogDescription>
            {devolucao
              ? "Escolha o envio que o banco devolveu."
              : "Escolha a devolução deste movimento."}{" "}
            Nenhum dos dois vira lançamento no app.
          </DialogDescription>
        </DialogHeader>

        {transacao ? (
          <div className="rounded-md border border-border bg-surface px-3 py-2 text-sm">
            <span className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="tabular-nums text-muted-foreground">
                {formatarData(transacao.dataMovimento)}
              </span>
              <ValorMovimento valor={transacao.valor} />
            </span>
            <span className="block truncate">{transacao.memo ?? "-"}</span>
          </div>
        ) : null}

        <div
          role="radiogroup"
          aria-label="Outro lado do estorno"
          className="flex max-h-[50vh] flex-col gap-1.5 overflow-y-auto"
        >
          {opcoes.length === 0 ? (
            <EmptyState
              icone={Undo2}
              titulo="Nenhum movimento para casar"
              descricao={`O outro lado precisa ter o mesmo valor, o sentido oposto e estar a até ${JANELA_ESTORNO_DIAS} dias, ainda sem par.`}
              className="py-8"
            />
          ) : (
            opcoes.map((m) => {
              const ativo = m.id === selecionado;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={ativo}
                  onClick={() => setSelecionado(m.id)}
                  className={cn(
                    "foco-anel flex flex-col gap-0.5 rounded-md border px-3 py-2 text-left text-sm",
                    ativo ? "border-primary bg-primary/5" : "border-border hover:bg-surface",
                  )}
                >
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="tabular-nums text-muted-foreground">
                      {formatarData(m.dataMovimento)}
                    </span>
                    <ValorMovimento valor={m.valor} />
                  </span>
                  <span className="truncate">{m.memo ?? "-"}</span>
                </button>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onAbertoChange(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void confirmar()} disabled={enviando || !selecionado}>
            {enviando ? <LoaderCircle className="animate-spin" /> : <Undo2 />}
            Casar estorno
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
