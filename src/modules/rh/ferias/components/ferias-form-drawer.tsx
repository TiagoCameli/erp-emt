"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { Combobox, FormDrawer } from "@/components/canonicos";
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
import { Textarea } from "@/components/ui/textarea";
import { criarFerias, editarFerias } from "@/modules/rh/ferias/actions";
import type { FeriasLista } from "@/modules/rh/ferias/queries";
import {
  feriasFormParaInput,
  feriasFormSchema,
  ROTULO_STATUS_FERIAS,
  STATUS_FERIAS,
  type FeriasFormInput,
} from "@/modules/rh/ferias/schemas";
import type { ColaboradorOpcao } from "@/modules/rh/_shared/queries";

const ID_FORM = "form-ferias";

function valoresIniciais(): FeriasFormInput {
  return {
    colaboradorId: "",
    periodoAquisitivoInicio: "",
    periodoAquisitivoFim: "",
    dataInicio: "",
    dataFim: "",
    dias: "30",
    status: "programada",
    observacao: "",
  };
}

export interface FeriasFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  colaboradores: ColaboradorOpcao[];
  /** Férias em edição. Ausente significa criar. */
  ferias?: FeriasLista | null;
}

/**
 * Drawer com o formulário de férias. Cria quando não recebe registro e edita
 * quando recebe. As datas de gozo são opcionais (período só programado).
 * Fecha sozinho ao salvar.
 */
export function FeriasFormDrawer({
  aberto,
  onAbertoChange,
  colaboradores,
  ferias,
}: FeriasFormDrawerProps) {
  const editando = Boolean(ferias);

  const form = useForm<FeriasFormInput>({
    resolver: zodResolver(feriasFormSchema),
    defaultValues: valoresIniciais(),
  });

  // Sincroniza o formulário sempre que o drawer abre ou troca de registro.
  React.useEffect(() => {
    if (!aberto) return;
    if (ferias) {
      form.reset({
        colaboradorId: ferias.colaboradorId,
        periodoAquisitivoInicio: ferias.periodoAquisitivoInicio,
        periodoAquisitivoFim: ferias.periodoAquisitivoFim,
        dataInicio: ferias.dataInicio ?? "",
        dataFim: ferias.dataFim ?? "",
        dias: String(ferias.dias),
        status: ferias.status,
        observacao: ferias.observacao ?? "",
      });
    } else {
      form.reset(valoresIniciais());
    }
  }, [aberto, ferias, form]);

  const salvando = form.formState.isSubmitting;

  async function aoEnviar(dados: FeriasFormInput) {
    const entrada = feriasFormParaInput(dados);
    const resultado = ferias
      ? await editarFerias(ferias.id, entrada)
      : await criarFerias(entrada);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "Férias salvas" : "Férias criadas");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar férias" : "Nova férias"}
      descricao="O limite de gozo é o fim do período aquisitivo mais 12 meses."
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
            {editando ? "Salvar férias" : "Criar férias"}
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
                <FormControl>
                  <Combobox
                    valor={field.value}
                    onValorChange={field.onChange}
                    opcoes={colaboradores.map((colaborador) => ({
                      valor: colaborador.id,
                      rotulo: `${colaborador.nome}${colaborador.funcao ? ` - ${colaborador.funcao}` : ""}`,
                    }))}
                    placeholder="Selecione o colaborador"
                    className="w-full"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="periodoAquisitivoInicio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Período aquisitivo - início</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="periodoAquisitivoFim"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Período aquisitivo - fim</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="dataInicio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Gozo - início</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="dataFim"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Gozo - fim</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="dias"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dias</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
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
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <FormControl>
                    <Combobox
                      valor={field.value}
                      onValorChange={field.onChange}
                      opcoes={STATUS_FERIAS.map((valor) => ({
                        valor,
                        rotulo: ROTULO_STATUS_FERIAS[valor],
                      }))}
                      placeholder="Selecione o status"
                      className="w-full"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

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
