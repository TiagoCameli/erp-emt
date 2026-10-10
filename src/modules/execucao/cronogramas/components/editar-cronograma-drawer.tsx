"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Pencil } from "lucide-react";

import { CampoFormulario, classesFormulario, Combobox, FormDrawer, submeterComAviso } from "@/components/canonicos";
import { semDerrubarSucesso } from "@/components/canonicos/acao-sem-silencio";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CRITERIOS_PESO, ROTULO_CRITERIO_PESO } from "@/modules/execucao/_shared/rotulos";
import { salvarCronograma } from "@/modules/execucao/cronogramas/actions";
import type { CronogramaLista } from "@/modules/execucao/cronogramas/queries";
import { cronogramaSchema, type CronogramaInput } from "@/modules/execucao/cronogramas/schemas";

const ID_FORM = "form-editar-cronograma";
const OPCOES_CRITERIO = CRITERIOS_PESO.map((c) => ({ valor: c, rotulo: ROTULO_CRITERIO_PESO[c] }));

function iniciais(c: CronogramaLista): CronogramaInput {
  return {
    codigo: c.codigo,
    nome: c.nome,
    dataInicio: c.dataInicio ?? "",
    dataCorte: c.dataCorte ?? "",
    criterioPeso: c.criterioPeso,
    observacoes: c.observacoes ?? "",
  };
}

/** Botão "Editar dados" + drawer com os dados do cronograma. Salvar recalcula as datas no banco. */
export function EditarCronogramaDrawer({ cronograma }: { cronograma: CronogramaLista }) {
  const router = useRouter();
  const [aberto, setAberto] = React.useState(false);
  const form = useForm<CronogramaInput, unknown, z.output<typeof cronogramaSchema>>({
    resolver: zodResolver(cronogramaSchema),
    defaultValues: iniciais(cronograma),
  });
  const salvando = form.formState.isSubmitting;
  const erros = form.formState.errors;
  const criterioPeso = useWatch({ control: form.control, name: "criterioPeso" });

  React.useEffect(() => {
    if (aberto) form.reset(iniciais(cronograma));
  }, [aberto, form, cronograma]);

  async function aoEnviar(valores: CronogramaInput) {
    form.clearErrors("root");
    const resultado = await salvarCronograma(cronograma.id, valores);
    if ("erro" in resultado) {
      form.setError("root", { message: resultado.erro });
      return;
    }
    toast.success("Cronograma atualizado");
    setAberto(false);
    semDerrubarSucesso("execucao.cronogramas.editar.refresh", () => router.refresh());
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setAberto(true)}>
        <Pencil />
        Editar dados
      </Button>
      <FormDrawer
        aberto={aberto}
        onAbertoChange={setAberto}
        titulo="Editar cronograma"
        descricao="Mudar o início recalcula todas as datas"
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
                "Salvar cronograma"
              )}
            </Button>
          </>
        }
      >
        <form id={ID_FORM} onSubmit={submeterComAviso(form, () => aoEnviar(form.getValues()))} className={classesFormulario} noValidate>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <CampoFormulario id="ed-cron-codigo" rotulo="Código" obrigatorio erro={erros.codigo?.message} ajuda="Vira maiúsculo ao salvar">
              <Input id="ed-cron-codigo" disabled={salvando} {...form.register("codigo")} />
            </CampoFormulario>
            <CampoFormulario id="ed-cron-criterio" rotulo="Critério de peso" obrigatorio erro={erros.criterioPeso?.message}>
              <Combobox
                id="ed-cron-criterio"
                valor={criterioPeso ?? ""}
                onValorChange={(v) => form.setValue("criterioPeso", v as CronogramaInput["criterioPeso"], { shouldDirty: true, shouldValidate: true })}
                opcoes={OPCOES_CRITERIO}
                disabled={salvando}
              />
            </CampoFormulario>
          </div>
          <CampoFormulario id="ed-cron-nome" rotulo="Nome" obrigatorio erro={erros.nome?.message}>
            <Input id="ed-cron-nome" disabled={salvando} {...form.register("nome")} />
          </CampoFormulario>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <CampoFormulario id="ed-cron-inicio" rotulo="Data de início" obrigatorio erro={erros.dataInicio ? "Informe a data de início" : undefined}>
              <Input id="ed-cron-inicio" type="date" disabled={salvando} {...form.register("dataInicio")} />
            </CampoFormulario>
            <CampoFormulario
              id="ed-cron-corte"
              rotulo="Data de corte"
              erro={erros.dataCorte ? "Data inválida" : undefined}
              ajuda="Até quando o andamento foi apontado"
            >
              <Input id="ed-cron-corte" type="date" disabled={salvando} {...form.register("dataCorte")} />
            </CampoFormulario>
          </div>
          <CampoFormulario id="ed-cron-obs" rotulo="Observações" erro={erros.observacoes?.message}>
            <Textarea id="ed-cron-obs" rows={3} disabled={salvando} {...form.register("observacoes")} />
          </CampoFormulario>
        </form>
      </FormDrawer>
    </>
  );
}
