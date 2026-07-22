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

  const categoriaValor = form.watch("categoriaId");
  const unidadeValor = form.watch("unidadeId");

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
      <form
        id={ID_FORM}
        onSubmit={form.handleSubmit(aoEnviar)}
        className={classesFormulario}
        noValidate
      >
        <CampoFormulario
          id="insumo-codigo"
          rotulo="Código"
          erro={form.formState.errors.codigo?.message}
        >
          <Input
            id="insumo-codigo"
            autoComplete="off"
            placeholder="MAT-001"
            disabled={salvando}
            {...form.register("codigo")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="insumo-nome"
          rotulo="Nome"
          erro={form.formState.errors.nome?.message}
        >
          <Input
            id="insumo-nome"
            autoComplete="off"
            placeholder="Brita 1"
            disabled={salvando}
            {...form.register("nome")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="insumo-categoria"
          rotulo="Categoria"
          erro={form.formState.errors.categoriaId?.message}
        >
          <Combobox
            valor={categoriaValor}
            onValorChange={(valor) =>
              form.setValue("categoriaId", valor, { shouldValidate: true })
            }
            opcoes={categorias.map((categoria) => ({
              valor: categoria.id,
              rotulo: categoria.nome,
            }))}
            placeholder="Selecione a categoria"
            disabled={salvando}
            className="w-full"
            id="insumo-categoria"
          />
        </CampoFormulario>

        <CampoFormulario
          id="insumo-unidade"
          rotulo="Unidade de medida"
          erro={form.formState.errors.unidadeId?.message}
        >
          <Combobox
            valor={unidadeValor}
            onValorChange={(valor) =>
              form.setValue("unidadeId", valor, { shouldValidate: true })
            }
            opcoes={unidades.map((unidade) => ({
              valor: unidade.id,
              rotulo: `${unidade.sigla} - ${unidade.nome}`,
            }))}
            placeholder="Selecione a unidade"
            disabled={salvando}
            className="w-full"
            id="insumo-unidade"
          />
        </CampoFormulario>

        <CampoFormulario
          id="insumo-descricao"
          rotulo="Descrição"
          erro={form.formState.errors.descricao?.message}
        >
          <Textarea
            id="insumo-descricao"
            placeholder="Detalhes do insumo"
            rows={3}
            disabled={salvando}
            {...form.register("descricao")}
          />
        </CampoFormulario>

        <SelectAtivo
          value={form.watch("ativo") ?? true}
          onChange={(valor) => form.setValue("ativo", valor)}
          disabled={salvando}
          ajuda="Insumos inativos somem das listas de seleção, mas continuam no histórico."
        />
      </form>
    </FormDrawer>
  );
}
