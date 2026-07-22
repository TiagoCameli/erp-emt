"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  MoneyText,
} from "@/components/canonicos";
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
import { finalizarCotacao } from "@/modules/compras/cotacoes/actions";
import type { FornecedorCotacao } from "@/modules/compras/cotacoes/queries";

export interface FinalizarCotacaoDialogProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  cotacaoId: string;
  fornecedores: FornecedorCotacao[];
}

/**
 * Dialog de finalização: escolhe o fornecedor vencedor e, quando ele não é o
 * de menor total, exige o motivo da escolha. O destaque de menor total ajuda
 * o usuário a decidir.
 */
export function FinalizarCotacaoDialog({
  aberto,
  onAbertoChange,
  cotacaoId,
  fornecedores,
}: FinalizarCotacaoDialogProps) {
  const [vencedorId, setVencedorId] = React.useState("");
  const [motivo, setMotivo] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);

  // Só fornecedores que cotaram algo (total > 0) podem vencer.
  const elegiveis = React.useMemo(
    () => fornecedores.filter((fornecedor) => fornecedor.total > 0),
    [fornecedores],
  );

  const vencedor = elegiveis.find((fornecedor) => fornecedor.id === vencedorId);
  const motivoObrigatorio = vencedor !== undefined && !vencedor.menorTotal;
  const motivoOk = !motivoObrigatorio || motivo.trim().length > 0;
  const podeFinalizar = vencedor !== undefined && motivoOk && !salvando;

  function fechar(novoAberto: boolean) {
    if (salvando) return;
    onAbertoChange(novoAberto);
  }

  async function confirmar() {
    if (!vencedor || !motivoOk || salvando) return;
    setSalvando(true);
    const resultado = await finalizarCotacao(
      cotacaoId,
      vencedor.id,
      motivo.trim() || undefined,
    );
    setSalvando(false);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Cotação finalizada");
    onAbertoChange(false);
  }

  return (
    <Dialog open={aberto} onOpenChange={fechar}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Finalizar cotação</DialogTitle>
          <DialogDescription className="text-detalhe text-muted-foreground">
            Escolha o fornecedor vencedor. Fora do menor total, justifique a
            escolha.
          </DialogDescription>
        </DialogHeader>

        {elegiveis.length === 0 ? (
          <p className="text-detalhe text-muted-foreground">
            Lance os preços de pelo menos um fornecedor antes de finalizar.
          </p>
        ) : (
          <div className={classesFormulario}>
            <CampoFormulario id="cotacao-vencedor" rotulo="Fornecedor vencedor">
              <Combobox
                valor={vencedorId}
                onValorChange={setVencedorId}
                opcoes={elegiveis.map((fornecedor) => ({
                  valor: fornecedor.id,
                  rotulo: `${fornecedor.fornecedorNome}${
                    fornecedor.menorTotal ? " (menor total)" : ""
                  }`,
                }))}
                placeholder="Escolha o vencedor"
                disabled={salvando}
                id="cotacao-vencedor"
                className="w-full"
              />
              {vencedor ? (
                <p className="text-detalhe text-muted-foreground">
                  Total cotado:{" "}
                  <MoneyText
                    valor={vencedor.total}
                    className={
                      vencedor.menorTotal
                        ? "inline text-status-aprovado"
                        : "inline"
                    }
                  />
                </p>
              ) : null}
            </CampoFormulario>

            {motivoObrigatorio ? (
              <CampoFormulario
                id="cotacao-motivo"
                rotulo="Motivo da escolha"
                ajuda="Esse fornecedor não tem o menor total, então o motivo é obrigatório."
              >
                <Textarea
                  id="cotacao-motivo"
                  value={motivo}
                  onChange={(evento) => setMotivo(evento.target.value)}
                  placeholder="Por que esse fornecedor, mesmo sem o menor total"
                  rows={3}
                  disabled={salvando}
                  autoFocus
                />
              </CampoFormulario>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={salvando}
            onClick={() => fechar(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!podeFinalizar}
            onClick={() => {
              void confirmar();
            }}
          >
            {salvando ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Finalizando...
              </>
            ) : (
              "Finalizar cotação"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
