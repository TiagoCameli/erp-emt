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
import { ROTULO_REAJUSTE } from "@/modules/medicao/_shared/formato";
import { editarCabecalho } from "@/modules/medicao/medicoes/actions";
import type { MedicaoDetalhe } from "@/modules/medicao/medicoes/queries";
import {
  editarCabecalhoFormParaInput,
  editarCabecalhoFormSchema,
  TIPOS_REAJUSTE,
  type EditarCabecalhoFormInput,
} from "@/modules/medicao/medicoes/schemas";

const ID_FORM = "form-editar-cabecalho-medicao";

/** Converte número do banco em string pt-BR para o input do form. */
function paraCampo(valor: number): string {
  if (!Number.isFinite(valor) || valor === 0) return "";
  return String(valor).replace(".", ",");
}

export interface EditarCabecalhoDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  medicao: MedicaoDetalhe;
}

/**
 * Drawer de edição do cabeçalho (só rascunho): competência, descrição e
 * reajuste. As demais colunas têm grant negado no banco e não entram aqui.
 */
export function EditarCabecalhoDrawer({
  aberto,
  onAbertoChange,
  medicao,
}: EditarCabecalhoDrawerProps) {
  const router = useRouter();
  const form = useForm<EditarCabecalhoFormInput>({
    resolver: zodResolver(editarCabecalhoFormSchema),
    defaultValues: {
      competencia: medicao.competencia,
      descricao: medicao.descricao ?? "",
      reajusteTipo: medicao.reajusteTipo,
      reajusteValor: paraCampo(medicao.reajusteValor),
    },
  });

  React.useEffect(() => {
    if (!aberto) return;
    form.reset({
      competencia: medicao.competencia,
      descricao: medicao.descricao ?? "",
      reajusteTipo: medicao.reajusteTipo,
      reajusteValor: paraCampo(medicao.reajusteValor),
    });
  }, [aberto, medicao, form]);

  const reajusteTipo = form.watch("reajusteTipo");
  const salvando = form.formState.isSubmitting;

  async function aoEnviar(dados: EditarCabecalhoFormInput) {
    const resultado = await editarCabecalho(
      medicao.id,
      editarCabecalhoFormParaInput(dados),
    );
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Cabeçalho salvo");
    onAbertoChange(false);
    router.refresh();
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Editar cabeçalho"
      descricao="Competência, descrição e reajuste. Disponível só no rascunho."
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
            Salvar
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
            name="competencia"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Competência</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
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
                  <Textarea rows={2} placeholder="Opcional" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="reajusteTipo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reajuste</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Reajuste" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {TIPOS_REAJUSTE.map((tipo) => (
                        <SelectItem key={tipo} value={tipo}>
                          {ROTULO_REAJUSTE[tipo]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {reajusteTipo !== "nenhum" ? (
              <FormField
                control={form.control}
                name="reajusteValor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {reajusteTipo === "percentual" ? "Percentual (%)" : "Valor (R$)"}
                    </FormLabel>
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
          </div>
        </form>
      </Form>
    </FormDrawer>
  );
}
