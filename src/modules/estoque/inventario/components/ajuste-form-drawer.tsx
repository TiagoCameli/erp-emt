"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { FormDrawer } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatarQuantidade } from "@/lib/formatadores";
import { registrarAjuste } from "@/modules/estoque/inventario/actions";
import {
  ajusteFormParaInput,
  ajusteFormSchema,
  type AjusteFormInput,
} from "@/modules/estoque/inventario/schemas";
import { numeroNaoNegativo, paraNumero } from "@/modules/estoque/_shared/numero";
import type {
  DepositoOpcao,
  InsumoOpcao,
  SaldoLista,
} from "@/modules/estoque/_shared/queries";

const ID_FORM = "form-ajuste-estoque";

function valoresIniciais(): AjusteFormInput {
  return {
    insumoId: "",
    depositoId: "",
    quantidadeNova: "",
    motivo: "",
  };
}

export interface AjusteFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  insumos: InsumoOpcao[];
  depositos: DepositoOpcao[];
  saldos: SaldoLista[];
}

/**
 * Drawer do ajuste de inventário. Mostra o saldo atual do sistema para o par
 * insumo + depósito escolhido e pede a quantidade contada fisicamente; a
 * diferença vira um ajuste positivo ou negativo. Movimento é append-only: só
 * cria. Fecha sozinho ao registrar com sucesso.
 */
export function AjusteFormDrawer({
  aberto,
  onAbertoChange,
  insumos,
  depositos,
  saldos,
}: AjusteFormDrawerProps) {
  const form = useForm<AjusteFormInput>({
    resolver: zodResolver(ajusteFormSchema),
    defaultValues: valoresIniciais(),
  });

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais());
  }, [aberto, form]);

  const insumoId = form.watch("insumoId");
  const depositoId = form.watch("depositoId");
  const quantidadeNova = form.watch("quantidadeNova");

  const unidade =
    insumos.find((insumo) => insumo.id === insumoId)?.unidadeSigla ?? "";

  const saldoAtual = React.useMemo(
    () =>
      saldos.find(
        (saldo) =>
          saldo.insumoId === insumoId && saldo.depositoId === depositoId,
      )?.quantidade ?? 0,
    [saldos, insumoId, depositoId],
  );

  const mostrarSaldo = Boolean(insumoId && depositoId);

  // Diferença (contagem - sistema), só quando há um número válido digitado.
  const diferenca =
    mostrarSaldo && numeroNaoNegativo(quantidadeNova)
      ? paraNumero(quantidadeNova) - saldoAtual
      : null;

  const salvando = form.formState.isSubmitting;

  async function aoEnviar(dados: AjusteFormInput) {
    const resultado = await registrarAjuste(ajusteFormParaInput(dados));
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Ajuste registrado");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Novo ajuste"
      descricao="Acerte o saldo do sistema contra a contagem física. A diferença vira um ajuste com o motivo registrado."
      rodape={
        <>
          <Button
            type="button"
            variant="outline"
            disabled={salvando}
            onClick={() => onAbertoChange(false)}
          >
            Cancelar
          </Button>
          <Button type="submit" form={ID_FORM} disabled={salvando}>
            {salvando ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : null}
            Registrar ajuste
          </Button>
        </>
      }
    >
      <Form {...form}>
        <form
          id={ID_FORM}
          onSubmit={form.handleSubmit(aoEnviar)}
          className="flex flex-col gap-5"
        >
          <FormField
            control={form.control}
            name="insumoId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Insumo</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione o insumo" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {insumos.map((insumo) => (
                      <SelectItem key={insumo.id} value={insumo.id}>
                        {insumo.codigo ? `${insumo.codigo} - ` : ""}
                        {insumo.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="depositoId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Depósito</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione o depósito" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {depositos.map((deposito) => (
                      <SelectItem key={deposito.id} value={deposito.id}>
                        {deposito.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {mostrarSaldo ? (
            <p className="text-legenda text-muted-foreground">
              Saldo atual no sistema:{" "}
              <span className="tabular-nums text-foreground">
                {formatarQuantidade(saldoAtual)}
                {unidade ? ` ${unidade}` : ""}
              </span>
            </p>
          ) : null}

          <FormField
            control={form.control}
            name="quantidadeNova"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Quantidade contada{unidade ? ` (${unidade})` : ""}
                </FormLabel>
                <FormControl>
                  <Input
                    inputMode="decimal"
                    placeholder="0,000"
                    className="text-right tabular-nums"
                    {...field}
                  />
                </FormControl>
                {diferenca !== null && diferenca !== 0 ? (
                  <p className="text-legenda text-muted-foreground">
                    Diferença: {diferenca > 0 ? "+" : ""}
                    {formatarQuantidade(diferenca)}
                    {unidade ? ` ${unidade}` : ""}
                  </p>
                ) : null}
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="motivo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Motivo</FormLabel>
                <FormControl>
                  <Textarea
                    rows={2}
                    placeholder="Ex.: contagem de inventário, perda, quebra"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>
    </FormDrawer>
  );
}
