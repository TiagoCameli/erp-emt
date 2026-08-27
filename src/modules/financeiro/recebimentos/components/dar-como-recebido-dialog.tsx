"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  MoneyText,
  submeterComAviso,
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
import {
  ROTULO_BANCO,
  type BancoConta,
} from "@/modules/financeiro/_shared/formato";
import { darComoRecebido } from "@/modules/financeiro/recebimentos/actions";
import type { ParcelaAReceber } from "@/modules/financeiro/recebimentos/queries";
import type { ContaBancariaOpcao } from "@/modules/financeiro/pagamentos/queries";
import {
  darComoRecebidoFormSchema,
  type DarComoRecebidoFormInput,
} from "@/modules/financeiro/recebimentos/schemas";

const ID_FORM = "form-dar-como-recebido";

export interface DarComoRecebidoDialogProps {
  /** Parcela em baixa, ou null com o diálogo fechado. */
  parcela: ParcelaAReceber | null;
  onFechar: () => void;
  contas: ContaBancariaOpcao[];
  /** Hoje em "YYYY-MM-DD" (America/Rio_Branco), calculado no servidor. */
  hoje: string;
  /** Recarrega a listagem depois do recebimento. */
  onRecebido: () => void;
}

/**
 * Diálogo de "dar como recebido": confirma a conta que recebeu e a data.
 *
 * A conta vem PREENCHIDA com a que foi escolhida no lançamento, porque na maioria
 * das vezes o dinheiro cai onde se esperava — mas continua editável, porque a
 * conta que recebeu de fato é a que vale, e é ela que o saldo vai somar. Trocar
 * aqui reescreve a conta da parcela, que é o comportamento de `fn_pagar_parcela`.
 *
 * Data limitada a hoje porque `fn_pagar_parcela` recusa data futura: sem o `max`,
 * a recusa só apareceria depois de enviar.
 *
 * O ConfirmDialog canônico só cobre confirmação com motivo em texto, então este
 * caso (conta + data) tem diálogo próprio, igual ao do pagamento.
 */
export function DarComoRecebidoDialog({
  parcela,
  onFechar,
  contas,
  hoje,
  onRecebido,
}: DarComoRecebidoDialogProps) {
  const form = useForm<DarComoRecebidoFormInput>({
    resolver: zodResolver(darComoRecebidoFormSchema),
    defaultValues: { contaId: "", dataRecebimento: hoje },
  });

  React.useEffect(() => {
    if (parcela) {
      form.reset({
        contaId: parcela.contaBancariaId ?? "",
        dataRecebimento: hoje,
      });
    }
  }, [parcela, hoje, form]);

  const salvando = form.formState.isSubmitting;
  const contaValor = form.watch("contaId");

  async function aoEnviar(valores: DarComoRecebidoFormInput) {
    if (!parcela) return;

    const resultado = await darComoRecebido(
      parcela.id,
      valores.contaId,
      valores.dataRecebimento,
    );

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success("Recebimento registrado. O saldo da conta subiu.");
    onFechar();
    onRecebido();
  }

  /**
   * A conta esperada saiu da lista de contas ATIVAS: a conta escolhida no
   * lançamento foi inativada depois. Avisar é melhor que mostrar o campo em
   * branco sem explicação — quem for dar como recebido precisa saber que vai
   * escolher outra.
   */
  const contaEsperadaSumiu =
    parcela?.contaBancariaId !== null &&
    parcela?.contaBancariaId !== undefined &&
    !contas.some((conta) => conta.id === parcela.contaBancariaId);

  return (
    <Dialog
      open={parcela !== null}
      onOpenChange={(aberto) => !aberto && onFechar()}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dar como recebido</DialogTitle>
          <DialogDescription className="text-detalhe text-muted-foreground">
            {parcela ? (
              <>
                {parcela.clienteNome} pagou{" "}
                <MoneyText valor={parcela.valor} className="inline" />
                {parcela.numeroDocumento
                  ? ` pelo documento ${parcela.numeroDocumento}`
                  : ""}
                . O saldo da conta escolhida sobe neste valor.
              </>
            ) : (
              "Confirme a conta que recebeu e a data"
            )}
          </DialogDescription>
        </DialogHeader>

        <form
          id={ID_FORM}
          onSubmit={submeterComAviso(form, aoEnviar)}
          className={classesFormulario}
          noValidate
        >
          <CampoFormulario
            id="rec-conta"
            rotulo="Conta que recebeu"
            obrigatorio
            ajuda={
              contaEsperadaSumiu
                ? "A conta escolhida no lançamento não está mais ativa: escolha outra"
                : "Já vem com a conta do lançamento. Troque se o dinheiro caiu em outra"
            }
            erro={form.formState.errors.contaId?.message}
          >
            <Combobox
              valor={contaValor ?? ""}
              onValorChange={(valor) =>
                form.setValue("contaId", valor, { shouldValidate: true })
              }
              // "nome - banco", igual ao drawer de pagamento: rotular só pelo
              // nome faria duas contas de bancos diferentes parecerem a mesma na
              // hora de dizer onde o dinheiro entrou.
              opcoes={contas.map((conta) => ({
                valor: conta.id,
                rotulo: `${conta.nome} - ${ROTULO_BANCO[conta.banco as BancoConta] ?? conta.banco}`,
              }))}
              placeholder="Selecione a conta"
              disabled={salvando}
              id="rec-conta"
              className="w-full"
            />
          </CampoFormulario>

          <CampoFormulario
            id="rec-data"
            rotulo="Data do recebimento"
            obrigatorio
            erro={form.formState.errors.dataRecebimento?.message}
          >
            <Input
              id="rec-data"
              type="date"
              // O banco recusa data futura; sem o max a recusa só apareceria
              // depois de enviar.
              max={hoje}
              className="tabular-nums"
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
          <Button type="submit" form={ID_FORM} disabled={salvando}>
            {salvando ? (
              <>
                <LoaderCircle
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
                Registrando...
              </>
            ) : (
              "Dar como recebido"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
