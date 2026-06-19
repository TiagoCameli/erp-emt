"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";

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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  criarCategoria,
  editarCategoria,
} from "@/modules/financeiro/categorias/actions";
import type {
  CategoriaFinanceiraLista,
  CategoriaPaiOpcao,
} from "@/modules/financeiro/categorias/queries";
import {
  categoriaFinanceiraSchema,
  ROTULO_TIPO_CATEGORIA_FINANCEIRA,
  TIPOS_CATEGORIA_FINANCEIRA,
  type CategoriaFinanceiraInput,
} from "@/modules/financeiro/categorias/schemas";

const ID_FORM = "form-categoria-financeira";

/** Valor do select de pai quando não há categoria pai escolhida. */
const SEM_PAI = "sem-pai";

/**
 * Entrada do formulário: ativo e paiId são opcionais na entrada (default no
 * schema) e ficam garantidos na saída validada (CategoriaFinanceiraInput).
 */
type CategoriaFormInput = z.input<typeof categoriaFinanceiraSchema>;

export interface CategoriasFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Categoria em edição. Ausente significa criar. */
  categoria?: CategoriaFinanceiraLista | null;
  /** Categorias de nível 1, candidatas a pai. */
  categoriasPai: CategoriaPaiOpcao[];
}

/**
 * Drawer com o formulário de categoria financeira. Cria quando não recebe
 * categoria e edita quando recebe. A categoria pai é opcional e só lista
 * categorias raiz do mesmo tipo. Fecha sozinho ao salvar com sucesso.
 */
export function CategoriasFormDrawer({
  aberto,
  onAbertoChange,
  categoria,
  categoriasPai,
}: CategoriasFormDrawerProps) {
  const editando = Boolean(categoria);

  const form = useForm<CategoriaFormInput, unknown, CategoriaFinanceiraInput>({
    resolver: zodResolver(categoriaFinanceiraSchema),
    defaultValues: { nome: "", tipo: "despesa", paiId: null, ativo: true },
  });

  // Sincroniza o formulário sempre que o drawer abre ou troca de categoria.
  React.useEffect(() => {
    if (!aberto) return;
    if (categoria) {
      form.reset({
        nome: categoria.nome,
        tipo: categoria.tipo,
        paiId: categoria.paiId,
        ativo: categoria.ativo,
      });
    } else {
      form.reset({ nome: "", tipo: "despesa", paiId: null, ativo: true });
    }
  }, [aberto, categoria, form]);

  const tipoSelecionado = form.watch("tipo");

  // Pai só pode ser categoria raiz do mesmo tipo e nunca a própria categoria.
  const opcoesPai = React.useMemo(
    () =>
      categoriasPai.filter(
        (pai) => pai.tipo === tipoSelecionado && pai.id !== categoria?.id,
      ),
    [categoriasPai, tipoSelecionado, categoria?.id],
  );

  // Trocar o tipo invalida um pai de tipo diferente: limpa a seleção.
  React.useEffect(() => {
    const paiAtual = form.getValues("paiId");
    if (paiAtual && !opcoesPai.some((pai) => pai.id === paiAtual)) {
      form.setValue("paiId", null);
    }
  }, [opcoesPai, form]);

  const salvando = form.formState.isSubmitting;

  async function aoEnviar(dados: CategoriaFinanceiraInput) {
    const resultado = categoria
      ? await editarCategoria(categoria.id, dados)
      : await criarCategoria(dados);

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
      descricao="Categorias organizam o plano de contas gerencial de receitas e despesas"
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
            name="tipo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Escolha o tipo" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {TIPOS_CATEGORIA_FINANCEIRA.map((tipo) => (
                      <SelectItem key={tipo} value={tipo}>
                        {ROTULO_TIPO_CATEGORIA_FINANCEIRA[tipo]}
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
            name="nome"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome</FormLabel>
                <FormControl>
                  <Input placeholder="Combustível" autoFocus {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="paiId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Categoria pai</FormLabel>
                <Select
                  value={field.value ?? SEM_PAI}
                  onValueChange={(valor) =>
                    field.onChange(valor === SEM_PAI ? null : valor)
                  }
                  disabled={opcoesPai.length === 0}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Sem categoria pai" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={SEM_PAI}>Sem categoria pai</SelectItem>
                    {opcoesPai.map((pai) => (
                      <SelectItem key={pai.id} value={pai.id}>
                        {pai.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-legenda text-muted-foreground">
                  Opcional. Agrupa esta categoria sob uma categoria raiz do mesmo
                  tipo.
                </p>
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
                  <Label htmlFor="categoria-financeira-ativo">Ativo</Label>
                  <p className="text-legenda text-muted-foreground">
                    Categorias inativas somem das listas de seleção, mas
                    continuam no histórico.
                  </p>
                </div>
                <FormControl>
                  <Switch
                    id="categoria-financeira-ativo"
                    checked={field.value ?? true}
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
