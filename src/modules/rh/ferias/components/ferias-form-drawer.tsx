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
import { criarFerias, editarFerias } from "@/modules/rh/ferias/actions";
import type { FeriasLista } from "@/modules/rh/ferias/queries";
import {
  feriasFormParaInput,
  feriasFormSchema,
  ROTULO_STATUS_FERIAS,
  STATUS_FERIAS,
  type FeriasFormInput,
} from "@/modules/rh/ferias/schemas";
import type { ColaboradorOpcao } from "@/modules/rh/_shared/queries";

const ID_FORM = "form-ferias";

function valoresIniciais(): FeriasFormInput {
  return {
    colaboradorId: "",
    periodoAquisitivoInicio: "",
    periodoAquisitivoFim: "",
    dataInicio: "",
    dataFim: "",
    dias: "30",
    status: "programada",
    observacao: "",
  };
}

export interface FeriasFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  colaboradores: ColaboradorOpcao[];
  /** Férias em edição. Ausente significa criar. */
  ferias?: FeriasLista | null;
}

/**
 * Drawer com o formulário de férias. Cria quando não recebe registro e edita
 * quando recebe. As datas de gozo são opcionais (período só programado).
 * Fecha sozinho ao salvar.
 */
export function FeriasFormDrawer({
  aberto,
  onAbertoChange,
  colaboradores,
  ferias,
}: FeriasFormDrawerProps) {
  const editando = Boolean(ferias);

  const form = useForm<FeriasFormInput>({
    resolver: zodResolver(feriasFormSchema),
    defaultValues: valoresIniciais(),
  });

  // Sincroniza o formulário sempre que o drawer abre ou troca de registro.
  React.useEffect(() => {
    if (!aberto) return;
    if (ferias) {
      form.reset({
        colaboradorId: ferias.colaboradorId,
        periodoAquisitivoInicio: ferias.periodoAquisitivoInicio,
        periodoAquisitivoFim: ferias.periodoAquisitivoFim,
        dataInicio: ferias.dataInicio ?? "",
        dataFim: ferias.dataFim ?? "",
        dias: String(ferias.dias),
        status: ferias.status,
        observacao: ferias.observacao ?? "",
      });
    } else {
      form.reset(valoresIniciais());
    }
  }, [aberto, ferias, form]);

  const salvando = form.formState.isSubmitting;

  async function aoEnviar(dados: FeriasFormInput) {
    const entrada = feriasFormParaInput(dados);
    const resultado = ferias
      ? await editarFerias(ferias.id, entrada)
      : await criarFerias(entrada);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "Férias salvas" : "Férias criadas");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar férias" : "Nova férias"}
      descricao="O limite de gozo é o fim do período aquisitivo mais 12 meses."
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
            {editando ? "Salvar férias" : "Criar férias"}
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
          id="ferias-colaborador"
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
              rotulo: `${colaborador.nome}${colaborador.funcao ? ` - ${colaborador.funcao}` : ""}`,
            }))}
            placeholder="Selecione o colaborador"
            className="w-full"
            id="ferias-colaborador"
          />
        </CampoFormulario>

        <LinhaCampos>
          <CampoFormulario
            id="ferias-periodo-inicio"
            rotulo="Período aquisitivo - início"
            erro={form.formState.errors.periodoAquisitivoInicio?.message}
          >
            <Input
              id="ferias-periodo-inicio"
              type="date"
              {...form.register("periodoAquisitivoInicio")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="ferias-periodo-fim"
            rotulo="Período aquisitivo - fim"
            erro={form.formState.errors.periodoAquisitivoFim?.message}
          >
            <Input
              id="ferias-periodo-fim"
              type="date"
              {...form.register("periodoAquisitivoFim")}
            />
          </CampoFormulario>
        </LinhaCampos>

        <LinhaCampos>
          <CampoFormulario
            id="ferias-gozo-inicio"
            rotulo="Gozo - início"
            erro={form.formState.errors.dataInicio?.message}
          >
            <Input
              id="ferias-gozo-inicio"
              type="date"
              {...form.register("dataInicio")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="ferias-gozo-fim"
            rotulo="Gozo - fim"
            erro={form.formState.errors.dataFim?.message}
          >
            <Input
              id="ferias-gozo-fim"
              type="date"
              {...form.register("dataFim")}
            />
          </CampoFormulario>
        </LinhaCampos>

        <LinhaCampos>
          <CampoFormulario
            id="ferias-dias"
            rotulo="Dias"
            erro={form.formState.errors.dias?.message}
          >
            <Input
              id="ferias-dias"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              className="text-right tabular-nums"
              {...form.register("dias")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="ferias-status"
            rotulo="Status"
            erro={form.formState.errors.status?.message}
          >
            <Combobox
              valor={form.watch("status")}
              onValorChange={(valor) =>
                form.setValue("status", valor as FeriasFormInput["status"], {
                  shouldValidate: true,
                })
              }
              opcoes={STATUS_FERIAS.map((valor) => ({
                valor,
                rotulo: ROTULO_STATUS_FERIAS[valor],
              }))}
              placeholder="Selecione o status"
              className="w-full"
              id="ferias-status"
            />
          </CampoFormulario>
        </LinhaCampos>

        <CampoFormulario
          id="ferias-observacao"
          rotulo="Observação"
          erro={form.formState.errors.observacao?.message}
        >
          <Textarea
            id="ferias-observacao"
            rows={2}
            placeholder="Opcional"
            {...form.register("observacao")}
          />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
