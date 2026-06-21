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
import { Textarea } from "@/components/ui/textarea";
import { formatarQuantidade } from "@/lib/formatadores";
import {
  adicionarItem,
  editarItem,
} from "@/modules/medicao/medicoes/actions";
import type {
  ItemDisponivel,
  ItemMedido,
} from "@/modules/medicao/medicoes/queries";
import {
  itemFormParaInput,
  itemFormSchema,
  type ItemFormInput,
} from "@/modules/medicao/medicoes/schemas";

const ID_FORM = "form-item-medicao";

/** Converte número do banco em string pt-BR para o input do form. */
function paraCampo(valor: number): string {
  if (!Number.isFinite(valor)) return "";
  return String(valor).replace(".", ",");
}

export interface ItemMedicaoFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  medicaoId: string;
  /** Item em edição. Null adiciona um novo. */
  item: ItemMedido | null;
  /** Itens da planilha ainda não medidos (para o seletor ao adicionar). */
  disponiveis: ItemDisponivel[];
}

/**
 * Drawer do item medido. Ao adicionar, escolhe um item da planilha ainda não
 * medido e a quantidade. Ao editar, o item é fixo e só muda a quantidade e a
 * memória. Mostra o saldo disponível como ajuda. A validação dura é no servidor.
 */
export function ItemMedicaoFormDrawer({
  aberto,
  onAbertoChange,
  medicaoId,
  item,
  disponiveis,
}: ItemMedicaoFormDrawerProps) {
  const router = useRouter();
  const editando = item !== null;

  const form = useForm<ItemFormInput>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: { planilhaItemId: "", quantidade: "", memoriaCalculo: "" },
  });

  React.useEffect(() => {
    if (!aberto) return;
    if (item) {
      form.reset({
        planilhaItemId: item.planilhaItemId,
        quantidade: paraCampo(item.atual),
        memoriaCalculo: item.memoriaCalculo ?? "",
      });
    } else {
      form.reset({ planilhaItemId: "", quantidade: "", memoriaCalculo: "" });
    }
  }, [aberto, item, form]);

  const planilhaItemId = form.watch("planilhaItemId");
  const selecionado = disponiveis.find((d) => d.planilhaItemId === planilhaItemId);

  // Saldo disponível para ajudar o usuário: na edição é do próprio item, na
  // adição é do item escolhido no seletor.
  const saldoDisponivel = editando
    ? item.quantidadeContratada - item.acumuladoAnterior
    : (selecionado?.saldoDisponivel ?? null);

  const salvando = form.formState.isSubmitting;

  async function aoEnviar(dados: ItemFormInput) {
    const input = itemFormParaInput(dados);
    const resultado = item
      ? await editarItem(medicaoId, item.id, input)
      : await adicionarItem(medicaoId, input);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(editando ? "Item salvo" : "Item lançado");
    onAbertoChange(false);
    router.refresh();
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar item" : "Adicionar item"}
      descricao="Quantidade medida do item da planilha neste período."
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
          <Button
            type="submit"
            form={ID_FORM}
            disabled={salvando || (!editando && disponiveis.length === 0)}
          >
            {salvando ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : null}
            {editando ? "Salvar item" : "Lançar item"}
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
          {editando ? (
            <div className="flex flex-col gap-0.5">
              <span className="text-legenda text-muted-foreground">Item</span>
              <span className="text-detalhe">
                {item.codigo ? (
                  <span className="mr-1.5 text-muted-foreground codigo-doc">
                    {item.codigo}
                  </span>
                ) : null}
                {item.descricao}
              </span>
            </div>
          ) : (
            <FormField
              control={form.control}
              name="planilhaItemId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Item da planilha</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione o item" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {disponiveis.map((d) => (
                        <SelectItem key={d.planilhaItemId} value={d.planilhaItemId}>
                          {d.codigo ? `${d.codigo} - ` : ""}
                          {d.descricao}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {disponiveis.length === 0 ? (
                    <FormDescription>
                      Todos os itens da planilha já foram lançados.
                    </FormDescription>
                  ) : null}
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="quantidade"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Quantidade medida</FormLabel>
                <FormControl>
                  <Input
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0,000"
                    className="text-right tabular-nums"
                    {...field}
                  />
                </FormControl>
                {saldoDisponivel !== null ? (
                  <FormDescription>
                    Saldo disponível: {formatarQuantidade(saldoDisponivel)}
                  </FormDescription>
                ) : null}
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="memoriaCalculo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Memória de cálculo</FormLabel>
                <FormControl>
                  <Textarea rows={3} placeholder="Opcional" {...field} />
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
