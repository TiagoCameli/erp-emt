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
import { dataHojeISO } from "@/lib/formatadores";
import { registrarEntrada } from "@/modules/estoque/entradas/actions";
import {
  entradaFormParaInput,
  entradaFormSchema,
  type EntradaFormInput,
} from "@/modules/estoque/entradas/schemas";
import type {
  DepositoOpcao,
  InsumoOpcao,
} from "@/modules/estoque/_shared/queries";

const ID_FORM = "form-entrada-estoque";

function valoresIniciais(): EntradaFormInput {
  return {
    insumoId: "",
    depositoId: "",
    quantidade: "",
    custoUnitario: "",
    data: dataHojeISO(),
    observacao: "",
  };
}

export interface EntradaFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  insumos: InsumoOpcao[];
  depositos: DepositoOpcao[];
}

/**
 * Drawer da entrada manual de estoque. Movimento é append-only: só cria,
 * nunca edita (correção se faz por ajuste de inventário). Fecha sozinho ao
 * registrar com sucesso.
 */
export function EntradaFormDrawer({
  aberto,
  onAbertoChange,
  insumos,
  depositos,
}: EntradaFormDrawerProps) {
  const form = useForm<EntradaFormInput>({
    resolver: zodResolver(entradaFormSchema),
    defaultValues: valoresIniciais(),
  });

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais());
  }, [aberto, form]);

  const insumoId = form.watch("insumoId");
  const unidade =
    insumos.find((insumo) => insumo.id === insumoId)?.unidadeSigla ?? "";

  const salvando = form.formState.isSubmitting;

  async function aoEnviar(dados: EntradaFormInput) {
    const resultado = await registrarEntrada(entradaFormParaInput(dados));
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Entrada registrada");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Nova entrada"
      descricao="Entrada de material no depósito. Cria uma camada PEPS com o custo informado."
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
            Registrar entrada
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

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="quantidade"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Quantidade{unidade ? ` (${unidade})` : ""}
                  </FormLabel>
                  <FormControl>
                    <Input
                      inputMode="decimal"
                      placeholder="0,000"
                      className="text-right tabular-nums"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="custoUnitario"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Custo unitário (R$)</FormLabel>
                  <FormControl>
                    <Input
                      inputMode="decimal"
                      placeholder="0,00"
                      className="text-right tabular-nums"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="data"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data da entrada</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="observacao"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Observação</FormLabel>
                <FormControl>
                  <Textarea
                    rows={2}
                    placeholder="Opcional"
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
