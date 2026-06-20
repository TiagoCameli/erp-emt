"use client";

import * as React from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { FormDrawer } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CampoFormulario,
  classesFormulario,
  SelectAtivo,
} from "@/modules/cadastros/_shared/campos";
import {
  criarPlano,
  editarPlano,
} from "@/modules/manutencao/planos-preventivos/actions";
import type { PlanoLista } from "@/modules/manutencao/planos-preventivos/queries";
import {
  INTERVALOS_TIPO,
  planoFormParaInput,
  planoFormSchema,
  ROTULO_INTERVALO_TIPO,
  type PlanoFormInput,
} from "@/modules/manutencao/planos-preventivos/schemas";

const ID_FORM = "form-plano-preventivo";

/** Atividade em branco para o array. */
function atividadeVazia(): PlanoFormInput["atividades"][number] {
  return { descricao: "", intervaloTipo: "horimetro", intervaloValor: "" };
}

/** Valores iniciais do formulário, a partir de um plano ou em branco. */
function valoresIniciais(plano: PlanoLista | null): PlanoFormInput {
  if (!plano) {
    return {
      nome: "",
      descricao: "",
      ativo: true,
      atividades: [atividadeVazia()],
    };
  }
  return {
    nome: plano.nome,
    descricao: plano.descricao ?? "",
    ativo: plano.ativo,
    atividades:
      plano.atividades.length > 0
        ? plano.atividades.map((atividade) => ({
            descricao: atividade.descricao,
            intervaloTipo: atividade.intervaloTipo,
            intervaloValor: String(atividade.intervaloValor).replace(".", ","),
          }))
        : [atividadeVazia()],
  };
}

export interface PlanoFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Plano em edição, ou null para criar. */
  plano: PlanoLista | null;
}

/**
 * Drawer de criação e edição de um modelo de plano: nome, descrição, status e
 * a lista de atividades (cada uma com base, intervalo e descrição). As
 * atividades são trocadas por inteiro no servidor. Fecha sozinho no sucesso.
 */
export function PlanoFormDrawer({
  aberto,
  onAbertoChange,
  plano,
}: PlanoFormDrawerProps) {
  const editando = plano !== null;

  const form = useForm<PlanoFormInput>({
    resolver: zodResolver(planoFormSchema),
    defaultValues: valoresIniciais(plano),
  });

  const atividades = useFieldArray({
    control: form.control,
    name: "atividades",
  });

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais(plano));
  }, [aberto, plano, form]);

  const salvando = form.formState.isSubmitting;
  const ativo = form.watch("ativo");
  const erroAtividades = form.formState.errors.atividades;

  async function aoEnviar(valores: PlanoFormInput) {
    const dados = planoFormParaInput(valores);
    const resultado = plano
      ? await editarPlano(plano.id, dados)
      : await criarPlano(dados);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(editando ? "Plano salvo" : "Plano criado");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar plano" : "Novo plano"}
      descricao="Defina o nome do plano e as atividades, cada uma com a base e o intervalo de manutenção."
      larguraClassName="sm:max-w-2xl"
      rodape={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => onAbertoChange(false)}
            disabled={salvando}
          >
            Cancelar
          </Button>
          <Button type="submit" form={ID_FORM} disabled={salvando}>
            {salvando ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : null}
            {editando ? "Salvar plano" : "Criar plano"}
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
          id="plano-nome"
          rotulo="Nome"
          obrigatorio
          erro={form.formState.errors.nome?.message}
        >
          <Input
            id="plano-nome"
            placeholder="Ex: Revisão de escavadeira"
            autoFocus
            disabled={salvando}
            {...form.register("nome")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="plano-descricao"
          rotulo="Descrição"
          ajuda="Opcional"
          erro={form.formState.errors.descricao?.message}
        >
          <Textarea
            id="plano-descricao"
            rows={2}
            placeholder="Detalhes do plano"
            disabled={salvando}
            {...form.register("descricao")}
          />
        </CampoFormulario>

        {/* Atividades */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-detalhe font-semibold">Atividades</h3>
              <p className="text-legenda text-muted-foreground">
                Cada atividade vence pelo intervalo da sua base (horímetro, km ou
                dias).
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={salvando}
              onClick={() => atividades.append(atividadeVazia())}
            >
              <Plus />
              Adicionar atividade
            </Button>
          </div>

          {typeof erroAtividades?.message === "string" ? (
            <p className="text-legenda text-destructive" role="alert">
              {erroAtividades.message}
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            {atividades.fields.map((field, indice) => {
              const erros = form.formState.errors.atividades?.[indice];
              return (
                <div
                  key={field.id}
                  className="grid grid-cols-[1fr_auto] items-start gap-2 rounded-md border border-border bg-surface px-3 py-2.5"
                >
                  <div className="flex flex-col gap-2">
                    <CampoFormulario
                      id={`plano-atividade-desc-${indice}`}
                      rotulo="Atividade"
                      obrigatorio
                      erro={erros?.descricao?.message}
                    >
                      <Input
                        id={`plano-atividade-desc-${indice}`}
                        placeholder="Ex: Troca de óleo do motor"
                        disabled={salvando}
                        {...form.register(`atividades.${indice}.descricao`)}
                      />
                    </CampoFormulario>

                    <div className="grid grid-cols-2 gap-2">
                      <CampoFormulario
                        id={`plano-atividade-tipo-${indice}`}
                        rotulo="Base"
                        obrigatorio
                        erro={erros?.intervaloTipo?.message}
                      >
                        <Select
                          value={form.watch(
                            `atividades.${indice}.intervaloTipo`,
                          )}
                          onValueChange={(valor) =>
                            form.setValue(
                              `atividades.${indice}.intervaloTipo`,
                              valor as PlanoFormInput["atividades"][number]["intervaloTipo"],
                              { shouldValidate: true },
                            )
                          }
                          disabled={salvando}
                        >
                          <SelectTrigger
                            id={`plano-atividade-tipo-${indice}`}
                            className="w-full"
                          >
                            <SelectValue placeholder="Base" />
                          </SelectTrigger>
                          <SelectContent>
                            {INTERVALOS_TIPO.map((tipo) => (
                              <SelectItem key={tipo} value={tipo}>
                                {ROTULO_INTERVALO_TIPO[tipo]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </CampoFormulario>

                      <CampoFormulario
                        id={`plano-atividade-valor-${indice}`}
                        rotulo="Intervalo"
                        obrigatorio
                        erro={erros?.intervaloValor?.message}
                      >
                        <Input
                          id={`plano-atividade-valor-${indice}`}
                          inputMode="decimal"
                          placeholder="0"
                          className="text-right tabular-nums"
                          disabled={salvando}
                          {...form.register(
                            `atividades.${indice}.intervaloValor`,
                          )}
                        />
                      </CampoFormulario>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="mt-7"
                    aria-label="Remover atividade"
                    disabled={salvando || atividades.fields.length === 1}
                    onClick={() => atividades.remove(indice)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>

        <SelectAtivo
          value={ativo}
          onChange={(valor) => form.setValue("ativo", valor)}
          disabled={salvando}
          ajuda="Planos inativos somem da lista de atribuição, mas continuam no histórico."
        />
      </form>
    </FormDrawer>
  );
}
