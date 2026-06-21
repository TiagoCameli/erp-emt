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
import {
  criarOcorrencia,
  editarOcorrencia,
} from "@/modules/rh/ocorrencias/actions";
import type { OcorrenciaLista } from "@/modules/rh/ocorrencias/queries";
import {
  ocorrenciaFormParaInput,
  ocorrenciaFormSchema,
  ROTULO_TIPO_OCORRENCIA,
  TIPOS_OCORRENCIA,
  type OcorrenciaFormInput,
} from "@/modules/rh/ocorrencias/schemas";
import type { ColaboradorOpcao } from "@/modules/rh/_shared/queries";

const ID_FORM = "form-ocorrencia";

function valoresIniciais(): OcorrenciaFormInput {
  return {
    colaboradorId: "",
    data: dataHojeISO(),
    tipo: "advertencia",
    descricao: "",
    observacao: "",
  };
}

export interface OcorrenciaFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  colaboradores: ColaboradorOpcao[];
  /** Ocorrência em edição. Ausente significa criar. */
  ocorrencia?: OcorrenciaLista | null;
}

/**
 * Drawer com o formulário de ocorrência. Cria quando não recebe registro e
 * edita quando recebe. Fecha sozinho ao salvar.
 */
export function OcorrenciaFormDrawer({
  aberto,
  onAbertoChange,
  colaboradores,
  ocorrencia,
}: OcorrenciaFormDrawerProps) {
  const editando = Boolean(ocorrencia);

  const form = useForm<OcorrenciaFormInput>({
    resolver: zodResolver(ocorrenciaFormSchema),
    defaultValues: valoresIniciais(),
  });

  // Sincroniza o formulário sempre que o drawer abre ou troca de registro.
  React.useEffect(() => {
    if (!aberto) return;
    if (ocorrencia) {
      form.reset({
        colaboradorId: ocorrencia.colaboradorId,
        data: ocorrencia.data,
        tipo: ocorrencia.tipo,
        descricao: ocorrencia.descricao,
        observacao: ocorrencia.observacao ?? "",
      });
    } else {
      form.reset(valoresIniciais());
    }
  }, [aberto, ocorrencia, form]);

  const salvando = form.formState.isSubmitting;

  async function aoEnviar(dados: OcorrenciaFormInput) {
    const entrada = ocorrenciaFormParaInput(dados);
    const resultado = ocorrencia
      ? await editarOcorrencia(ocorrencia.id, entrada)
      : await criarOcorrencia(entrada);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "Ocorrência salva" : "Ocorrência criada");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar ocorrência" : "Nova ocorrência"}
      descricao="Ausências e ocorrências por colaborador."
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
            {editando ? "Salvar ocorrência" : "Criar ocorrência"}
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
              name="data"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tipo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {TIPOS_OCORRENCIA.map((valor) => (
                        <SelectItem key={valor} value={valor}>
                          {ROTULO_TIPO_OCORRENCIA[valor]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="descricao"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Descrição</FormLabel>
                <FormControl>
                  <Textarea
                    rows={3}
                    placeholder="O que aconteceu"
                    {...field}
                  />
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
