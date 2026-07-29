"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

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
import { competenciaParaMes, formatarMesAno } from "@/lib/formatadores";
import {
  alterarMesCompetencia,
  type EntidadeCompetencia,
} from "@/modules/_shared/competencia-actions";

export interface AlterarMesDialogProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  entidade: EntidadeCompetencia;
  id: string;
  /** Mês atual no formato do banco (yyyy-MM-01). */
  mesAtual: string;
  /**
   * O outro documento afetado, para a confirmação dizer o que vai acontecer do
   * outro lado (ex: "LAN-2026-0015" na tela da OC). Ausente quando não existe.
   */
  documentoEspelho?: string | null;
}

/**
 * Diálogo de alteração do mês de referência.
 *
 * Confirma antes de propagar porque isso move custo de um mês para outro nos
 * relatórios, e o outro documento da cadeia muda junto: a OC e o lançamento
 * compartilham o mesmo mês de referência. A trava (pagamento aprovado ou pago)
 * é do banco; aqui só mostramos o motivo quando ele recusa.
 */
export function AlterarMesDialog({
  aberto,
  onAbertoChange,
  entidade,
  id,
  mesAtual,
  documentoEspelho,
}: AlterarMesDialogProps) {
  const router = useRouter();
  const [mes, setMes] = React.useState(() => competenciaParaMes(mesAtual));
  const [salvando, setSalvando] = React.useState(false);

  // Reabrir o diálogo volta para o mês atual, sem carregar a digitação antiga.
  const [abertoAnterior, setAbertoAnterior] = React.useState(aberto);
  if (aberto !== abertoAnterior) {
    setAbertoAnterior(aberto);
    if (aberto) setMes(competenciaParaMes(mesAtual));
  }

  const mudou = mes !== "" && mes !== competenciaParaMes(mesAtual);

  async function confirmar() {
    setSalvando(true);
    const resultado = await alterarMesCompetencia(entidade, id, mes);
    setSalvando(false);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(`Mês de referência alterado para ${formatarMesAno(`${mes}-01`)}`);
    onAbertoChange(false);
    router.refresh();
  }

  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Alterar mês de referência</DialogTitle>
          <DialogDescription>
            Define em qual mês este custo entra nos relatórios. Muda na ordem de
            compra e no lançamento ao mesmo tempo.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor="alterar-mes">Mês de referência</Label>
          <Input
            id="alterar-mes"
            type="month"
            value={mes}
            onChange={(evento) => setMes(evento.target.value)}
            disabled={salvando}
          />
          {mudou ? (
            <p className="text-legenda text-muted-foreground">
              De {formatarMesAno(mesAtual)} para{" "}
              {formatarMesAno(`${mes}-01`)}.
              {documentoEspelho
                ? ` O ${documentoEspelho} muda junto.`
                : ""}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onAbertoChange(false)}
            disabled={salvando}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void confirmar()}
            disabled={salvando || !mudou}
          >
            {salvando ? (
              <>
                <LoaderCircle className="animate-spin" />
                Alterando...
              </>
            ) : (
              "Alterar mês"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
