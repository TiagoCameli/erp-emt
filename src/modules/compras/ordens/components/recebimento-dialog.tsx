"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { CampoFormulario, classesFormulario } from "@/components/canonicos";
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
import {
  datasParcelas,
  dividirValorPorParcelas,
} from "@/modules/cadastros/condicoes-pagamento/calculo";
import { dataHojeISO, formatarBRL, formatarData } from "@/lib/formatadores";
import { paraNumero } from "@/modules/compras/ordens/calculo";
import { registrarRecebimento } from "@/modules/compras/ordens/actions";
import type { ParcelaCondicaoOpcao } from "@/modules/compras/ordens/queries";
import {
  recebimentoFormSchema,
  type RecebimentoFormInput,
} from "@/modules/compras/ordens/schemas";

export interface RecebimentoDialogProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  ordemId: string;
  /** Valor total da OC: usado só como sugestão inicial do valor da NF. */
  valorTotalOc: number;
  /** Parcelas da condição de pagamento da OC, pra prévia ao vivo. */
  parcelasCondicao: ParcelaCondicaoOpcao[];
}

/** Valores default do form: NF vazia, valor sugerido = total da OC, hoje. */
function valoresIniciais(valorTotalOc: number): RecebimentoFormInput {
  return {
    numeroNf: "",
    valorNf: String(valorTotalOc).replace(".", ","),
    dataRecebimento: dataHojeISO(),
  };
}

/**
 * Diálogo de "Registrar recebimento" da OC aprovada: confirma nº da NF,
 * valor e data. A RPC fn_registrar_recebimento confirma o lançamento
 * previsto (-> a_pagar) e gera as parcelas do a_pagar pela condição de
 * pagamento da OC (vencimento = data do recebimento + dias_offset). A
 * prévia ao vivo usa as mesmas funções puras do cadastro de condições
 * (dividirValorPorParcelas/datasParcelas), então mostra exatamente o que a
 * RPC vai gravar.
 */
export function RecebimentoDialog({
  aberto,
  onAbertoChange,
  ordemId,
  valorTotalOc,
  parcelasCondicao,
}: RecebimentoDialogProps) {
  const form = useForm<RecebimentoFormInput>({
    resolver: zodResolver(recebimentoFormSchema),
    defaultValues: valoresIniciais(valorTotalOc),
  });

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais(valorTotalOc));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, valorTotalOc]);

  const salvando = form.formState.isSubmitting;
  const valorNfTexto = form.watch("valorNf");
  const dataRecebimento = form.watch("dataRecebimento");

  const previa = React.useMemo(() => {
    const valorNfNumero = paraNumero(valorNfTexto);
    if (parcelasCondicao.length === 0 || valorNfNumero <= 0 || !dataRecebimento) {
      return [];
    }
    const valores = dividirValorPorParcelas(
      valorNfNumero,
      parcelasCondicao.map((parcela) => parcela.percentual),
    );
    const datas = datasParcelas(
      dataRecebimento,
      parcelasCondicao.map((parcela) => parcela.diasOffset),
    );
    return valores.map((valor, indice) => ({ valor, data: datas[indice] }));
  }, [parcelasCondicao, valorNfTexto, dataRecebimento]);

  async function aoEnviar(valores: RecebimentoFormInput) {
    const resultado = await registrarRecebimento(ordemId, {
      numeroNf: valores.numeroNf,
      valorNf: paraNumero(valores.valorNf),
      dataRecebimento: valores.dataRecebimento,
    });

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(
      "Recebimento registrado. As parcelas do contas a pagar foram geradas",
    );
    onAbertoChange(false);
  }

  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar recebimento</DialogTitle>
          <DialogDescription className="text-detalhe text-muted-foreground">
            Confirma a nota fiscal e gera as parcelas do contas a pagar pela
            condição de pagamento da ordem.
          </DialogDescription>
        </DialogHeader>

        <form
          id="form-recebimento"
          onSubmit={form.handleSubmit(aoEnviar)}
          className={classesFormulario}
          noValidate
        >
          <CampoFormulario
            id="recebimento-numero-nf"
            rotulo="Número da nota fiscal"
            obrigatorio
            erro={form.formState.errors.numeroNf?.message}
          >
            <Input
              id="recebimento-numero-nf"
              disabled={salvando}
              {...form.register("numeroNf")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="recebimento-valor-nf"
            rotulo="Valor da nota fiscal"
            obrigatorio
            erro={form.formState.errors.valorNf?.message}
          >
            <Input
              id="recebimento-valor-nf"
              inputMode="decimal"
              disabled={salvando}
              {...form.register("valorNf")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="recebimento-data"
            rotulo="Data do recebimento"
            obrigatorio
            erro={form.formState.errors.dataRecebimento?.message}
          >
            <Input
              id="recebimento-data"
              type="date"
              disabled={salvando}
              {...form.register("dataRecebimento")}
            />
          </CampoFormulario>

          {previa.length > 0 ? (
            <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3">
              <p className="text-legenda font-medium text-muted-foreground">
                Parcelas que serão geradas
              </p>
              <div className="flex flex-col gap-1">
                {previa.map((parcela, indice) => (
                  <div
                    key={indice}
                    className="flex items-center justify-between text-detalhe"
                  >
                    <span className="text-muted-foreground">
                      Parcela {indice + 1} · vence {formatarData(parcela.data)}
                    </span>
                    <span className="tabular-nums">
                      {formatarBRL(parcela.valor)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onAbertoChange(false)}
            disabled={salvando}
          >
            Cancelar
          </Button>
          <Button type="submit" form="form-recebimento" disabled={salvando}>
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
