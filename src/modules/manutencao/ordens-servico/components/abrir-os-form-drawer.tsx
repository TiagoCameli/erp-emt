"use client";

import * as React from "react";
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
import {
  PRIORIDADE_OS,
  ROTULO_TIPO_OS,
} from "@/modules/manutencao/_shared/formato";
import type { EquipamentoOpcao } from "@/modules/manutencao/_shared/queries";
import { abrirOrdem } from "@/modules/manutencao/ordens-servico/actions";
import {
  abrirOsFormParaInput,
  abrirOsFormSchema,
  PRIORIDADES_OS,
  TIPOS_OS,
  type AbrirOsFormInput,
} from "@/modules/manutencao/ordens-servico/schemas";

const ID_FORM = "form-abrir-os";

function valoresIniciais(): AbrirOsFormInput {
  return {
    equipamentoId: "",
    tipo: "corretiva",
    descricao: "",
    prioridade: "media",
    horimetro: "",
    km: "",
  };
}

export interface AbrirOsFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  equipamentos: EquipamentoOpcao[];
  /** Chamado com o id da OS criada, para navegar ao detalhe. */
  onAberta?: (id: string) => void;
}

/**
 * Drawer de abertura de OS. O campo de leitura (horímetro ou km) aparece
 * conforme o controle do equipamento escolhido. Fecha sozinho no sucesso.
 */
export function AbrirOsFormDrawer({
  aberto,
  onAbertoChange,
  equipamentos,
  onAberta,
}: AbrirOsFormDrawerProps) {
  const form = useForm<AbrirOsFormInput>({
    resolver: zodResolver(abrirOsFormSchema),
    defaultValues: valoresIniciais(),
  });

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais());
  }, [aberto, form]);

  const equipamentoId = form.watch("equipamentoId");
  const equipamento = equipamentos.find((eq) => eq.id === equipamentoId);
  const controlePor = equipamento?.controlePor ?? "nenhum";

  const salvando = form.formState.isSubmitting;

  async function aoEnviar(dados: AbrirOsFormInput) {
    const resultado = await abrirOrdem(abrirOsFormParaInput(dados));
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("OS aberta");
    onAbertoChange(false);
    onAberta?.(resultado.id);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Nova OS"
      descricao="Abre uma ordem de serviço de manutenção para um equipamento da frota."
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
            Abrir OS
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
            name="equipamentoId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Equipamento</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione o equipamento" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {equipamentos.map((eq) => (
                      <SelectItem key={eq.id} value={eq.id}>
                        {eq.descricao}
                        {eq.placa ? ` (${eq.placa})` : ""}
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
              name="tipo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {TIPOS_OS.map((tipo) => (
                        <SelectItem key={tipo} value={tipo}>
                          {ROTULO_TIPO_OS[tipo]}
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
              name="prioridade"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prioridade</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Prioridade" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PRIORIDADES_OS.map((prioridade) => (
                        <SelectItem key={prioridade} value={prioridade}>
                          {PRIORIDADE_OS[prioridade].rotulo}
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
                    placeholder="Descreva o serviço a ser feito"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {controlePor === "horimetro" ? (
            <FormField
              control={form.control}
              name="horimetro"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Horímetro na abertura</FormLabel>
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
              name="km"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quilometragem na abertura</FormLabel>
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
        </form>
      </Form>
    </FormDrawer>
  );
}
