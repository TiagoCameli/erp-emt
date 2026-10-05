"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, RotateCcw } from "lucide-react";

import { CampoFormulario, EmptyState, MoneyText } from "@/components/canonicos";
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
import { Textarea } from "@/components/ui/textarea";
import { formatarData } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import {
  debitosParaDevolucao,
  devolucaoDeFornecedor,
  type DebitoParaDevolucao,
} from "@/modules/financeiro/conciliacao/actions";
import type { TransacaoPainel } from "@/modules/financeiro/conciliacao/painel";

import { ValorMovimento } from "./valor-movimento";

export interface DevolucaoDialogProps {
  /** Null fecha. O pai remonta o diálogo a cada abertura (key). */
  credito: TransacaoPainel | null;
  onFechar: () => void;
}

/**
 * "É devolução de um pagamento" (Bloco L): um crédito que é o fornecedor
 * devolvendo dinheiro. Lançar a receber criaria receita que não existe.
 */
export function DevolucaoDialog({ credito, onFechar }: DevolucaoDialogProps) {
  const router = useRouter();
  const [debitos, setDebitos] = React.useState<DebitoParaDevolucao[] | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [selecionado, setSelecionado] = React.useState("");
  const [motivo, setMotivo] = React.useState("");
  const [enviando, setEnviando] = React.useState(false);

  React.useEffect(() => {
    if (!credito) return;
    let ativo = true;
    void debitosParaDevolucao(credito.id).then((resposta) => {
      if (!ativo) return;
      if ("erro" in resposta) setErro(resposta.erro);
      else {
        setDebitos(resposta.debitos);
        setSelecionado(resposta.debitos[0]?.id ?? "");
      }
    });
    return () => {
      ativo = false;
    };
  }, [credito]);

  const escolhido = debitos?.find((d) => d.id === selecionado);
  const parcial = !!credito && !!escolhido && credito.valor < Math.abs(escolhido.valor);

  async function confirmar() {
    if (!credito || !escolhido) return;
    setEnviando(true);
    const resposta = await devolucaoDeFornecedor({
      creditoId: credito.id,
      debitoId: escolhido.id,
      motivo,
    });
    setEnviando(false);
    if ("erro" in resposta) {
      toast.error(resposta.erro);
      return;
    }
    toast.success(
      resposta.modo === "total"
        ? "Devolução registrada: o pagamento voltou a aberto"
        : "Devolução parcial registrada no centro de custo do lançamento",
    );
    onFechar();
    router.refresh();
  }

  return (
    <Dialog open={credito !== null} onOpenChange={(aberto) => !aberto && !enviando && onFechar()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>É devolução de um pagamento</DialogTitle>
          <DialogDescription>
            Escolha o pagamento que o fornecedor devolveu. Não vira receita.
          </DialogDescription>
        </DialogHeader>

        {credito ? (
          <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm">
            <span className="tabular-nums text-muted-foreground">{formatarData(credito.dataMovimento)}</span>
            <span className="min-w-0 flex-1 truncate">{credito.memo ?? "-"}</span>
            <ValorMovimento valor={credito.valor} />
          </div>
        ) : null}

        {erro ? (
          <p className="text-sm text-status-rejeitado">{erro}</p>
        ) : debitos === null ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Procurando os pagamentos
          </div>
        ) : debitos.length === 0 ? (
          <EmptyState
            icone={RotateCcw}
            titulo="Nenhum pagamento casado para devolver"
            descricao="Precisa ser um pagamento já casado, desta conta, de mesmo valor ou maior, nos 90 dias antes."
            className="py-8"
          />
        ) : (
          <div role="radiogroup" aria-label="Pagamento devolvido" className="flex max-h-[40vh] flex-col gap-1.5 overflow-y-auto">
            {debitos.map((d) => {
              const ativo = d.id === selecionado;
              return (
                <button
                  key={d.id}
                  type="button"
                  role="radio"
                  aria-checked={ativo}
                  onClick={() => setSelecionado(d.id)}
                  className={cn(
                    "foco-anel flex flex-col gap-0.5 rounded-md border px-3 py-2 text-left text-sm",
                    ativo ? "border-primary bg-primary/5" : "border-border hover:bg-surface",
                  )}
                >
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">
                      {[d.lancamentoNumero, d.fornecedor].filter(Boolean).join(" · ") || "Lançamento"}
                    </span>
                    <MoneyText valor={Math.abs(d.valor)} />
                  </span>
                  <span className="truncate text-legenda text-muted-foreground">
                    {formatarData(d.dataMovimento)} · {d.descricao ?? d.memo ?? "-"}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {escolhido ? (
          <p className="text-detalhe text-muted-foreground">
            {parcial
              ? "Devolução parcial: o pagamento continua pago, e a parte devolvida entra como Devolução de fornecedor no centro de custo do lançamento (reduz o custo)."
              : "Devolução total: o pagamento volta a aberto e o envio e a devolução ficam casados como estorno."}
          </p>
        ) : null}

        <CampoFormulario id="devolucao-motivo" rotulo="Motivo" obrigatorio>
          <Textarea
            id="devolucao-motivo"
            value={motivo}
            maxLength={500}
            rows={2}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: fornecedor devolveu o PIX duplicado"
            disabled={enviando}
          />
        </CampoFormulario>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onFechar} disabled={enviando}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void confirmar()}
            disabled={enviando || !escolhido || motivo.trim().length < 3}
          >
            {enviando ? <LoaderCircle className="animate-spin" /> : <RotateCcw />}
            Registrar devolução
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
