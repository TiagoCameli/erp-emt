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
import { dataHojeISO } from "@/lib/formatadores";
import { criarEpi, editarEpi } from "@/modules/rh/epis/actions";
import type { EpiLista } from "@/modules/rh/epis/queries";
import {
  epiFormParaInput,
  epiFormSchema,
  type EpiFormInput,
} from "@/modules/rh/epis/schemas";
import type { ColaboradorOpcao } from "@/modules/rh/_shared/queries";

const ID_FORM = "form-epi";

function valoresIniciais(): EpiFormInput {
  return {
    colaboradorId: "",
    descricao: "",
    ca: "",
    quantidade: "1",
    dataEntrega: dataHojeISO(),
    dataDevolucao: "",
    assinado: false,
    observacao: "",
  };
}

export interface EpiFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  colaboradores: ColaboradorOpcao[];
  /** EPI em edição. Ausente significa criar. */
  epi?: EpiLista | null;
}

/**
 * Drawer com o formulário de EPI. Cria quando não recebe registro e edita
 * quando recebe. A devolução é opcional (EPI ainda em uso). Fecha sozinho ao
 * salvar.
 */
export function EpiFormDrawer({
  aberto,
  onAbertoChange,
  colaboradores,
  epi,
}: EpiFormDrawerProps) {
  const editando = Boolean(epi);

  const form = useForm<EpiFormInput>({
    resolver: zodResolver(epiFormSchema),
    defaultValues: valoresIniciais(),
  });

  // Sincroniza o formulário sempre que o drawer abre ou troca de registro.
  React.useEffect(() => {
    if (!aberto) return;
    if (epi) {
      form.reset({
        colaboradorId: epi.colaboradorId,
        descricao: epi.descricao,
        ca: epi.ca ?? "",
        quantidade: String(epi.quantidade),
        dataEntrega: epi.dataEntrega,
        dataDevolucao: epi.dataDevolucao ?? "",
        assinado: epi.assinado,
        observacao: epi.observacao ?? "",
      });
    } else {
      form.reset(valoresIniciais());
    }
  }, [aberto, epi, form]);

  const salvando = form.formState.isSubmitting;

  async function aoEnviar(dados: EpiFormInput) {
    const entrada = epiFormParaInput(dados);
    const resultado = epi
      ? await editarEpi(epi.id, entrada)
      : await criarEpi(entrada);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "EPI salvo" : "EPI criado");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar EPI" : "Novo EPI"}
      descricao="Entrega de equipamento de proteção individual por colaborador."
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
            {editando ? "Salvar EPI" : "Criar EPI"}
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

          <FormField
            control={form.control}
            name="descricao"
            render={({ field }) => (
              <FormItem>
                <FormLabel>EPI</FormLabel>
                <FormControl>
                  <Input placeholder="Ex: Botina de segurança" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="ca"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CA</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Certificado de Aprovação"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="quantidade"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantidade</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
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
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="dataEntrega"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data de entrega</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="dataDevolucao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data de devolução</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="assinado"
            render={({ field }) => (
              <FormItem className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <FormLabel>Termo assinado</FormLabel>
                  <FormDescription>
                    Marque quando o colaborador assinar o termo de entrega.
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={salvando}
                    aria-label="Termo assinado"
                  />
                </FormControl>
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
