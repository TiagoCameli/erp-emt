"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
  LinhaCampos,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { dataHojeISO } from "@/lib/formatadores";
import {
  criarOcorrencia,
  editarOcorrencia,
} from "@/modules/rh/ocorrencias/actions";
import type { OcorrenciaLista } from "@/modules/rh/ocorrencias/queries";
import {
  ocorrenciaFormParaInput,
  ocorrenciaFormSchema,
  ROTULO_TIPO_OCORRENCIA,
  TIPOS_OCORRENCIA,
  type OcorrenciaFormInput,
} from "@/modules/rh/ocorrencias/schemas";
import type { ColaboradorOpcao } from "@/modules/rh/_shared/queries";

const ID_FORM = "form-ocorrencia";

function valoresIniciais(): OcorrenciaFormInput {
  return {
    colaboradorId: "",
    data: dataHojeISO(),
    tipo: "advertencia",
    descricao: "",
    observacao: "",
  };
}

export interface OcorrenciaFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  colaboradores: ColaboradorOpcao[];
  /** Ocorrência em edição. Ausente significa criar. */
  ocorrencia?: OcorrenciaLista | null;
}

/**
 * Drawer com o formulário de ocorrência. Cria quando não recebe registro e
 * edita quando recebe. Fecha sozinho ao salvar.
 */
export function OcorrenciaFormDrawer({
  aberto,
  onAbertoChange,
  colaboradores,
  ocorrencia,
}: OcorrenciaFormDrawerProps) {
  const editando = Boolean(ocorrencia);

  const form = useForm<OcorrenciaFormInput>({
    resolver: zodResolver(ocorrenciaFormSchema),
    defaultValues: valoresIniciais(),
  });

  // Sincroniza o formulário sempre que o drawer abre ou troca de registro.
  React.useEffect(() => {
    if (!aberto) return;
    if (ocorrencia) {
      form.reset({
        colaboradorId: ocorrencia.colaboradorId,
        data: ocorrencia.data,
        tipo: ocorrencia.tipo,
        descricao: ocorrencia.descricao,
        observacao: ocorrencia.observacao ?? "",
      });
    } else {
      form.reset(valoresIniciais());
    }
  }, [aberto, ocorrencia, form]);

  const salvando = form.formState.isSubmitting;

  async function aoEnviar(dados: OcorrenciaFormInput) {
    const entrada = ocorrenciaFormParaInput(dados);
    const resultado = ocorrencia
      ? await editarOcorrencia(ocorrencia.id, entrada)
      : await criarOcorrencia(entrada);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "Ocorrência salva" : "Ocorrência criada");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar ocorrência" : "Nova ocorrência"}
      descricao="Ausências e ocorrências por colaborador."
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
            {editando ? "Salvar ocorrência" : "Criar ocorrência"}
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
          id="ocorrencia-colaborador"
          rotulo="Colaborador"
          erro={form.formState.errors.colaboradorId?.message}
        >
          <Combobox
            valor={form.watch("colaboradorId")}
            onValorChange={(valor) =>
              form.setValue("colaboradorId", valor, { shouldValidate: true })
            }
            opcoes={colaboradores.map((colaborador) => ({
              valor: colaborador.id,
              rotulo: `${colaborador.nome}${
                colaborador.funcao ? ` - ${colaborador.funcao}` : ""
              }`,
            }))}
            placeholder="Selecione o colaborador"
            className="w-full"
            id="ocorrencia-colaborador"
          />
        </CampoFormulario>

        <LinhaCampos>
          <CampoFormulario
            id="ocorrencia-data"
            rotulo="Data"
            erro={form.formState.errors.data?.message}
          >
            <Input
              id="ocorrencia-data"
              type="date"
              {...form.register("data")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="ocorrencia-tipo"
            rotulo="Tipo"
            erro={form.formState.errors.tipo?.message}
          >
            <Combobox
              valor={form.watch("tipo")}
              onValorChange={(valor) =>
                form.setValue("tipo", valor as OcorrenciaFormInput["tipo"], {
                  shouldValidate: true,
                })
              }
              opcoes={TIPOS_OCORRENCIA.map((valor) => ({
                valor,
                rotulo: ROTULO_TIPO_OCORRENCIA[valor],
              }))}
              placeholder="Selecione o tipo"
              className="w-full"
              id="ocorrencia-tipo"
            />
          </CampoFormulario>
        </LinhaCampos>

        <CampoFormulario
          id="ocorrencia-descricao"
          rotulo="Descrição"
          erro={form.formState.errors.descricao?.message}
        >
          <Textarea
            id="ocorrencia-descricao"
            rows={3}
            placeholder="O que aconteceu"
            {...form.register("descricao")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="ocorrencia-observacao"
          rotulo="Observação"
          erro={form.formState.errors.observacao?.message}
        >
          <Textarea
            id="ocorrencia-observacao"
            rows={2}
            placeholder="Opcional"
            {...form.register("observacao")}
          />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
