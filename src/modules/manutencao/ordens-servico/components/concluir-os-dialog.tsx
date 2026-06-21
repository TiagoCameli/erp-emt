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
import { concluirOrdem } from "@/modules/manutencao/ordens-servico/actions";
import {
  concluirFormParaInput,
  concluirFormSchema,
  type ConcluirFormInput,
} from "@/modules/manutencao/ordens-servico/schemas";

const ID_FORM = "form-concluir-os";

function valoresIniciais(): ConcluirFormInput {
  return { horimetroFech: "", kmFech: "" };
}

export interface ConcluirOsDialogProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  ordemId: string;
  /** Controle do equipamento, define qual leitura de fechamento mostrar. */
  controlePor: string;
}

/**
 * Drawer de conclusão da OS. A conclusão calcula os custos e gera o lançamento
 * dos terceiros no banco. A leitura de fechamento (horímetro ou km) aparece
 * conforme o controle do equipamento. Fecha no sucesso.
 */
export function ConcluirOsDialog({
  aberto,
  onAbertoChange,
  ordemId,
  controlePor,
}: ConcluirOsDialogProps) {
  const router = useRouter();
  const form = useForm<ConcluirFormInput>({
    resolver: zodResolver(concluirFormSchema),
    defaultValues: valoresIniciais(),
  });

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais());
  }, [aberto, form]);

  const salvando = form.formState.isSubmitting;

  async function aoEnviar(dados: ConcluirFormInput) {
    const resultado = await concluirOrdem(ordemId, concluirFormParaInput(dados));
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("OS concluída. Os custos foram calculados");
    onAbertoChange(false);
    router.refresh();
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Concluir OS"
      descricao="A conclusão calcula os custos da OS e gera o lançamento financeiro dos serviços de terceiro."
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
            Concluir OS
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
          {controlePor === "horimetro" ? (
            <FormField
              control={form.control}
              name="horimetroFech"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Horímetro no fechamento</FormLabel>
                  <FormControl>
                    <Input
                      inputMode="decimal"
                      placeholder="0"
                      className="text-right tabular-nums"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null}

          {controlePor === "km" ? (
            <FormField
              control={form.control}
              name="kmFech"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quilometragem no fechamento</FormLabel>
                  <FormControl>
                    <Input
                      inputMode="decimal"
                      placeholder="0"
                      className="text-right tabular-nums"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null}

          {controlePor !== "horimetro" && controlePor !== "km" ? (
            <p className="text-detalhe text-muted-foreground">
              Este equipamento não controla horímetro nem quilometragem. Conclua
              a OS para fechar os custos.
            </p>
          ) : null}
        </form>
      </Form>
    </FormDrawer>
  );
}
