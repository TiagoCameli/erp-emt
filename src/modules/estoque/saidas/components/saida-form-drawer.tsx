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
import { registrarSaida } from "@/modules/estoque/saidas/actions";
import {
  saidaFormParaInput,
  saidaFormSchema,
  type SaidaFormInput,
} from "@/modules/estoque/saidas/schemas";
import type {
  CentroCustoOpcao,
  DepositoOpcao,
  InsumoOpcao,
} from "@/modules/estoque/_shared/queries";

const ID_FORM = "form-saida-estoque";

function valoresIniciais(): SaidaFormInput {
  return {
    insumoId: "",
    depositoId: "",
    quantidade: "",
    centroCustoId: "",
    data: dataHojeISO(),
    observacao: "",
  };
}

export interface SaidaFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  insumos: InsumoOpcao[];
  depositos: DepositoOpcao[];
  centrosCusto: CentroCustoOpcao[];
}

/**
 * Drawer da saída/consumo de estoque. Movimento é append-only: só cria, nunca
 * edita (correção se faz por ajuste de inventário). Fecha sozinho ao registrar
 * com sucesso.
 */
export function SaidaFormDrawer({
  aberto,
  onAbertoChange,
  insumos,
  depositos,
  centrosCusto,
}: SaidaFormDrawerProps) {
  const form = useForm<SaidaFormInput>({
    resolver: zodResolver(saidaFormSchema),
    defaultValues: valoresIniciais(),
  });

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais());
  }, [aberto, form]);

  const insumoId = form.watch("insumoId");
  const unidade =
    insumos.find((insumo) => insumo.id === insumoId)?.unidadeSigla ?? "";

  const salvando = form.formState.isSubmitting;

  async function aoEnviar(dados: SaidaFormInput) {
    const resultado = await registrarSaida(saidaFormParaInput(dados));
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Saída registrada");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Nova saída"
      descricao="Saída ou consumo de material. O custo sai pelo PEPS, das camadas mais antigas primeiro."
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
            Registrar saída
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

          <FormField
            control={form.control}
            name="centroCustoId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Centro de custo</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione o centro de custo" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {centrosCusto.map((centro) => (
                      <SelectItem key={centro.id} value={centro.id}>
                        {centro.codigo
                          ? `${centro.codigo} - ${centro.nome}`
                          : centro.nome}
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
            name="data"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data da saída</FormLabel>
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
                  <Textarea rows={2} placeholder="Opcional" {...field} />
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
