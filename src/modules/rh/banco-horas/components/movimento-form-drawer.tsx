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
  criarMovimento,
  editarMovimento,
} from "@/modules/rh/banco-horas/actions";
import type { MovimentoLista } from "@/modules/rh/banco-horas/queries";
import {
  movimentoFormParaInput,
  movimentoFormSchema,
  ROTULO_TIPO_MOVIMENTO,
  TIPOS_MOVIMENTO,
  type MovimentoFormInput,
} from "@/modules/rh/banco-horas/schemas";
import type { ColaboradorOpcao } from "@/modules/rh/_shared/queries";

const ID_FORM = "form-movimento";

function valoresIniciais(): MovimentoFormInput {
  return {
    colaboradorId: "",
    data: dataHojeISO(),
    tipo: "credito",
    horas: "",
    motivo: "",
    observacao: "",
  };
}

export interface MovimentoFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  colaboradores: ColaboradorOpcao[];
  /** Movimento em edição. Ausente significa criar. */
  movimento?: MovimentoLista | null;
}

/**
 * Drawer com o formulário de movimento de banco de horas. Cria quando não
 * recebe movimento e edita quando recebe. Fecha sozinho ao salvar.
 */
export function MovimentoFormDrawer({
  aberto,
  onAbertoChange,
  colaboradores,
  movimento,
}: MovimentoFormDrawerProps) {
  const editando = Boolean(movimento);

  const form = useForm<MovimentoFormInput>({
    resolver: zodResolver(movimentoFormSchema),
    defaultValues: valoresIniciais(),
  });

  // Sincroniza o formulário sempre que o drawer abre ou troca de registro.
  React.useEffect(() => {
    if (!aberto) return;
    if (movimento) {
      form.reset({
        colaboradorId: movimento.colaboradorId,
        data: movimento.data,
        tipo: movimento.tipo,
        horas: String(movimento.horas).replace(".", ","),
        motivo: movimento.motivo ?? "",
        observacao: movimento.observacao ?? "",
      });
    } else {
      form.reset(valoresIniciais());
    }
  }, [aberto, movimento, form]);

  const salvando = form.formState.isSubmitting;

  async function aoEnviar(dados: MovimentoFormInput) {
    const entrada = movimentoFormParaInput(dados);
    const resultado = movimento
      ? await editarMovimento(movimento.id, entrada)
      : await criarMovimento(entrada);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "Movimento salvo" : "Movimento criado");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar movimento" : "Novo movimento"}
      descricao="Crédito soma horas ao saldo; débito subtrai. O saldo é por colaborador."
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
            {editando ? "Salvar movimento" : "Criar movimento"}
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
              name="horas"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Horas</FormLabel>
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
                    {TIPOS_MOVIMENTO.map((tipo) => (
                      <SelectItem key={tipo} value={tipo}>
                        {ROTULO_TIPO_MOVIMENTO[tipo]}
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
            name="motivo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Motivo</FormLabel>
                <FormControl>
                  <Input placeholder="Opcional" {...field} />
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
