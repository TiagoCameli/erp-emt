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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { aprovarMedicao } from "@/modules/medicao/medicoes/actions";
import {
  aprovarFormParaInput,
  aprovarFormSchema,
  type AprovarFormInput,
} from "@/modules/medicao/medicoes/schemas";

const ID_FORM = "form-aprovar-medicao";

export interface AprovarMedicaoDialogProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  medicaoId: string;
}

/**
 * Drawer de aprovação da medição. A data de vencimento da fatura é opcional;
 * vazia, a função do banco usa o padrão dela. A aprovação fecha os valores,
 * gera a fatura e o lançamento a receber.
 */
export function AprovarMedicaoDialog({
  aberto,
  onAbertoChange,
  medicaoId,
}: AprovarMedicaoDialogProps) {
  const router = useRouter();
  const form = useForm<AprovarFormInput>({
    resolver: zodResolver(aprovarFormSchema),
    defaultValues: { dataVencimento: "" },
  });

  React.useEffect(() => {
    if (aberto) form.reset({ dataVencimento: "" });
  }, [aberto, form]);

  const salvando = form.formState.isSubmitting;

  async function aoEnviar(dados: AprovarFormInput) {
    const resultado = await aprovarMedicao(
      medicaoId,
      aprovarFormParaInput(dados),
    );
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Medição aprovada. A fatura foi gerada");
    onAbertoChange(false);
    router.refresh();
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Aprovar medição"
      descricao="A aprovação fecha os valores, gera a fatura e o lançamento a receber. Cada item é revalidado contra o saldo contratual."
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
            Aprovar medição
          </Button>
        </>
      }
    >
      <Form {...form}>
        <form
          id={ID_FORM}
          onSubmit={form.handleSubmit(aoEnviar)}
          className="flex flex-col gap-5"
          noValidate
        >
          <FormField
            control={form.control}
            name="dataVencimento"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Vencimento da fatura</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormDescription>
                  Opcional. Em branco, o sistema usa o vencimento padrão.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>
    </FormDrawer>
  );
}
