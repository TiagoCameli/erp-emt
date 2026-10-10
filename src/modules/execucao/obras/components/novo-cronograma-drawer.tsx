"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Plus } from "lucide-react";

import { CampoFormulario, classesFormulario, Combobox, FormDrawer, submeterComAviso } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { criarCronograma } from "@/modules/execucao/obras/actions";
import { novoCronogramaSchema, type NovoCronogramaInput } from "@/modules/execucao/obras/schemas";
import { CRITERIOS_PESO, ROTULO_CRITERIO_PESO, ROTULO_TIPO_OBRA, TIPOS_OBRA } from "@/modules/execucao/_shared/rotulos";

const ID_FORM = "form-novo-cronograma";

export interface ObraOpcao { id: string; nome: string; temPasta: boolean; tenhoAcesso: boolean }
export interface CalendarioOpcao { id: string; nome: string; padrao: boolean }

const OPCOES_TIPO = TIPOS_OBRA.map((t) => ({ valor: t, rotulo: ROTULO_TIPO_OBRA[t] }));
const OPCOES_CRITERIO = CRITERIOS_PESO.map((c) => ({ valor: c, rotulo: ROTULO_CRITERIO_PESO[c] }));

export interface NovoCronogramaDrawerProps {
  obras: ObraOpcao[];
  calendarios: CalendarioOpcao[];
  /** Obra já escolhida (lista de cronogramas da obra). */
  obraIdInicial?: string;
}

/** Botão "Novo cronograma" + drawer. Usado nas pastas e na lista de cronogramas. */
export function NovoCronogramaDrawer({ obras, calendarios, obraIdInicial }: NovoCronogramaDrawerProps) {
  const router = useRouter();
  const [aberto, setAberto] = React.useState(false);

  const iniciais = React.useCallback(
    (): NovoCronogramaInput => ({
      obraId: obraIdInicial ?? "",
      tipoObra: undefined,
      codigo: "",
      nome: "",
      dataInicio: "",
      calendarioModeloId: calendarios.find((c) => c.padrao)?.id,
      criterioPeso: "duracao",
      observacoes: "",
    }),
    [calendarios, obraIdInicial],
  );

  const form = useForm<NovoCronogramaInput, unknown, z.output<typeof novoCronogramaSchema>>({ resolver: zodResolver(novoCronogramaSchema), defaultValues: iniciais() });
  const salvando = form.formState.isSubmitting;
  const erros = form.formState.errors;

  React.useEffect(() => {
    if (aberto) {
      form.reset(iniciais());
    }
  }, [aberto, form, iniciais]);

  const [obraId, tipoObra, calendarioModeloId, criterioPeso] = useWatch({
    control: form.control,
    name: ["obraId", "tipoObra", "calendarioModeloId", "criterioPeso"],
  });
  const obra = obras.find((o) => o.id === obraId);
  const pedeTipo = obra !== undefined && !obra.temPasta;

  const opcoesObra = obras.map((o) => ({
    valor: o.id,
    rotulo: o.temPasta && !o.tenhoAcesso ? `${o.nome} (sem acesso)` : o.nome,
  }));
  const opcoesCalendario = calendarios.map((c) => ({ valor: c.id, rotulo: c.nome }));

  async function aoEnviar(valores: NovoCronogramaInput) {
    form.clearErrors("root");
    if (obra && obra.temPasta && !obra.tenhoAcesso) {
      form.setError("root", { message: "Você não está na lista de acesso desta obra" });
      return;
    }
    if (pedeTipo && !valores.tipoObra) {
      form.setError("tipoObra", { message: "Informe o tipo da obra" });
      return;
    }
    const resultado = await criarCronograma({ ...valores, tipoObra: pedeTipo ? valores.tipoObra : undefined });
    if ("erro" in resultado) {
      form.setError("root", { message: resultado.erro });
      return;
    }
    toast.success("Cronograma criado");
    setAberto(false);
    router.push(`/execucao/cronogramas/${"id" in resultado ? resultado.id : ""}`);
  }

  return (
    <>
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Novo cronograma
      </Button>
      <FormDrawer
        aberto={aberto}
        onAbertoChange={setAberto}
        titulo="Novo cronograma"
        descricao="Se a obra ainda não tem pasta, ela é criada junto com este cronograma"
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
                "Criar cronograma"
              )}
            </Button>
          </>
        }
      >
        <form id={ID_FORM} onSubmit={submeterComAviso(form, () => aoEnviar(form.getValues()))} className={classesFormulario} noValidate>
          <CampoFormulario id="cron-obra" rotulo="Obra" obrigatorio erro={erros.obraId ? "Escolha a obra" : undefined}>
            <Combobox
              id="cron-obra"
              valor={obraId ?? ""}
              onValorChange={(v) => form.setValue("obraId", v, { shouldDirty: true, shouldValidate: true })}
              opcoes={opcoesObra}
              placeholder="Selecione a obra"
              buscaPlaceholder="Buscar obra"
              disabled={salvando}
            />
          </CampoFormulario>
          {pedeTipo ? (
            <CampoFormulario id="cron-tipo" rotulo="Tipo da obra" obrigatorio erro={erros.tipoObra?.message}>
              <Combobox
                id="cron-tipo"
                valor={tipoObra ?? ""}
                onValorChange={(v) =>
                  form.setValue("tipoObra", (v || undefined) as NovoCronogramaInput["tipoObra"], { shouldDirty: true, shouldValidate: true })
                }
                opcoes={OPCOES_TIPO}
                placeholder="Selecione o tipo"
                disabled={salvando}
              />
            </CampoFormulario>
          ) : null}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <CampoFormulario id="cron-codigo" rotulo="Código" obrigatorio erro={erros.codigo?.message} ajuda="Vira maiúsculo ao salvar">
              <Input id="cron-codigo" disabled={salvando} {...form.register("codigo")} />
            </CampoFormulario>
            <CampoFormulario id="cron-inicio" rotulo="Data de início" obrigatorio erro={erros.dataInicio ? "Informe a data de início" : undefined}>
              <Input id="cron-inicio" type="date" disabled={salvando} {...form.register("dataInicio")} />
            </CampoFormulario>
          </div>
          <CampoFormulario id="cron-nome" rotulo="Nome" obrigatorio erro={erros.nome?.message}>
            <Input id="cron-nome" disabled={salvando} {...form.register("nome")} />
          </CampoFormulario>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <CampoFormulario id="cron-calendario" rotulo="Calendário" erro={erros.calendarioModeloId?.message}>
              <Combobox
                id="cron-calendario"
                valor={calendarioModeloId ?? ""}
                onValorChange={(v) => form.setValue("calendarioModeloId", v || undefined, { shouldDirty: true, shouldValidate: true })}
                opcoes={opcoesCalendario}
                placeholder="Selecione o calendário"
                disabled={salvando}
              />
            </CampoFormulario>
            <CampoFormulario id="cron-criterio" rotulo="Critério de peso" obrigatorio erro={erros.criterioPeso?.message}>
              <Combobox
                id="cron-criterio"
                valor={criterioPeso ?? ""}
                onValorChange={(v) =>
                  form.setValue("criterioPeso", v as NovoCronogramaInput["criterioPeso"], { shouldDirty: true, shouldValidate: true })
                }
                opcoes={OPCOES_CRITERIO}
                disabled={salvando}
              />
            </CampoFormulario>
          </div>
          <CampoFormulario id="cron-obs" rotulo="Observações" erro={erros.observacoes?.message}>
            <Textarea id="cron-obs" rows={3} disabled={salvando} {...form.register("observacoes")} />
          </CampoFormulario>
        </form>
      </FormDrawer>
    </>
  );
}
