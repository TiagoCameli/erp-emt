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
import { Textarea } from "@/components/ui/textarea";
import type { FornecedorOpcao } from "@/modules/manutencao/_shared/queries";
import { adicionarTerceiro } from "@/modules/manutencao/ordens-servico/actions";
import {
  terceiroFormParaInput,
  terceiroFormSchema,
  type TerceiroFormInput,
} from "@/modules/manutencao/ordens-servico/schemas";

const ID_FORM = "form-os-terceiro";

/** Valor do select de fornecedor quando não há fornecedor escolhido. */
const SEM_FORNECEDOR = "sem-fornecedor";

function valoresIniciais(): TerceiroFormInput {
  return { fornecedorId: "", descricao: "", valor: "", dataVencimento: "" };
}

export interface TerceiroFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  ordemId: string;
  fornecedores: FornecedorOpcao[];
}

/**
 * Drawer de serviço de terceiro na OS. O fornecedor é opcional. O lançamento
 * financeiro só é gerado na conclusão da OS. Fecha no sucesso.
 */
export function TerceiroFormDrawer({
  aberto,
  onAbertoChange,
  ordemId,
  fornecedores,
}: TerceiroFormDrawerProps) {
  const router = useRouter();
  const form = useForm<TerceiroFormInput>({
    resolver: zodResolver(terceiroFormSchema),
    defaultValues: valoresIniciais(),
  });

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais());
  }, [aberto, form]);

  const salvando = form.formState.isSubmitting;

  async function aoEnviar(dados: TerceiroFormInput) {
    const resultado = await adicionarTerceiro(
      ordemId,
      terceiroFormParaInput(dados),
    );
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Serviço de terceiro adicionado");
    onAbertoChange(false);
    router.refresh();
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Adicionar terceiro"
      descricao="Registra um serviço de terceiro da OS. O lançamento financeiro é gerado na conclusão."
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
            Adicionar terceiro
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
            name="fornecedorId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fornecedor</FormLabel>
                <Select
                  value={
                    field.value === "" || field.value === undefined
                      ? SEM_FORNECEDOR
                      : field.value
                  }
                  onValueChange={(valor) =>
                    field.onChange(valor === SEM_FORNECEDOR ? "" : valor)
                  }
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Sem fornecedor" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={SEM_FORNECEDOR}>
                      Sem fornecedor
                    </SelectItem>
                    {fornecedores.map((fornecedor) => (
                      <SelectItem key={fornecedor.id} value={fornecedor.id}>
                        {fornecedor.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-legenda text-muted-foreground">
                  Opcional. Vincula o serviço a um fornecedor cadastrado.
                </p>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="descricao"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Descrição</FormLabel>
                <FormControl>
                  <Textarea
                    rows={2}
                    placeholder="Descreva o serviço de terceiro"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="valor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor (R$)</FormLabel>
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

            <FormField
              control={form.control}
              name="dataVencimento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vencimento</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </form>
      </Form>
    </FormDrawer>
  );
}
