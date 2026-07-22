"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";

import { Combobox, FormDrawer } from "@/components/canonicos";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { criar, editar } from "@/modules/cadastros/insumos/actions";
import type {
  CategoriaOpcao,
  InsumoLista,
  UnidadeOpcao,
} from "@/modules/cadastros/insumos/queries";
import {
  insumoSchema,
  type InsumoInput,
} from "@/modules/cadastros/insumos/schemas";

const ID_FORM = "form-insumo";

/** Entrada do form: `ativo` é opcional aqui por causa do .default() do schema. */
type InsumoFormInput = z.input<typeof insumoSchema>;

export interface InsumosFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Insumo em edição. Null cria um novo. */
  insumo: InsumoLista | null;
  categorias: CategoriaOpcao[];
  unidades: UnidadeOpcao[];
}

/** Drawer com o formulário de insumo, criando e editando. */
export function InsumosFormDrawer({
  aberto,
  onAbertoChange,
  insumo,
  categorias,
  unidades,
}: InsumosFormDrawerProps) {
  const editando = insumo !== null;

  const form = useForm<InsumoFormInput, unknown, InsumoInput>({
    resolver: zodResolver(insumoSchema),
    defaultValues: {
      codigo: insumo?.codigo ?? "",
      nome: insumo?.nome ?? "",
      categoriaId: insumo?.categoriaId ?? "",
      unidadeId: insumo?.unidadeId ?? "",
      descricao: insumo?.descricao ?? "",
      ativo: insumo?.ativo ?? true,
    },
  });

  const salvando = form.formState.isSubmitting;

  function aoMudarAberto(novoAberto: boolean) {
    onAbertoChange(novoAberto);
    if (!novoAberto) form.reset();
  }

  async function aoEnviar(dados: InsumoInput) {
    const resultado = editando
      ? await editar(insumo.id, dados)
      : await criar(dados);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "Insumo salvo" : "Insumo criado");
    aoMudarAberto(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={aoMudarAberto}
      titulo={editando ? "Editar insumo" : "Novo insumo"}
      descricao="Materiais, peças, óleos, combustíveis, betuminosos e serviços."
      rodape={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => aoMudarAberto(false)}
            disabled={salvando}
          >
            Cancelar
          </Button>
          <Button type="submit" form={ID_FORM} disabled={salvando}>
            {salvando ? (
              <>
                <LoaderCircle className="animate-spin" />
                Salvando...
              </>
            ) : editando ? (
              "Salvar insumo"
            ) : (
              "Criar insumo"
            )}
          </Button>
        </>
      }
    >
      <Form {...form}>
        <form
          id={ID_FORM}
          onSubmit={form.handleSubmit(aoEnviar)}
          className="space-y-4"
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
                    placeholder="MAT-001"
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
            name="nome"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome</FormLabel>
                <FormControl>
                  <Input
                    autoComplete="off"
                    placeholder="Brita 1"
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
            name="categoriaId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Categoria</FormLabel>
                <FormControl>
                  <Combobox
                    valor={field.value}
                    onValorChange={field.onChange}
                    opcoes={categorias.map((categoria) => ({
                      valor: categoria.id,
                      rotulo: categoria.nome,
                    }))}
                    placeholder="Selecione a categoria"
                    disabled={salvando}
                    className="w-full"
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
                <FormControl>
                  <Combobox
                    valor={field.value}
                    onValorChange={field.onChange}
                    opcoes={unidades.map((unidade) => ({
                      valor: unidade.id,
                      rotulo: `${unidade.sigla} - ${unidade.nome}`,
                    }))}
                    placeholder="Selecione a unidade"
                    disabled={salvando}
                    className="w-full"
                  />
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
                  <Textarea
                    placeholder="Detalhes do insumo"
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
                  <FormLabel>Ativo</FormLabel>
                  <FormDescription>
                    Insumos inativos somem das listas de seleção, mas continuam
                    no histórico.
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={salvando}
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
