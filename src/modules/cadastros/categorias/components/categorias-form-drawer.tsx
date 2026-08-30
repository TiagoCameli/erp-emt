"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { toast } from "@/components/canonicos/toast";
import type { z } from "zod";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
  SelectAtivo,
  submeterComAviso,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { criar, editar } from "@/modules/cadastros/categorias/actions";
import type {
  CategoriaCustoOpcao,
  CategoriaLista,
  GrupoOpcao,
} from "@/modules/cadastros/categorias/queries";
import {
  categoriaSchema,
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
  /** Subcategoria em edição. Ausente significa criar. */
  categoria?: CategoriaLista | null;
  /** Grupo já escolhido (o botão "Nova subcategoria" nasce dentro do grupo). */
  grupoPadrao?: string | null;
  /** Os 4 grupos fixos. */
  grupos: GrupoOpcao[];
  /**
   * Categorias de custo (as do DRE) para o seletor. Chegaram aqui em 28/08/2026,
   * quando a classificação saiu do insumo: é nesta tela que ela passou a ser
   * decidida, uma vez por subcategoria.
   */
  categoriasCusto: CategoriaCustoOpcao[];
}

/**
 * Drawer com o formulário de categoria de insumo. Cria quando não recebe
 * categoria e edita quando recebe. Fecha sozinho ao salvar com sucesso.
 */
export function CategoriasFormDrawer({
  aberto,
  onAbertoChange,
  categoria,
  grupoPadrao,
  grupos,
  categoriasCusto,
}: CategoriasFormDrawerProps) {
  const editando = Boolean(categoria);

  const form = useForm<CategoriaFormInput, unknown, CategoriaInput>({
    resolver: zodResolver(categoriaSchema),
    defaultValues: {
      nome: "",
      grupoId: grupoPadrao ?? grupos[0]?.id ?? "",
      categoriaCustoId: "",
      ativo: true,
    },
  });

  // Sincroniza o formulário sempre que o drawer abre ou troca de categoria.
  React.useEffect(() => {
    if (!aberto) return;
    if (categoria) {
      form.reset({
        nome: categoria.nome,
        grupoId: categoria.grupoId,
        categoriaCustoId: categoria.categoriaCustoId ?? "",
        ativo: categoria.ativo,
      });
    } else {
      form.reset({
        nome: "",
        grupoId: grupoPadrao ?? grupos[0]?.id ?? "",
        categoriaCustoId: "",
        ativo: true,
      });
    }
  }, [aberto, categoria, form, grupoPadrao, grupos]);

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

  const grupoValor = form.watch("grupoId");
  const categoriaCustoValor = form.watch("categoriaCustoId") ?? "";
  /** Quantos insumos herdam esta escolha. É o tamanho do que se está mexendo. */
  const insumosAfetados = categoria?.insumos ?? 0;

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar subcategoria" : "Nova subcategoria"}
      descricao="Subcategoria é o detalhe dentro de um dos 4 grupos, e é ela que o insumo aponta"
      temAlteracoesNaoSalvas={form.formState.isDirty && !salvando}
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
            {editando ? "Salvar subcategoria" : "Criar subcategoria"}
          </Button>
        </>
      }
    >
      <form
        id={ID_FORM}
        onSubmit={submeterComAviso(form, aoEnviar)}
        className={classesFormulario}
      >
        <CampoFormulario
          id="categoria-nome"
          rotulo="Nome"
          erro={form.formState.errors.nome?.message}
        >
          <Input
            id="categoria-nome"
            placeholder="Cimento, agregados e concreto"
            autoFocus
            {...form.register("nome")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="categoria-grupo"
          rotulo="Grupo"
          obrigatorio
          ajuda="Os 4 grupos são fixos: mudar o grupo de uma subcategoria muda em qual grupo o custo dela aparece nos relatórios"
          erro={form.formState.errors.grupoId?.message}
        >
          <Combobox
            valor={grupoValor}
            onValorChange={(valor) =>
              form.setValue("grupoId", valor, { shouldValidate: true })
            }
            opcoes={grupos.map((grupo) => ({
              valor: grupo.id,
              rotulo: grupo.nome,
            }))}
            placeholder="Escolha o grupo"
            className="w-full"
            id="categoria-grupo"
          />
        </CampoFormulario>

        <CampoFormulario
          id="categoria-custo"
          rotulo="Categoria de custo"
          ajuda="É por aqui que a compra de TODO insumo desta subcategoria entra no DRE. Vazio deixa a subcategoria sem classificação, e a ordem de compra que usar um insumo dela não pode ser aprovada."
          erro={form.formState.errors.categoriaCustoId?.message}
        >
          <Combobox
            valor={categoriaCustoValor}
            onValorChange={(valor) =>
              form.setValue("categoriaCustoId", valor, { shouldValidate: true })
            }
            opcoes={categoriasCusto.map((c) => ({
              valor: c.id,
              rotulo: c.nome,
            }))}
            placeholder="Sem categoria de custo"
            className="w-full"
            id="categoria-custo"
          />
          {/*
            O tamanho do que se está mexendo, quando há insumo herdando. Sem este
            número a escolha parece local: em "Peças e componentes" ela decide o
            DRE de 990 insumos.
          */}
          {editando && insumosAfetados > 0 ? (
            <p className="text-legenda text-muted-foreground">
              {insumosAfetados === 1
                ? "1 insumo desta subcategoria passa a entrar no DRE por esta categoria."
                : `${insumosAfetados} insumos desta subcategoria passam a entrar no DRE por esta categoria.`}{" "}
              As compras já lançadas são reclassificadas junto.
            </p>
          ) : null}
        </CampoFormulario>

        <SelectAtivo
          value={form.watch("ativo") ?? true}
          onChange={(valor) => form.setValue("ativo", valor)}
          ajuda="Subcategorias inativas somem das listas de seleção, mas continuam no histórico."
        />
      </form>
    </FormDrawer>
  );
}
