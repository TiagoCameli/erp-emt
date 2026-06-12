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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { criar, editar } from "@/modules/cadastros/depositos/actions";
import type {
  DepositoLista,
  InsumoOpcao,
  ObraOpcao,
} from "@/modules/cadastros/depositos/queries";
import {
  depositoSchema,
  ehTanque,
  ROTULO_TIPO_DEPOSITO,
  TIPOS_DEPOSITO,
  type DepositoInput,
} from "@/modules/cadastros/depositos/schemas";

const ID_FORM = "form-deposito";
const SEM_OBRA = "sem-obra";

export interface DepositosFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Depósito em edição. Ausente abre o formulário em modo de criação. */
  deposito?: DepositoLista;
  obras: ObraOpcao[];
  insumos: InsumoOpcao[];
}

function valoresIniciais(deposito?: DepositoLista): DepositoInput {
  if (!deposito) {
    return { nome: "", tipo: "central", obraId: null, insumoId: null, ativo: true };
  }
  return {
    nome: deposito.nome,
    tipo: deposito.tipo,
    obraId: deposito.obraId,
    insumoId: deposito.insumoId,
    ativo: deposito.ativo,
  };
}

/**
 * Drawer de criação e edição de depósito. O campo insumo só aparece quando o
 * tipo é tanque; trocar para um tipo que não é tanque limpa o insumo.
 */
export function DepositosFormDrawer({
  aberto,
  onAbertoChange,
  deposito,
  obras,
  insumos,
}: DepositosFormDrawerProps) {
  const editando = deposito !== undefined;

  const form = useForm<DepositoInput>({
    resolver: zodResolver(depositoSchema),
    defaultValues: valoresIniciais(deposito),
  });

  React.useEffect(() => {
    if (aberto) {
      form.reset(valoresIniciais(deposito));
    }
  }, [aberto, deposito, form]);

  const enviando = form.formState.isSubmitting;
  const tipo = form.watch("tipo");
  const mostrarInsumo = ehTanque(tipo);

  async function aoEnviar(dados: DepositoInput) {
    const payload: DepositoInput = {
      ...dados,
      insumoId: ehTanque(dados.tipo) ? dados.insumoId : null,
    };

    const resultado = editando
      ? await editar(deposito.id, payload)
      : await criar(payload);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "Depósito salvo" : "Depósito criado");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar depósito" : "Novo depósito"}
      descricao={
        editando
          ? "Atualize os dados do depósito ou tanque"
          : "Cadastre um depósito ou tanque de combustível ou betuminoso"
      }
      rodape={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => onAbertoChange(false)}
            disabled={enviando}
          >
            Cancelar
          </Button>
          <Button type="submit" form={ID_FORM} disabled={enviando}>
            {enviando ? (
              <>
                <LoaderCircle className="animate-spin" />
                Salvando...
              </>
            ) : editando ? (
              "Salvar depósito"
            ) : (
              "Criar depósito"
            )}
          </Button>
        </>
      }
    >
      <Form {...form}>
        <form
          id={ID_FORM}
          onSubmit={form.handleSubmit(aoEnviar)}
          className="space-y-5"
          noValidate
        >
          <FormField
            control={form.control}
            name="nome"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome</FormLabel>
                <FormControl>
                  <Input
                    autoComplete="off"
                    placeholder="Tanque diesel usina"
                    disabled={enviando}
                    {...field}
                  />
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
                <Select
                  value={field.value}
                  onValueChange={(valor) => {
                    field.onChange(valor);
                    if (!ehTanque(valor)) {
                      form.setValue("insumoId", null, {
                        shouldValidate: true,
                      });
                    }
                  }}
                  disabled={enviando}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {TIPOS_DEPOSITO.map((valor) => (
                      <SelectItem key={valor} value={valor}>
                        {ROTULO_TIPO_DEPOSITO[valor]}
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
            name="obraId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Obra (opcional)</FormLabel>
                <Select
                  value={field.value ?? SEM_OBRA}
                  onValueChange={(valor) =>
                    field.onChange(valor === SEM_OBRA ? null : valor)
                  }
                  disabled={enviando}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Sem obra" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={SEM_OBRA}>Sem obra</SelectItem>
                    {obras.map((obra) => (
                      <SelectItem key={obra.id} value={obra.id}>
                        {obra.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {mostrarInsumo ? (
            <FormField
              control={form.control}
              name="insumoId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Insumo armazenado</FormLabel>
                  <Select
                    value={field.value ?? ""}
                    onValueChange={(valor) => field.onChange(valor)}
                    disabled={enviando}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione o insumo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {insumos.map((insumo) => (
                        <SelectItem key={insumo.id} value={insumo.id}>
                          {insumo.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Combustível ou material betuminoso que o tanque guarda.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null}

          <FormField
            control={form.control}
            name="ativo"
            render={({ field }) => (
              <FormItem className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="deposito-ativo">Ativo</Label>
                  <FormDescription>
                    Depósitos inativos somem das listas de seleção, mas
                    continuam no histórico.
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    id="deposito-ativo"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={enviando}
                    aria-label="Ativo"
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
