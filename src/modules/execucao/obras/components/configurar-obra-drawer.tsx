"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Settings2 } from "lucide-react";

import { CampoFormulario, classesFormulario, Combobox, FormDrawer, submeterComAviso } from "@/components/canonicos";
import { semDerrubarSucesso } from "@/components/canonicos/acao-sem-silencio";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { configurarObra } from "@/modules/execucao/obras/actions";
import type { ObraPasta } from "@/modules/execucao/obras/queries";
import { configurarObraSchema, type ConfigurarObraInput } from "@/modules/execucao/obras/schemas";
import { ROTULO_TIPO_OBRA, TIPOS_OBRA } from "@/modules/execucao/_shared/rotulos";

const ID_FORM = "form-configurar-obra";
const OPCOES_TIPO = TIPOS_OBRA.map((t) => ({ valor: t, rotulo: ROTULO_TIPO_OBRA[t] }));

const paraCampo = (v: string | null) => (v === null ? "" : v.replace(".", ","));

function iniciais(o: ObraPasta): ConfigurarObraInput {
  return {
    tipoObra: o.tipoObra,
    calendarioId: o.calendarioId ?? undefined,
    kmInicial: paraCampo(o.kmInicial),
    kmFinal: paraCampo(o.kmFinal),
    metrosPorEstaca: paraCampo(o.metrosPorEstaca),
    ppcLimite: paraCampo(o.ppcLimite),
    observacoes: o.observacoes ?? "",
  };
}

export interface ConfigurarObraDrawerProps {
  obra: ObraPasta;
  calendarios: { id: string; nome: string }[];
}

export function ConfigurarObraDrawer({ obra, calendarios }: ConfigurarObraDrawerProps) {
  const router = useRouter();
  const [aberto, setAberto] = React.useState(false);
  const form = useForm<ConfigurarObraInput, unknown, z.output<typeof configurarObraSchema>>({ resolver: zodResolver(configurarObraSchema), defaultValues: iniciais(obra) });
  const salvando = form.formState.isSubmitting;
  const erros = form.formState.errors;

  React.useEffect(() => {
    if (aberto) {
      form.reset(iniciais(obra));
    }
  }, [aberto, form, obra]);

  const [tipoObra, calendarioId] = useWatch({ control: form.control, name: ["tipoObra", "calendarioId"] });
  const opcoesCalendario = [{ valor: "", rotulo: "Sem calendário" }, ...calendarios.map((c) => ({ valor: c.id, rotulo: c.nome }))];

  async function aoEnviar(valores: ConfigurarObraInput) {
    form.clearErrors("root");
    const r = await configurarObra(obra.obraId, valores);
    if ("erro" in r) {
      form.setError("root", { message: r.erro });
      return;
    }
    toast.success("Configuração salva");
    setAberto(false);
    semDerrubarSucesso("execucao.obras.configurar.refresh", () => router.refresh());
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setAberto(true)}>
        <Settings2 />
        Configurar obra
      </Button>
      <FormDrawer
        aberto={aberto}
        onAbertoChange={setAberto}
        titulo="Configurar obra"
        descricao="Vale para todos os cronogramas da pasta"
        temAlteracoesNaoSalvas={form.formState.isDirty && !salvando}
        rodape={
          <>
            {erros.root?.message ? (
              <p role="alert" className="mr-auto text-detalhe text-destructive">
                {erros.root?.message}
              </p>
            ) : null}
            <Button type="button" variant="outline" onClick={() => setAberto(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="submit" form={ID_FORM} disabled={salvando}>
              {salvando ? (
                <>
                  <LoaderCircle className="animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar"
              )}
            </Button>
          </>
        }
      >
        <form id={ID_FORM} onSubmit={submeterComAviso(form, () => aoEnviar(form.getValues()))} className={classesFormulario} noValidate>
          <CampoFormulario id="obra-tipo" rotulo="Tipo da obra" obrigatorio erro={erros.tipoObra?.message}>
            <Combobox
              id="obra-tipo"
              valor={tipoObra ?? ""}
              onValorChange={(v) => form.setValue("tipoObra", v as ConfigurarObraInput["tipoObra"], { shouldDirty: true, shouldValidate: true })}
              opcoes={OPCOES_TIPO}
              disabled={salvando}
            />
          </CampoFormulario>
          <CampoFormulario id="obra-calendario" rotulo="Calendário padrão da obra" erro={erros.calendarioId?.message}>
            <Combobox
              id="obra-calendario"
              valor={calendarioId ?? ""}
              onValorChange={(v) => form.setValue("calendarioId", v || undefined, { shouldDirty: true, shouldValidate: true })}
              opcoes={opcoesCalendario}
              disabled={salvando}
            />
          </CampoFormulario>
          {tipoObra === "rodovia" ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <CampoFormulario id="obra-km-ini" rotulo="Km inicial" erro={erros.kmInicial?.message}>
                <Input id="obra-km-ini" inputMode="decimal" className="text-right tabular-nums" disabled={salvando} {...form.register("kmInicial")} />
              </CampoFormulario>
              <CampoFormulario id="obra-km-fim" rotulo="Km final" erro={erros.kmFinal?.message}>
                <Input id="obra-km-fim" inputMode="decimal" className="text-right tabular-nums" disabled={salvando} {...form.register("kmFinal")} />
              </CampoFormulario>
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <CampoFormulario id="obra-estaca" rotulo="Metros por estaca" erro={erros.metrosPorEstaca?.message}>
              <Input id="obra-estaca" inputMode="decimal" className="text-right tabular-nums" disabled={salvando} {...form.register("metrosPorEstaca")} />
            </CampoFormulario>
            <CampoFormulario id="obra-ppc" rotulo="PPC mínimo (%)" erro={erros.ppcLimite?.message}>
              <Input id="obra-ppc" inputMode="decimal" className="text-right tabular-nums" disabled={salvando} {...form.register("ppcLimite")} />
            </CampoFormulario>
          </div>
          <CampoFormulario id="obra-obs" rotulo="Observações" erro={erros.observacoes?.message}>
            <Textarea id="obra-obs" rows={3} disabled={salvando} {...form.register("observacoes")} />
          </CampoFormulario>
        </form>
      </FormDrawer>
    </>
  );
}
