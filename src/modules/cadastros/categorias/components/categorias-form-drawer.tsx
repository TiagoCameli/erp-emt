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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { criar, editar } from "@/modules/cadastros/categorias/actions";
import type { CategoriaLista } from "@/modules/cadastros/categorias/queries";
import {
  categoriaSchema,
  ROTULO_TIPO_CATEGORIA,
  TIPOS_CATEGORIA,
  type CategoriaInput,
} from "@/modules/cadastros/categorias/schemas";

const ID_FORM = "form-categoria";

/**
 * Entrada do formulário: ativo é opcional na entrada (default no schema) e
 * vira boolean garantido na saída validada (CategoriaInput).
 */
type CategoriaFormInput = z.input<typeof categoriaSchema>;

export interface CategoriasFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Categoria em edição. Ausente significa criar. */
  categoria?: CategoriaLista | null;
}

/**
 * Drawer com o formulário de categoria de insumo. Cria quando não recebe
 * categoria e edita quando recebe. Fecha sozinho ao salvar com sucesso.
 */
export function CategoriasFormDrawer({
  aberto,
  onAbertoChange,
  categoria,
}: CategoriasFormDrawerProps) {
  const editando = Boolean(categoria);

  const form = useForm<CategoriaFormInput, unknown, CategoriaInput>({
    resolver: zodResolver(categoriaSchema),
    defaultValues: { nome: "", tipo: "material", ativo: true },
  });

  // Sincroniza o formulário sempre que o drawer abre ou troca de categoria.
  React.useEffect(() => {
    if (!aberto) return;
    if (categoria) {
      form.reset({
        nome: categoria.nome,
        tipo: categoria.tipo,
        ativo: categoria.ativo,
      });
    } else {
      form.reset({ nome: "", tipo: "material", ativo: true });
    }
  }, [aberto, categoria, form]);

  const salvando = form.formState.isSubmitting;

  async function aoEnviar(dados: CategoriaInput) {
    const resultado = categoria
      ? await editar(categoria.id, dados)
      : await criar(dados);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "Categoria salva" : "Categoria criada");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar categoria" : "Nova categoria"}
      descricao="Categorias agrupam os insumos por natureza para custo e estoque"
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
            {editando ? "Salvar categoria" : "Criar categoria"}
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
            name="nome"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Materiais de construção"
                    autoFocus
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
                <FormControl>
                  <Combobox
                    valor={field.value}
                    onValorChange={field.onChange}
                    opcoes={TIPOS_CATEGORIA.map((tipo) => ({
                      valor: tipo,
                      rotulo: ROTULO_TIPO_CATEGORIA[tipo],
                    }))}
                    placeholder="Escolha o tipo"
                    className="w-full"
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
                  <Label htmlFor="categoria-ativo">Ativo</Label>
                  <p className="text-legenda text-muted-foreground">
                    Categorias inativas somem das listas de seleção, mas
                    continuam no histórico.
                  </p>
                </div>
                <FormControl>
                  <Switch
                    id="categoria-ativo"
                    checked={field.value}
                    onCheckedChange={field.onChange}
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
