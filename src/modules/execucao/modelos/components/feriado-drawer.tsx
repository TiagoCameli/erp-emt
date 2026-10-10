"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";

import { CampoFormulario, classesFormulario, Combobox, FormDrawer, submeterComAviso } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { salvarFeriado } from "@/modules/execucao/modelos/actions";
import type { Feriado } from "@/modules/execucao/modelos/queries";
import { feriadoSchema, type FeriadoInput } from "@/modules/execucao/modelos/schemas";

const ID_FORM = "form-feriado";
const OPCOES = [
  { valor: "nacional", rotulo: "Nacional" },
  { valor: "AC", rotulo: "Acre" },
  { valor: "municipal", rotulo: "Municipal" },
];

export interface FeriadoDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Feriado em edição; ausente: novo. */
  feriado?: Feriado | null;
  onSalvo?: () => void;
}

function iniciais(f: Feriado | null | undefined): FeriadoInput {
  if (!f) return { data: "", nome: "", abrangencia: "nacional", municipio: "" };
  return { data: f.data, nome: f.nome, abrangencia: f.abrangencia, municipio: f.municipio ?? "" };
}

export function FeriadoDrawer({ aberto, onAbertoChange, feriado, onSalvo }: FeriadoDrawerProps) {
  const editando = Boolean(feriado);
  const form = useForm<FeriadoInput, unknown, z.output<typeof feriadoSchema>>({ resolver: zodResolver(feriadoSchema), defaultValues: iniciais(feriado) });
  const salvando = form.formState.isSubmitting;
  const erros = form.formState.errors;

  React.useEffect(() => {
    if (aberto) form.reset(iniciais(feriado));
  }, [aberto, form, feriado]);

  const abrangencia = useWatch({ control: form.control, name: "abrangencia" });

  async function aoEnviar(valores: FeriadoInput) {
    form.clearErrors("root");
    const resultado = await salvarFeriado(feriado?.id ?? null, valores);
    if ("erro" in resultado) {
      form.setError("root", { message: resultado.erro });
      return;
    }
    toast.success(editando ? "Feriado atualizado" : "Feriado cadastrado");
    onAbertoChange(false);
    onSalvo?.();
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar feriado" : "Novo feriado"}
      descricao="Vale para todos os cronogramas cujo calendário usa essa abrangência"
      temAlteracoesNaoSalvas={form.formState.isDirty && !salvando}
      rodape={
        <>
          {erros.root?.message ? (
            <p role="alert" className="mr-auto text-detalhe text-destructive">
              {erros.root.message}
            </p>
          ) : null}
          <Button type="button" variant="outline" onClick={() => onAbertoChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="submit" form={ID_FORM} disabled={salvando}>
            {salvando ? (
              <>
                <LoaderCircle className="animate-spin" />
                Salvando...
              </>
            ) : (
              "Salvar feriado"
            )}
          </Button>
        </>
      }
    >
      <form id={ID_FORM} onSubmit={submeterComAviso(form, () => aoEnviar(form.getValues()))} className={classesFormulario} noValidate>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <CampoFormulario id="feriado-data" rotulo="Data" obrigatorio erro={erros.data?.message}>
            <Input id="feriado-data" type="date" disabled={salvando} {...form.register("data")} />
          </CampoFormulario>
          <CampoFormulario id="feriado-abrangencia" rotulo="Abrangência" obrigatorio erro={erros.abrangencia?.message}>
            <Combobox
              id="feriado-abrangencia"
              valor={abrangencia ?? "nacional"}
              onValorChange={(v) => form.setValue("abrangencia", v as FeriadoInput["abrangencia"], { shouldDirty: true, shouldValidate: true })}
              opcoes={OPCOES}
              disabled={salvando}
            />
          </CampoFormulario>
        </div>
        <CampoFormulario id="feriado-nome" rotulo="Nome" obrigatorio erro={erros.nome?.message}>
          <Input id="feriado-nome" disabled={salvando} {...form.register("nome")} />
        </CampoFormulario>
        {abrangencia === "municipal" ? (
          <CampoFormulario id="feriado-municipio" rotulo="Município" obrigatorio erro={erros.municipio?.message}>
            <Input id="feriado-municipio" disabled={salvando} {...form.register("municipio")} />
          </CampoFormulario>
        ) : null}
      </form>
    </FormDrawer>
  );
}
