"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import {
  CampoFormulario,
  classesFormulario,
  FormDrawer,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dataHojeISO, formatarData } from "@/lib/formatadores";
import { programarPagamento } from "@/modules/financeiro/programados/actions";
import type { ParcelaProgramada } from "@/modules/financeiro/programados/queries";
import {
  programarPagamentoFormSchema,
  type ProgramarPagamentoFormInput,
} from "@/modules/financeiro/programados/schemas";

const ID_FORM = "form-programar-pagamento";

export interface ProgramarDialogProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Parcela em programação, ou null quando o dialog está fechado. */
  parcela: ParcelaProgramada | null;
  /** Chamado após a data ser salva com sucesso. */
  onProgramado?: () => void;
}

/** Default do campo: a data efetiva atual da parcela (programada, ou vencimento na falta dela), ou hoje se nenhuma existir. */
function valoresIniciais(
  parcela: ParcelaProgramada | null,
): ProgramarPagamentoFormInput {
  return { data: parcela?.dataEfetiva ?? dataHojeISO() };
}

/**
 * Dialog de programar (ou reprogramar) a data de pagamento de uma parcela
 * aprovada: um único campo de data, com default na data efetiva atual da
 * parcela. Chama `programarPagamento`, que passa pela RPC
 * `fn_programar_pagamento`.
 */
export function ProgramarDialog({
  aberto,
  onAbertoChange,
  parcela,
  onProgramado,
}: ProgramarDialogProps) {
  const reprogramando = Boolean(parcela?.dataProgramada);

  const form = useForm<ProgramarPagamentoFormInput>({
    resolver: zodResolver(programarPagamentoFormSchema),
    defaultValues: valoresIniciais(parcela),
  });

  const salvando = form.formState.isSubmitting;

  // Ao abrir o dialog para uma parcela, volta o campo para a data efetiva
  // atual dela (padrão React: sincroniza estado local com props via efeito).
  React.useEffect(() => {
    if (!aberto) return;
    form.reset(valoresIniciais(parcela));
  }, [aberto, parcela, form]);

  async function aoEnviar(entrada: ProgramarPagamentoFormInput) {
    if (!parcela) return;

    const resultado = await programarPagamento(parcela.id, entrada.data);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(
      reprogramando ? "Pagamento reprogramado" : "Pagamento programado",
    );
    onAbertoChange(false);
    onProgramado?.();
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={reprogramando ? "Reprogramar pagamento" : "Programar pagamento"}
      descricao="Defina a data em que este pagamento deve entrar na fila"
      larguraClassName="max-w-lg"
      rodape={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => onAbertoChange(false)}
            disabled={salvando}
          >
            Cancelar
          </Button>
          <Button type="submit" form={ID_FORM} disabled={salvando || !parcela}>
            {salvando ? (
              <>
                <LoaderCircle className="animate-spin" />
                Salvando...
              </>
            ) : reprogramando ? (
              "Salvar nova data"
            ) : (
              "Programar"
            )}
          </Button>
        </>
      }
    >
      <form
        id={ID_FORM}
        onSubmit={form.handleSubmit(aoEnviar)}
        className={classesFormulario}
        noValidate
      >
        {parcela ? (
          <div className="grid gap-3 rounded-md border border-border bg-surface px-3 py-3 text-detalhe">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Lançamento</span>
              <span className="font-medium">
                {parcela.lancamentoNumero ? (
                  <span className="codigo-doc">{parcela.lancamentoNumero}</span>
                ) : (
                  "-"
                )}
              </span>
            </div>
            <div className="flex items-start justify-between gap-4">
              <span className="text-muted-foreground">Descrição</span>
              <span className="text-right font-medium">
                {parcela.lancamentoDescricao}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Fornecedor</span>
              <span className="font-medium">{parcela.fornecedorNome}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Vencimento</span>
              <span className="font-medium tabular-nums">
                {parcela.dataVencimento
                  ? formatarData(parcela.dataVencimento)
                  : "-"}
              </span>
            </div>
          </div>
        ) : null}

        <CampoFormulario
          id="programar-data"
          rotulo="Data programada"
          obrigatorio
          erro={form.formState.errors.data?.message}
        >
          <Input
            id="programar-data"
            type="date"
            disabled={salvando}
            {...form.register("data")}
          />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
