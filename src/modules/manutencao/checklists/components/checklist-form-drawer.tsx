"use client";

import * as React from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { GripVertical, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";

import { FormDrawer } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  CampoFormulario,
  classesFormulario,
} from "@/modules/cadastros/_shared/campos";
import {
  criarChecklist,
  editarChecklist,
} from "@/modules/manutencao/checklists/actions";
import type { ChecklistModelo } from "@/modules/manutencao/checklists/queries";
import { checklistSchema } from "@/modules/manutencao/checklists/schemas";

const ID_FORM = "form-checklist";

/**
 * Entrada do formulário: ativo tem default no schema, então é opcional na
 * entrada e garantido na saída validada (ChecklistInput).
 */
type ChecklistFormInput = z.input<typeof checklistSchema>;

/** Pergunta em branco para o array. */
function perguntaVazia(ordem: number): ChecklistFormInput["perguntas"][number] {
  return { pergunta: "", ordem };
}

/** Valores iniciais a partir de um modelo, ou em branco com uma pergunta. */
function valoresIniciais(modelo: ChecklistModelo | null): ChecklistFormInput {
  if (!modelo) {
    return {
      nome: "",
      descricao: "",
      ativo: true,
      perguntas: [perguntaVazia(0)],
    };
  }
  return {
    nome: modelo.nome,
    descricao: modelo.descricao ?? "",
    ativo: modelo.ativo,
    perguntas:
      modelo.perguntas.length > 0
        ? modelo.perguntas.map((p, indice) => ({
            pergunta: p.pergunta,
            ordem: indice,
          }))
        : [perguntaVazia(0)],
  };
}

export interface ChecklistFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Modelo em edição, ou null para criar. */
  modelo?: ChecklistModelo | null;
}

/**
 * Drawer de criação e edição de modelo de checklist: nome, descrição, status e
 * a lista de perguntas (adicionar/remover via useFieldArray). Fecha sozinho ao
 * salvar com sucesso.
 */
export function ChecklistFormDrawer({
  aberto,
  onAbertoChange,
  modelo,
}: ChecklistFormDrawerProps) {
  const editando = Boolean(modelo);

  const form = useForm<ChecklistFormInput>({
    resolver: zodResolver(checklistSchema),
    defaultValues: valoresIniciais(modelo ?? null),
  });

  const perguntas = useFieldArray({
    control: form.control,
    name: "perguntas",
  });

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais(modelo ?? null));
  }, [aberto, modelo, form]);

  const salvando = form.formState.isSubmitting;
  const ativo = form.watch("ativo") ?? true;
  const erroPerguntas = form.formState.errors.perguntas;

  async function aoEnviar(valores: ChecklistFormInput) {
    const dados = {
      nome: valores.nome,
      descricao: valores.descricao,
      ativo: valores.ativo ?? true,
      // Reindexa a ordem pela posição atual da lista.
      perguntas: valores.perguntas.map((item, indice) => ({
        pergunta: item.pergunta,
        ordem: indice,
      })),
    };

    const resultado = modelo
      ? await editarChecklist(modelo.id, dados)
      : await criarChecklist(dados);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "Checklist salvo" : "Checklist criado");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar checklist" : "Novo checklist"}
      descricao="Modelos de checklist pré-uso. Cada pergunta é respondida com OK, Não OK ou N/A na execução."
      larguraClassName="sm:max-w-2xl"
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
            {editando ? "Salvar checklist" : "Criar checklist"}
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
          id="checklist-nome"
          rotulo="Nome"
          obrigatorio
          erro={form.formState.errors.nome?.message}
        >
          <Input
            id="checklist-nome"
            placeholder="Ex: Inspeção diária de caminhão"
            autoFocus
            disabled={salvando}
            {...form.register("nome")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="checklist-descricao"
          rotulo="Descrição"
          ajuda="Opcional"
          erro={form.formState.errors.descricao?.message}
        >
          <Textarea
            id="checklist-descricao"
            rows={2}
            placeholder="Para que serve este checklist"
            disabled={salvando}
            {...form.register("descricao")}
          />
        </CampoFormulario>

        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="checklist-ativo">Ativo</Label>
            <p className="text-legenda text-muted-foreground">
              Checklists inativos somem da tela de execução, mas continuam no
              histórico.
            </p>
          </div>
          <Switch
            id="checklist-ativo"
            checked={ativo}
            onCheckedChange={(valor) => form.setValue("ativo", valor)}
            disabled={salvando}
            aria-label="Ativo"
          />
        </div>

        {/* Perguntas */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-detalhe font-semibold">Perguntas</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={salvando}
              onClick={() => perguntas.append(perguntaVazia(perguntas.fields.length))}
            >
              <Plus />
              Adicionar pergunta
            </Button>
          </div>

          {typeof erroPerguntas?.message === "string" ? (
            <p className="text-legenda text-destructive" role="alert">
              {erroPerguntas.message}
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            {perguntas.fields.map((field, indice) => {
              const erroPergunta =
                form.formState.errors.perguntas?.[indice]?.pergunta?.message;
              return (
                <div
                  key={field.id}
                  className="grid grid-cols-[auto_1fr_auto] items-start gap-2 rounded-md border border-border bg-surface px-3 py-2.5"
                >
                  <span className="mt-2.5 text-muted-foreground" aria-hidden>
                    <GripVertical className="size-4" />
                  </span>
                  <CampoFormulario
                    id={`checklist-pergunta-${indice}`}
                    rotulo={`Pergunta ${indice + 1}`}
                    obrigatorio
                    erro={erroPergunta}
                  >
                    <Input
                      id={`checklist-pergunta-${indice}`}
                      placeholder="Ex: Os freios estão funcionando?"
                      disabled={salvando}
                      {...form.register(`perguntas.${indice}.pergunta`)}
                    />
                  </CampoFormulario>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="mt-7"
                    aria-label="Remover pergunta"
                    disabled={salvando || perguntas.fields.length === 1}
                    onClick={() => perguntas.remove(indice)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      </form>
    </FormDrawer>
  );
}
