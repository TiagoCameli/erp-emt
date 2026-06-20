"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import type {
  DepositoOpcao,
  InsumoOpcao,
} from "@/modules/manutencao/_shared/queries";
import { adicionarPeca } from "@/modules/manutencao/ordens-servico/actions";
import {
  pecaFormParaInput,
  pecaFormSchema,
  type PecaFormInput,
} from "@/modules/manutencao/ordens-servico/schemas";

const ID_FORM = "form-os-peca";

function valoresIniciais(): PecaFormInput {
  return { insumoId: "", depositoId: "", quantidade: "" };
}

export interface PecaFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  ordemId: string;
  insumos: InsumoOpcao[];
  depositos: DepositoOpcao[];
}

/**
 * Drawer de baixa de peça do almoxarifado para a OS. A baixa é por PEPS e o
 * banco repassa o erro (ex.: "Saldo insuficiente"). Fecha no sucesso.
 */
export function PecaFormDrawer({
  aberto,
  onAbertoChange,
  ordemId,
  insumos,
  depositos,
}: PecaFormDrawerProps) {
  const router = useRouter();
  const form = useForm<PecaFormInput>({
    resolver: zodResolver(pecaFormSchema),
    defaultValues: valoresIniciais(),
  });

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais());
  }, [aberto, form]);

  const insumoId = form.watch("insumoId");
  const unidade =
    insumos.find((insumo) => insumo.id === insumoId)?.unidadeSigla ?? "";

  const salvando = form.formState.isSubmitting;

  async function aoEnviar(dados: PecaFormInput) {
    const resultado = await adicionarPeca(ordemId, pecaFormParaInput(dados));
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Peça baixada para a OS");
    onAbertoChange(false);
    router.refresh();
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Adicionar peça"
      descricao="Baixa uma peça do almoxarifado para a OS pelo custo PEPS."
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
            Adicionar peça
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
                <FormLabel>Almoxarifado</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione o almoxarifado" />
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

          <FormField
            control={form.control}
            name="quantidade"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Quantidade{unidade ? ` (${unidade})` : ""}</FormLabel>
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
        </form>
      </Form>
    </FormDrawer>
  );
}
