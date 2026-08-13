"use client";

import * as React from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

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
import { mesHojeISO, mesSeguinte } from "@/lib/formatadores";
import { quitarAdiantamento } from "@/modules/rh/adiantamentos/actions";
import { mesParaCompetencia } from "@/modules/rh/adiantamentos/schemas";

export interface QuitarSaldoDialogProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  adiantamentoId: string;
  colaboradorNome: string;
  /** Saldo em aberto já calculado na listagem (informativo aqui também). */
  saldo: number;
}

/**
 * Default da competência de destino: o mês SEGUINTE, não o corrente.
 *
 * O mês corrente normalmente já tem folha gerada, e quitar numa competência
 * cuja folha já foi gerada NÃO faz o desconto acontecer: a parcela nasce
 * aberta, a folha não é regerada sozinha, e nada no banco obriga a regerar
 * (o trigger `fn_guarda_status_folha` só pega desconto que diminui, não dívida
 * que chega depois; está escrito no `comment on function` da
 * `fn_quitar_adiantamento`). O default antigo levava direto para esse caso.
 */
function mesPadrao(): string {
  return mesSeguinte(mesHojeISO());
}

/**
 * Diálogo de quitação: junta as parcelas em aberto do adiantamento numa só,
 * na competência escolhida, preservando o total (`fn_quitar_adiantamento`).
 * Quem valida a competência (piso, folha aprovada ou em aprovação) é o
 * servidor; este diálogo só mostra a mensagem de recusa quando ele recusa.
 */
export function QuitarSaldoDialog({
  aberto,
  onAbertoChange,
  adiantamentoId,
  colaboradorNome,
  saldo,
}: QuitarSaldoDialogProps) {
  const [mes, setMes] = React.useState(mesPadrao);
  const [salvando, setSalvando] = React.useState(false);

  // Reabrir o diálogo volta para o mês padrão, sem carregar a digitação
  // anterior. Ajuste em tempo de render (comparando o `aberto` anterior),
  // não em efeito: mesmo padrão de `AlterarMesDialog`.
  const [abertoAnterior, setAbertoAnterior] = React.useState(aberto);
  if (aberto !== abertoAnterior) {
    setAbertoAnterior(aberto);
    if (aberto) setMes(mesPadrao());
  }

  function trocarAberto(novoAberto: boolean) {
    if (salvando) return;
    onAbertoChange(novoAberto);
  }

  async function confirmar() {
    setSalvando(true);
    try {
      const resultado = await quitarAdiantamento(
        adiantamentoId,
        mesParaCompetencia(mes),
      );
      if ("erro" in resultado) {
        toast.error(resultado.erro);
        return;
      }
      toast.success("Saldo quitado numa parcela só");
      onAbertoChange(false);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={trocarAberto}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Quitar saldo do adiantamento</DialogTitle>
          <DialogDescription>
            Junta as parcelas em aberto de {colaboradorNome} numa parcela só,
            na competência escolhida. O total do plano não muda, só a
            distribuição.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2">
            <span className="text-detalhe text-muted-foreground">
              Saldo em aberto
            </span>
            <MoneyText valor={saldo} className="font-semibold" />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="quitar-adiantamento-competencia">
              Competência de destino
            </Label>
            <Input
              id="quitar-adiantamento-competencia"
              type="month"
              value={mes}
              onChange={(evento) => setMes(evento.target.value)}
              disabled={salvando}
              aria-describedby="quitar-adiantamento-aviso"
            />
            <p
              id="quitar-adiantamento-aviso"
              className="text-detalhe text-muted-foreground"
            >
              Se a folha dessa competência já tiver sido gerada, o desconto só
              acontece quando ela for regerada.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={salvando}
            onClick={() => trocarAberto(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={salvando || mes === ""}
            onClick={() => void confirmar()}
          >
            {salvando ? (
              <>
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                Quitando...
              </>
            ) : (
              "Quitar saldo"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
