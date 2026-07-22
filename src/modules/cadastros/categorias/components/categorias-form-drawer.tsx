"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
  SelectAtivo,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

  const tipoValor = form.watch("tipo");

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
      <form
        id={ID_FORM}
        onSubmit={form.handleSubmit(aoEnviar)}
        className={classesFormulario}
      >
        <CampoFormulario
          id="categoria-nome"
          rotulo="Nome"
          erro={form.formState.errors.nome?.message}
        >
          <Input
            id="categoria-nome"
            placeholder="Materiais de construção"
            autoFocus
            {...form.register("nome")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="categoria-tipo"
          rotulo="Tipo"
          erro={form.formState.errors.tipo?.message}
        >
          <Combobox
            valor={tipoValor}
            onValorChange={(valor) =>
              form.setValue("tipo", valor as CategoriaInput["tipo"], {
                shouldValidate: true,
              })
            }
            opcoes={TIPOS_CATEGORIA.map((tipo) => ({
              valor: tipo,
              rotulo: ROTULO_TIPO_CATEGORIA[tipo],
            }))}
            placeholder="Escolha o tipo"
            className="w-full"
            id="categoria-tipo"
          />
        </CampoFormulario>

        <SelectAtivo
          value={form.watch("ativo") ?? true}
          onChange={(valor) => form.setValue("ativo", valor)}
          ajuda="Categorias inativas somem das listas de seleção, mas continuam no histórico."
        />
      </form>
    </FormDrawer>
  );
}
