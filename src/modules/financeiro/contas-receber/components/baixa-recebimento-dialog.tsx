"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { dataHojeISO } from "@/lib/formatadores";
import { baixarRecebimento } from "@/modules/financeiro/contas-receber/actions";
import type {
  ContaBancariaOpcao,
  ContaReceberLinha,
} from "@/modules/financeiro/contas-receber/queries";
import {
  baixaRecebimentoFormSchema,
  type BaixaRecebimentoFormInput,
} from "@/modules/financeiro/contas-receber/schemas";

export interface BaixaRecebimentoDialogProps {
  /** Parcela em baixa, ou null com o diálogo fechado. */
  parcela: ContaReceberLinha | null;
  onFechar: () => void;
  contas: ContaBancariaOpcao[];
  /** Recarrega a listagem após a baixa. */
  onBaixado: () => void;
}

/**
 * Diálogo de baixa de recebimento: escolhe a conta bancária que recebeu e a
 * data. Para a_receber a baixa é direta via fn_pagar_parcela, sem aprovação
 * prévia. O ConfirmDialog canônico só cobre confirmação com motivo em texto,
 * então este caso (select de conta + data) tem diálogo próprio.
 */
export function BaixaRecebimentoDialog({
  parcela,
  onFechar,
  contas,
  onBaixado,
}: BaixaRecebimentoDialogProps) {
  const form = useForm<BaixaRecebimentoFormInput>({
    resolver: zodResolver(baixaRecebimentoFormSchema),
    defaultValues: { contaId: undefined, dataRecebimento: dataHojeISO() },
  });

  React.useEffect(() => {
    if (parcela) {
      form.reset({ contaId: undefined, dataRecebimento: dataHojeISO() });
    }
  }, [parcela, form]);

  const salvando = form.formState.isSubmitting;
  const contaValor = form.watch("contaId");

  async function aoEnviar(valores: BaixaRecebimentoFormInput) {
    if (!parcela) return;

    const resultado = await baixarRecebimento(
      parcela.id,
      valores.contaId,
      valores.dataRecebimento,
    );

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success("Recebimento registrado");
    onFechar();
    onBaixado();
  }

  return (
    <Dialog open={parcela !== null} onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar recebimento</DialogTitle>
          <DialogDescription className="text-detalhe text-muted-foreground">
            {parcela
              ? `Baixa de ${parcela.descricao} no valor de`
              : "Selecione a conta que recebeu e a data"}{" "}
            {parcela ? <MoneyText valor={parcela.valor} className="inline" /> : null}
          </DialogDescription>
        </DialogHeader>

        <form
          id="form-baixa-recebimento"
          onSubmit={form.handleSubmit(aoEnviar)}
          className={classesFormulario}
          noValidate
        >
          <CampoFormulario
            id="baixa-conta"
            rotulo="Conta bancária"
            obrigatorio
            erro={form.formState.errors.contaId?.message}
          >
            <Combobox
              valor={contaValor ?? ""}
              onValorChange={(valor) =>
                form.setValue("contaId", valor, { shouldValidate: true })
              }
              opcoes={contas.map((conta) => ({
                valor: conta.id,
                rotulo: conta.nome,
              }))}
              placeholder="Selecione a conta"
              disabled={salvando}
              id="baixa-conta"
              className="w-full"
            />
          </CampoFormulario>

          <CampoFormulario
            id="baixa-data"
            rotulo="Data do recebimento"
            obrigatorio
            erro={form.formState.errors.dataRecebimento?.message}
          >
            <Input
              id="baixa-data"
              type="date"
              disabled={salvando}
              {...form.register("dataRecebimento")}
            />
          </CampoFormulario>
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onFechar}
            disabled={salvando}
          >
            Cancelar
          </Button>
          <Button type="submit" form="form-baixa-recebimento" disabled={salvando}>
            {salvando ? (
              <>
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                Registrando...
              </>
            ) : (
              "Registrar recebimento"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
