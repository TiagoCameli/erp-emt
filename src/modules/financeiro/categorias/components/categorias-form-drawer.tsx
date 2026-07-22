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

  const paiValor = form.watch("paiId") ?? SEM_PAI;

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
      <form
        id={ID_FORM}
        onSubmit={form.handleSubmit(aoEnviar)}
        className={classesFormulario}
        noValidate
      >
        <CampoFormulario
          id="categoria-tipo"
          rotulo="Tipo"
          erro={form.formState.errors.tipo?.message}
        >
          <Combobox
            valor={tipoSelecionado}
            onValorChange={(valor) =>
              form.setValue("tipo", valor as CategoriaFinanceiraInput["tipo"], {
                shouldValidate: true,
              })
            }
            opcoes={TIPOS_CATEGORIA_FINANCEIRA.map((tipo) => ({
              valor: tipo,
              rotulo: ROTULO_TIPO_CATEGORIA_FINANCEIRA[tipo],
            }))}
            placeholder="Escolha o tipo"
            className="w-full"
            id="categoria-tipo"
          />
        </CampoFormulario>

        <CampoFormulario
          id="categoria-nome"
          rotulo="Nome"
          erro={form.formState.errors.nome?.message}
        >
          <Input
            id="categoria-nome"
            placeholder="Combustível"
            autoFocus
            {...form.register("nome")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="categoria-pai"
          rotulo="Categoria pai"
          ajuda="Opcional. Agrupa esta categoria sob uma categoria raiz do mesmo tipo."
          erro={form.formState.errors.paiId?.message}
        >
          <Combobox
            valor={paiValor}
            onValorChange={(valor) =>
              form.setValue("paiId", valor === SEM_PAI ? null : valor)
            }
            opcoes={[
              { valor: SEM_PAI, rotulo: "Sem categoria pai" },
              ...opcoesPai.map((pai) => ({
                valor: pai.id,
                rotulo: pai.nome,
              })),
            ]}
            placeholder="Sem categoria pai"
            disabled={opcoesPai.length === 0}
            className="w-full"
            id="categoria-pai"
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
