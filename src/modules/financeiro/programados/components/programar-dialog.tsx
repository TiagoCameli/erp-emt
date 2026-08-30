"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  CampoFormulario,
  classesFormulario,
  FormDrawer,
  submeterComAviso,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dataHojeISO, formatarData } from "@/lib/formatadores";
import { reprogramarParcela } from "@/modules/financeiro/aprovacao-pagamentos/actions";
import { avisoFimDeSemana } from "@/modules/financeiro/_shared/janela-pagamento";
import type { ParcelaProgramada } from "@/modules/financeiro/programados/queries";
import {
  reprogramarPagamentoFormSchema,
  type ReprogramarPagamentoFormInput,
} from "@/modules/financeiro/programados/schemas";

const ID_FORM = "form-reprogramar-pagamento";

export interface ProgramarDialogProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Parcela em programação, ou null quando o dialog está fechado. */
  parcela: ParcelaProgramada | null;
  /** Chamado após a data ser salva com sucesso. */
  onProgramado?: () => void;
}

/** Default do campo: a data autorizada atual da parcela, ou hoje na falta dela. */
function valoresIniciais(
  parcela: ParcelaProgramada | null,
): ReprogramarPagamentoFormInput {
  return { data: parcela?.dataEfetiva ?? dataHojeISO(), motivo: "" };
}

/**
 * Dialog de reprogramar a data autorizada de pagamento de uma parcela aprovada.
 *
 * A data programada é autorização, não agendamento: por isso o motivo é
 * obrigatório e a ação exige permissão de aprovar pagamento, não de editar
 * programados. Avisa quando a data cai em fim de semana, sem bloquear.
 */
export function ProgramarDialog({
  aberto,
  onAbertoChange,
  parcela,
  onProgramado,
}: ProgramarDialogProps) {
  const form = useForm<ReprogramarPagamentoFormInput>({
    resolver: zodResolver(reprogramarPagamentoFormSchema),
    defaultValues: valoresIniciais(parcela),
  });

  const dataEscolhida = form.watch("data");
  const aviso = dataEscolhida ? avisoFimDeSemana(dataEscolhida) : null;

  const salvando = form.formState.isSubmitting;

  // Ao abrir o dialog para uma parcela, volta o campo para a data efetiva
  // atual dela (padrão React: sincroniza estado local com props via efeito).
  React.useEffect(() => {
    if (!aberto) return;
    form.reset(valoresIniciais(parcela));
  }, [aberto, parcela, form]);

  async function aoEnviar(entrada: ReprogramarPagamentoFormInput) {
    if (!parcela) return;

    const resultado = await reprogramarParcela(
      parcela.id,
      entrada.data,
      entrada.motivo,
    );

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success("Data de pagamento reprogramada");
    onAbertoChange(false);
    onProgramado?.();
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Reprogramar data de pagamento"
      descricao="Nova data em que este pagamento fica autorizado a sair"
      larguraClassName="max-w-lg"
      temAlteracoesNaoSalvas={form.formState.isDirty && !salvando}
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
            ) : (
              "Salvar nova data"
            )}
          </Button>
        </>
      }
    >
      <form
        id={ID_FORM}
        onSubmit={submeterComAviso(form, aoEnviar)}
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
          ajuda={aviso ?? undefined}
        >
          <Input
            id="programar-data"
            type="date"
            disabled={salvando}
            {...form.register("data")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="programar-motivo"
          rotulo="Motivo da reprogramação"
          obrigatorio
          erro={form.formState.errors.motivo?.message}
          ajuda="Fica na trilha da parcela, com seu nome e a data."
        >
          <Input
            id="programar-motivo"
            disabled={salvando}
            placeholder="Ex.: fornecedor pediu prorrogação"
            {...form.register("motivo")}
          />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
