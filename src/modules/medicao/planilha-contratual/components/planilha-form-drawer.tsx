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
  FormDescription,
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ObraOpcao } from "@/modules/medicao/_shared/queries";
import {
  criarPlanilha,
  editarPlanilha,
} from "@/modules/medicao/planilha-contratual/actions";
import type { PlanilhaCabecalho } from "@/modules/medicao/planilha-contratual/queries";
import {
  planilhaFormParaInput,
  planilhaFormSchema,
  type PlanilhaFormInput,
} from "@/modules/medicao/planilha-contratual/schemas";

const ID_FORM = "form-planilha-contratual";

/** Monta o rótulo da obra com o lote, quando houver. */
function rotuloObra(obra: ObraOpcao): string {
  return obra.lote ? `${obra.nome} (Lote ${obra.lote})` : obra.nome;
}

export interface PlanilhaFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Planilha em edição. Null cria uma nova. */
  planilha: PlanilhaCabecalho | null;
  /** Obras candidatas (uma planilha por obra). */
  obras: ObraOpcao[];
}

/**
 * Drawer do cabeçalho da planilha contratual. Cria quando não recebe planilha
 * e edita quando recebe. Uma planilha por obra: o banco garante via UNIQUE.
 */
export function PlanilhaFormDrawer({
  aberto,
  onAbertoChange,
  planilha,
  obras,
}: PlanilhaFormDrawerProps) {
  const editando = planilha !== null;

  const form = useForm<PlanilhaFormInput>({
    resolver: zodResolver(planilhaFormSchema),
    defaultValues: { obraId: "", nome: "", observacao: "", ativo: true },
  });

  React.useEffect(() => {
    if (!aberto) return;
    if (planilha) {
      form.reset({
        obraId: planilha.obraId,
        nome: planilha.nome,
        observacao: planilha.observacao ?? "",
        ativo: planilha.ativo,
      });
    } else {
      form.reset({ obraId: "", nome: "", observacao: "", ativo: true });
    }
  }, [aberto, planilha, form]);

  const salvando = form.formState.isSubmitting;

  async function aoEnviar(dados: PlanilhaFormInput) {
    const input = planilhaFormParaInput(dados);
    const resultado = planilha
      ? await editarPlanilha(planilha.id, input)
      : await criarPlanilha(input);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "Planilha salva" : "Planilha criada");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar planilha" : "Nova planilha"}
      descricao="A planilha contratual reúne os itens contratados de uma obra."
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
            {editando ? "Salvar planilha" : "Criar planilha"}
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
            name="obraId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Obra</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={salvando || editando}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione a obra" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {obras.map((obra) => (
                      <SelectItem key={obra.id} value={obra.id}>
                        {rotuloObra(obra)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Cada obra tem uma única planilha contratual.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="nome"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome</FormLabel>
                <FormControl>
                  <Input
                    autoComplete="off"
                    placeholder="Planilha contratual BR-364 Lote 09"
                    disabled={salvando}
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
                  <Textarea
                    placeholder="Detalhes do contrato"
                    rows={3}
                    disabled={salvando}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="ativo"
            render={({ field }) => (
              <FormItem className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <FormLabel>Ativa</FormLabel>
                  <FormDescription>
                    Planilhas inativas continuam no histórico, mas não recebem
                    novas medições.
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={salvando}
                    aria-label="Ativa"
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </form>
      </Form>
    </FormDrawer>
  );
}
