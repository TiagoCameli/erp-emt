"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { MoneyText } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fecharDiarias } from "@/modules/rh/diaristas/actions";
import type { FechamentoPendente } from "@/modules/rh/diaristas/queries";
import { formatarCompetencia } from "@/modules/rh/diaristas/schemas";

export interface FechamentosPainelProps {
  fechamentos: FechamentoPendente[];
}

/** Texto plural das diárias de um fechamento. */
function rotuloDiarias(qtd: number): string {
  return qtd === 1 ? "1 diária" : `${qtd} diárias`;
}

/**
 * Painel "A fechar": lista as diárias em aberto agregadas por diarista e
 * competência, com o total. Fechar gera UM lançamento a pagar (RPC
 * fn_fechar_diarias) e some da lista no refresh. A data de vencimento é
 * opcional. Só aparece para quem pode criar diárias.
 */
export function FechamentosPainel({ fechamentos }: FechamentosPainelProps) {
  const router = useRouter();
  const [aberto, setAberto] = React.useState(false);
  const [alvo, setAlvo] = React.useState<FechamentoPendente | null>(null);
  const [dataVencimento, setDataVencimento] = React.useState("");
  const [fechando, setFechando] = React.useState(false);

  function pedirFechamento(fechamento: FechamentoPendente) {
    setAlvo(fechamento);
    setDataVencimento("");
    setAberto(true);
  }

  function trocarAberto(novoAberto: boolean) {
    if (fechando) return;
    setAberto(novoAberto);
  }

  async function confirmarFechamento() {
    if (!alvo || fechando) return;
    setFechando(true);
    try {
      const venc = dataVencimento.trim();
      const resultado = await fecharDiarias({
        colaboradorId: alvo.colaboradorId,
        competencia: alvo.competencia,
        ...(venc === "" ? {} : { dataVencimento: venc }),
      });
      if ("erro" in resultado) {
        toast.error(resultado.erro);
        return;
      }
      toast.success("Diárias fechadas. Lançamento a pagar gerado");
      setAberto(false);
      router.refresh();
    } finally {
      setFechando(false);
    }
  }

  if (fechamentos.length === 0) {
    return (
      <p className="text-detalhe text-muted-foreground">
        Nenhuma diária em aberto para fechar.
      </p>
    );
  }

  return (
    <>
      <ul className="divide-border divide-y rounded-lg border">
        {fechamentos.map((fechamento) => (
          <li
            key={`${fechamento.colaboradorId}|${fechamento.competencia}`}
            className="flex items-center justify-between gap-4 p-4"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">
                {fechamento.colaboradorNome}
              </p>
              <p className="text-detalhe text-muted-foreground tabular-nums">
                {formatarCompetencia(fechamento.competencia)} -{" "}
                {rotuloDiarias(fechamento.qtdDiarias)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-4">
              <MoneyText
                valor={fechamento.total}
                className="font-medium"
              />
              <Button
                type="button"
                size="sm"
                onClick={() => pedirFechamento(fechamento)}
              >
                <CheckCircle2 />
                Fechar diárias
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={aberto} onOpenChange={trocarAberto}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Fechar diárias</DialogTitle>
            <DialogDescription className="text-detalhe text-muted-foreground">
              {alvo
                ? `Fechar ${rotuloDiarias(alvo.qtdDiarias)} de ${
                    alvo.colaboradorNome
                  } em ${formatarCompetencia(
                    alvo.competencia,
                  )}. Vai gerar um lançamento a pagar único somando os valores.`
                : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="data-vencimento-fechamento">
              Data de vencimento (opcional)
            </Label>
            <Input
              id="data-vencimento-fechamento"
              type="date"
              value={dataVencimento}
              onChange={(evento) => setDataVencimento(evento.target.value)}
              disabled={fechando}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={fechando}
              onClick={() => trocarAberto(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={fechando}
              onClick={confirmarFechamento}
            >
              {fechando ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              Fechar diárias
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
