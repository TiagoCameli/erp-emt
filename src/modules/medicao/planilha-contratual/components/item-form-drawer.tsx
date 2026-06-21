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
import type { UnidadeOpcao } from "@/modules/medicao/_shared/queries";
import {
  criarItem,
  editarItem,
} from "@/modules/medicao/planilha-contratual/actions";
import type { ItemLista } from "@/modules/medicao/planilha-contratual/queries";
import {
  itemFormParaInput,
  itemFormSchema,
  SEM_UNIDADE,
  type ItemFormInput,
} from "@/modules/medicao/planilha-contratual/schemas";

const ID_FORM = "form-item-planilha";

/** Converte número do banco em string pt-BR para o input do form. */
function paraCampo(valor: number): string {
  if (!Number.isFinite(valor)) return "";
  return String(valor).replace(".", ",");
}

export interface ItemFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Id da planilha que recebe o item. */
  planilhaId: string;
  /** Item em edição. Null cria um novo. */
  item: ItemLista | null;
  unidades: UnidadeOpcao[];
}

/** Drawer do item contratual: código, descrição, unidade, quantidade e preço. */
export function ItemFormDrawer({
  aberto,
  onAbertoChange,
  planilhaId,
  item,
  unidades,
}: ItemFormDrawerProps) {
  const editando = item !== null;

  const form = useForm<ItemFormInput>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: {
      codigo: "",
      descricao: "",
      unidadeId: SEM_UNIDADE,
      quantidadeContratada: "",
      precoUnitario: "",
    },
  });

  React.useEffect(() => {
    if (!aberto) return;
    if (item) {
      form.reset({
        codigo: item.codigo ?? "",
        descricao: item.descricao,
        unidadeId: item.unidadeId ?? SEM_UNIDADE,
        quantidadeContratada: paraCampo(item.quantidadeContratada),
        precoUnitario: paraCampo(item.precoUnitario),
      });
    } else {
      form.reset({
        codigo: "",
        descricao: "",
        unidadeId: SEM_UNIDADE,
        quantidadeContratada: "",
        precoUnitario: "",
      });
    }
  }, [aberto, item, form]);

  const salvando = form.formState.isSubmitting;

  async function aoEnviar(dados: ItemFormInput) {
    const input = itemFormParaInput(dados);
    const resultado = item
      ? await editarItem(item.id, input)
      : await criarItem(planilhaId, input);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "Item salvo" : "Item adicionado");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar item" : "Novo item"}
      descricao="Item contratual: código, descrição, unidade, quantidade e preço."
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
            {editando ? "Salvar item" : "Adicionar item"}
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
            name="codigo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Código</FormLabel>
                <FormControl>
                  <Input
                    autoComplete="off"
                    placeholder="1.1"
                    disabled={salvando}
                    {...field}
                  />
                </FormControl>
                <FormDescription>Opcional.</FormDescription>
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
                  <Input
                    autoComplete="off"
                    placeholder="Escavação em material de 1a categoria"
                    autoFocus
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
            name="unidadeId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Unidade de medida</FormLabel>
                <Select
                  value={field.value === "" ? SEM_UNIDADE : field.value}
                  onValueChange={field.onChange}
                  disabled={salvando}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Sem unidade" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={SEM_UNIDADE}>Sem unidade</SelectItem>
                    {unidades.map((unidade) => (
                      <SelectItem key={unidade.id} value={unidade.id}>
                        {unidade.sigla} - {unidade.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>Opcional.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="quantidadeContratada"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Quantidade contratada</FormLabel>
                <FormControl>
                  <Input
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="1.500,000"
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
            name="precoUnitario"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Preço unitário (R$)</FormLabel>
                <FormControl>
                  <Input
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="12,50"
                    disabled={salvando}
                    {...field}
                  />
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
