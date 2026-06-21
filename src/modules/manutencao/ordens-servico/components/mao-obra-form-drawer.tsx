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
import type { ColaboradorOpcao } from "@/modules/manutencao/_shared/queries";
import { adicionarMaoObra } from "@/modules/manutencao/ordens-servico/actions";
import {
  maoObraFormParaInput,
  maoObraFormSchema,
  type MaoObraFormInput,
} from "@/modules/manutencao/ordens-servico/schemas";

const ID_FORM = "form-os-mao-obra";

function valoresIniciais(): MaoObraFormInput {
  return { colaboradorId: "", horas: "", valorHora: "" };
}

export interface MaoObraFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  ordemId: string;
  colaboradores: ColaboradorOpcao[];
}

/**
 * Drawer de apontamento de mão de obra na OS. O custo total é calculado pelo
 * banco (horas x valor_hora). Fecha no sucesso.
 */
export function MaoObraFormDrawer({
  aberto,
  onAbertoChange,
  ordemId,
  colaboradores,
}: MaoObraFormDrawerProps) {
  const router = useRouter();
  const form = useForm<MaoObraFormInput>({
    resolver: zodResolver(maoObraFormSchema),
    defaultValues: valoresIniciais(),
  });

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais());
  }, [aberto, form]);

  const salvando = form.formState.isSubmitting;

  async function aoEnviar(dados: MaoObraFormInput) {
    const resultado = await adicionarMaoObra(
      ordemId,
      maoObraFormParaInput(dados),
    );
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Mão de obra adicionada");
    onAbertoChange(false);
    router.refresh();
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Adicionar mão de obra"
      descricao="Aponta horas de um colaborador na OS. O custo é horas x valor da hora."
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
            Adicionar mão de obra
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
            name="colaboradorId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Colaborador</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione o colaborador" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {colaboradores.map((colaborador) => (
                      <SelectItem key={colaborador.id} value={colaborador.id}>
                        {colaborador.nome}
                        {colaborador.funcao ? ` - ${colaborador.funcao}` : ""}
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
              name="horas"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Horas</FormLabel>
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
              name="valorHora"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor da hora (R$)</FormLabel>
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
        </form>
      </Form>
    </FormDrawer>
  );
}
