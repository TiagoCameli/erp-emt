"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

import { CampoFormulario, Combobox, MoneyText } from "@/components/canonicos";
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
import { trocarContaParcela } from "@/modules/financeiro/conciliacao/actions";
import type { ParcelaLivre } from "@/modules/financeiro/conciliacao/painel";
import type { ContaBancariaOpcao } from "@/modules/financeiro/conciliacao/queries";

export interface TrocarContaDialogProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  parcela: ParcelaLivre | null;
  contaAtualId: string;
  contas: ContaBancariaOpcao[];
}

/**
 * No app e fora do banco porque o pagamento foi registrado na conta errada:
 * passa a parcela paga para a conta de onde o dinheiro saiu de verdade. O
 * motivo vai para a trilha da parcela.
 */
export function TrocarContaDialog({
  aberto,
  onAbertoChange,
  parcela,
  contaAtualId,
  contas,
}: TrocarContaDialogProps) {
  const router = useRouter();
  const [contaId, setContaId] = React.useState("");
  const [motivo, setMotivo] = React.useState("");
  const [enviando, setEnviando] = React.useState(false);

  async function confirmar() {
    if (!parcela) return;
    setEnviando(true);
    const resposta = await trocarContaParcela(parcela.id, contaId, motivo);
    setEnviando(false);
    if ("erro" in resposta) {
      toast.error(resposta.erro);
      return;
    }
    toast.success("Conta trocada");
    onAbertoChange(false);
    router.refresh();
  }

  return (
    <Dialog open={aberto} onOpenChange={(novo) => !enviando && onAbertoChange(novo)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Mudar a conta do pagamento</DialogTitle>
          <DialogDescription>
            {parcela ? (
              <>
                {[parcela.lancamentoNumero, parcela.nome].filter(Boolean).join(" · ")},{" "}
                <MoneyText valor={parcela.valorLiquido} />. Escolha a conta de onde o dinheiro saiu.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <CampoFormulario id="troca-conta" rotulo="Conta certa" obrigatorio>
            <Combobox
              id="troca-conta"
              valor={contaId}
              onValorChange={setContaId}
              opcoes={contas
                .filter((c) => c.id !== contaAtualId)
                .map((c) => ({ valor: c.id, rotulo: c.nome }))}
              placeholder="Escolha a conta"
              disabled={enviando}
            />
          </CampoFormulario>
          <CampoFormulario id="troca-motivo" rotulo="Motivo" obrigatorio>
            <Textarea
              id="troca-motivo"
              value={motivo}
              maxLength={500}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: pago pela Caixa, lançado no BB por engano"
              disabled={enviando}
            />
          </CampoFormulario>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onAbertoChange(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void confirmar()}
            disabled={enviando || !contaId || motivo.trim().length < 3}
          >
            {enviando ? <LoaderCircle className="animate-spin" /> : null}
            Mudar conta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
