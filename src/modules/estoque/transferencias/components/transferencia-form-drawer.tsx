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
import { registrarTransferencia } from "@/modules/estoque/transferencias/actions";
import {
  transferenciaFormParaInput,
  transferenciaFormSchema,
  type TransferenciaFormInput,
} from "@/modules/estoque/transferencias/schemas";
import type {
  DepositoOpcao,
  InsumoOpcao,
} from "@/modules/estoque/_shared/queries";

const ID_FORM = "form-transferencia-estoque";

function valoresIniciais(): TransferenciaFormInput {
  return {
    insumoId: "",
    origemId: "",
    destinoId: "",
    quantidade: "",
    data: dataHojeISO(),
    observacao: "",
  };
}

export interface TransferenciaFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  insumos: InsumoOpcao[];
  depositos: DepositoOpcao[];
}

/**
 * Drawer da transferência de estoque entre depósitos. Movimento é append-only:
 * só cria, nunca edita. O destino não pode ser igual à origem. Fecha sozinho
 * ao registrar com sucesso.
 */
export function TransferenciaFormDrawer({
  aberto,
  onAbertoChange,
  insumos,
  depositos,
}: TransferenciaFormDrawerProps) {
  const form = useForm<TransferenciaFormInput>({
    resolver: zodResolver(transferenciaFormSchema),
    defaultValues: valoresIniciais(),
  });

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais());
  }, [aberto, form]);

  const insumoId = form.watch("insumoId");
  const unidade =
    insumos.find((insumo) => insumo.id === insumoId)?.unidadeSigla ?? "";

  // O destino não pode ser o mesmo depósito da origem.
  const origemId = form.watch("origemId");
  const opcoesDestino = depositos.filter(
    (deposito) => deposito.id !== origemId,
  );

  // Trocar a origem para o que estava no destino invalida o destino: limpa.
  React.useEffect(() => {
    const destinoAtual = form.getValues("destinoId");
    if (destinoAtual && destinoAtual === origemId) {
      form.setValue("destinoId", "");
    }
  }, [origemId, form]);

  const salvando = form.formState.isSubmitting;

  async function aoEnviar(dados: TransferenciaFormInput) {
    const resultado = await registrarTransferencia(
      transferenciaFormParaInput(dados),
    );
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Transferência registrada");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Nova transferência"
      descricao="Mova material entre depósitos. O custo segue o material para o destino."
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
            Registrar transferência
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
            name="origemId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Depósito de origem</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione a origem" />
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
            name="destinoId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Depósito de destino</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione o destino" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {opcoesDestino.map((deposito) => (
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
            name="data"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data da transferência</FormLabel>
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
