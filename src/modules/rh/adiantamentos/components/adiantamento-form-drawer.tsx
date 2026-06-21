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
  criarAdiantamento,
  editarAdiantamento,
} from "@/modules/rh/adiantamentos/actions";
import type { AdiantamentoLista } from "@/modules/rh/adiantamentos/queries";
import {
  adiantamentoFormParaInput,
  adiantamentoFormSchema,
  competenciaParaMes,
  type AdiantamentoFormInput,
} from "@/modules/rh/adiantamentos/schemas";
import type { ColaboradorOpcao } from "@/modules/rh/_shared/queries";

const ID_FORM = "form-adiantamento";

/** Mês corrente (yyyy-MM) no fuso do sistema, para default da competência. */
function mesAtual(): string {
  return dataHojeISO().slice(0, 7);
}

function valoresIniciais(): AdiantamentoFormInput {
  return {
    colaboradorId: "",
    competencia: mesAtual(),
    valor: "",
    data: dataHojeISO(),
    descricao: "",
  };
}

export interface AdiantamentoFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  colaboradores: ColaboradorOpcao[];
  /** Adiantamento em edição. Ausente significa criar. */
  adiantamento?: AdiantamentoLista | null;
}

/**
 * Drawer com o formulário de adiantamento. Cria quando não recebe adiantamento
 * e edita quando recebe. Adiantamentos já incluídos numa folha ficam travados
 * e não chegam até aqui (a tabela esconde a ação). Fecha sozinho ao salvar.
 */
export function AdiantamentoFormDrawer({
  aberto,
  onAbertoChange,
  colaboradores,
  adiantamento,
}: AdiantamentoFormDrawerProps) {
  const editando = Boolean(adiantamento);

  const form = useForm<AdiantamentoFormInput>({
    resolver: zodResolver(adiantamentoFormSchema),
    defaultValues: valoresIniciais(),
  });

  // Sincroniza o formulário sempre que o drawer abre ou troca de registro.
  React.useEffect(() => {
    if (!aberto) return;
    if (adiantamento) {
      form.reset({
        colaboradorId: adiantamento.colaboradorId,
        competencia: competenciaParaMes(adiantamento.competencia),
        valor: String(adiantamento.valor).replace(".", ","),
        data: adiantamento.data,
        descricao: adiantamento.descricao ?? "",
      });
    } else {
      form.reset(valoresIniciais());
    }
  }, [aberto, adiantamento, form]);

  const salvando = form.formState.isSubmitting;

  async function aoEnviar(dados: AdiantamentoFormInput) {
    const entrada = adiantamentoFormParaInput(dados);
    const resultado = adiantamento
      ? await editarAdiantamento(adiantamento.id, entrada)
      : await criarAdiantamento(entrada);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "Adiantamento salvo" : "Adiantamento criado");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar adiantamento" : "Novo adiantamento"}
      descricao="Adiantamentos são descontados na folha gerencial da competência."
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
            {editando ? "Salvar adiantamento" : "Criar adiantamento"}
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
              name="competencia"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Competência</FormLabel>
                  <FormControl>
                    <Input type="month" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
          </div>

          <FormField
            control={form.control}
            name="data"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data do adiantamento</FormLabel>
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
        </form>
      </Form>
    </FormDrawer>
  );
}
