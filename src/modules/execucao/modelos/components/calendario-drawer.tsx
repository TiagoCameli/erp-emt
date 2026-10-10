"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";

import { CampoFormulario, classesFormulario, Combobox, FormDrawer, InputHoras, submeterComAviso } from "@/components/canonicos";
import { semDerrubarSucesso } from "@/components/canonicos/acao-sem-silencio";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { salvarCalendario } from "@/modules/execucao/modelos/actions";
import { ExcecoesCalendario } from "@/modules/execucao/modelos/components/excecoes-calendario";
import type { Calendario, Excecao } from "@/modules/execucao/modelos/queries";
import { calendarioSchema, type CalendarioInput } from "@/modules/execucao/modelos/schemas";

const ID_FORM = "form-calendario";

const DIAS = [
  { campo: "horasSeg", rotulo: "Seg" },
  { campo: "horasTer", rotulo: "Ter" },
  { campo: "horasQua", rotulo: "Qua" },
  { campo: "horasQui", rotulo: "Qui" },
  { campo: "horasSex", rotulo: "Sex" },
  { campo: "horasSab", rotulo: "Sáb" },
  { campo: "horasDom", rotulo: "Dom" },
] as const;

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const OPCOES_MES = [{ valor: "", rotulo: "Sem período chuvoso" }, ...MESES.map((m, i) => ({ valor: String(i + 1), rotulo: m }))];

const ABRANGENCIAS = [
  { valor: "nacional", rotulo: "Nacionais" },
  { valor: "AC", rotulo: "Acre" },
  { valor: "municipal", rotulo: "Municipais" },
] as const;

type Abrangencia = (typeof ABRANGENCIAS)[number]["valor"];

const texto = (h: string) => h.replace(".", ",");

function iniciais(c: Calendario | null | undefined): CalendarioInput {
  if (!c) {
    return {
      nome: "", horasSeg: "8", horasTer: "8", horasQua: "8", horasQui: "8", horasSex: "8", horasSab: "", horasDom: "",
      feriadosAbrangencia: ["nacional", "AC"], municipio: "", chuvosoInicioMes: undefined, chuvosoFimMes: undefined, padraoEmpresa: false, observacoes: "",
    };
  }
  const horas = (h: string) => (Number(h) === 0 ? "" : texto(h));
  return {
    nome: c.nome,
    horasSeg: horas(c.horasSeg), horasTer: horas(c.horasTer), horasQua: horas(c.horasQua), horasQui: horas(c.horasQui),
    horasSex: horas(c.horasSex), horasSab: horas(c.horasSab), horasDom: horas(c.horasDom),
    feriadosAbrangencia: c.feriadosAbrangencia,
    municipio: c.municipio ?? "",
    chuvosoInicioMes: c.chuvosoInicioMes ?? undefined,
    chuvosoFimMes: c.chuvosoFimMes ?? undefined,
    padraoEmpresa: c.padraoEmpresa,
    observacoes: c.observacoes ?? "",
  };
}

export interface CalendarioDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Calendário em edição; null: novo modelo. Serve também ao calendário próprio de um cronograma (`modelo: false`). */
  calendario: Calendario | null;
  /** Exceções do calendário (com as herdadas do pai, em leitura). Só aparecem com o calendário já salvo. */
  excecoes: Excecao[];
  onSalvo?: () => void;
}

export function CalendarioDrawer({ aberto, onAbertoChange, calendario, excecoes, onSalvo }: CalendarioDrawerProps) {
  const router = useRouter();
  const editando = calendario !== null;
  const ehModelo = calendario === null || calendario.modelo;
  const form = useForm<CalendarioInput, unknown, z.output<typeof calendarioSchema>>({
    resolver: zodResolver(calendarioSchema),
    defaultValues: iniciais(calendario),
  });
  const salvando = form.formState.isSubmitting;
  const erros = form.formState.errors;

  React.useEffect(() => {
    if (aberto) form.reset(iniciais(calendario));
  }, [aberto, form, calendario]);

  const watch = useWatch({ control: form.control });
  const abrangencia = (watch.feriadosAbrangencia ?? []) as Abrangencia[];

  function alternarAbrangencia(valor: Abrangencia, marcado: boolean) {
    const novo = marcado ? [...abrangencia.filter((a) => a !== valor), valor] : abrangencia.filter((a) => a !== valor);
    form.setValue("feriadosAbrangencia", novo, { shouldDirty: true, shouldValidate: true });
  }

  async function aoEnviar(valores: CalendarioInput) {
    form.clearErrors("root");
    // O banco trata chave ausente como padrão (horas 0, nacional + AC): na edição manda sempre o formulário inteiro.
    const dados: CalendarioInput = {
      ...valores,
      padraoEmpresa: ehModelo ? Boolean(valores.padraoEmpresa) : (calendario?.padraoEmpresa ?? false),
    };
    const resultado = await salvarCalendario(calendario?.id ?? null, dados);
    if ("erro" in resultado) {
      form.setError("root", { message: resultado.erro });
      return;
    }
    toast.success(editando ? "Calendário atualizado" : "Calendário cadastrado");
    onAbertoChange(false);
    onSalvo?.();
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar calendário" : "Novo calendário"}
      descricao="Horas por dia da semana, feriados que valem e período chuvoso"
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
              "Salvar calendário"
            )}
          </Button>
        </>
      }
    >
      <form id={ID_FORM} onSubmit={submeterComAviso(form, () => aoEnviar(form.getValues()))} className={classesFormulario} noValidate>
        <CampoFormulario id="calendario-nome" rotulo="Nome" obrigatorio erro={erros.nome?.message}>
          <Input id="calendario-nome" disabled={salvando} {...form.register("nome")} />
        </CampoFormulario>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-rotulo font-medium">Horas por dia</legend>
          <div className="grid grid-cols-7 gap-2">
            {DIAS.map((d) => (
              <div key={d.campo} className="flex flex-col gap-1">
                <label htmlFor={`calendario-${d.campo}`} className="text-center text-detalhe text-muted-foreground">
                  {d.rotulo}
                </label>
                <InputHoras
                  id={`calendario-${d.campo}`}
                  valor={watch[d.campo] ?? ""}
                  onValorChange={(v) => form.setValue(d.campo, v, { shouldDirty: true, shouldValidate: true })}
                  disabled={salvando}
                  className="px-2"
                />
              </div>
            ))}
          </div>
          {erros.horasSeg?.message ? (
            <p role="alert" className="text-detalhe text-destructive">
              {erros.horasSeg.message}
            </p>
          ) : (
            DIAS.map((d) => erros[d.campo]?.message).find(Boolean) && (
              <p role="alert" className="text-detalhe text-destructive">
                {DIAS.map((d) => erros[d.campo]?.message).find(Boolean)}
              </p>
            )
          )}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-rotulo font-medium">Feriados que valem</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {ABRANGENCIAS.map((a) => (
              <label key={a.valor} className="flex items-center gap-2 text-corpo">
                <Checkbox checked={abrangencia.includes(a.valor)} onCheckedChange={(c) => alternarAbrangencia(a.valor, c === true)} disabled={salvando} />
                {a.rotulo}
              </label>
            ))}
          </div>
        </fieldset>
        {abrangencia.includes("municipal") ? (
          <CampoFormulario id="calendario-municipio" rotulo="Município" obrigatorio erro={erros.municipio?.message}>
            <Input id="calendario-municipio" disabled={salvando} {...form.register("municipio")} />
          </CampoFormulario>
        ) : null}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <CampoFormulario id="calendario-chuvoso-ini" rotulo="Período chuvoso: início" erro={erros.chuvosoInicioMes?.message}>
            <Combobox
              id="calendario-chuvoso-ini"
              valor={watch.chuvosoInicioMes ? String(watch.chuvosoInicioMes) : ""}
              onValorChange={(v) => form.setValue("chuvosoInicioMes", v ? Number(v) : undefined, { shouldDirty: true, shouldValidate: true })}
              opcoes={OPCOES_MES}
              disabled={salvando}
            />
          </CampoFormulario>
          <CampoFormulario id="calendario-chuvoso-fim" rotulo="Período chuvoso: fim" erro={erros.chuvosoFimMes?.message}>
            <Combobox
              id="calendario-chuvoso-fim"
              valor={watch.chuvosoFimMes ? String(watch.chuvosoFimMes) : ""}
              onValorChange={(v) => form.setValue("chuvosoFimMes", v ? Number(v) : undefined, { shouldDirty: true, shouldValidate: true })}
              opcoes={OPCOES_MES}
              disabled={salvando}
            />
          </CampoFormulario>
        </div>

        {ehModelo ? (
          <label className="flex items-center gap-2 text-corpo">
            <Checkbox
              checked={Boolean(watch.padraoEmpresa)}
              onCheckedChange={(c) => form.setValue("padraoEmpresa", c === true, { shouldDirty: true })}
              disabled={salvando}
            />
            Padrão da empresa
          </label>
        ) : null}

        <CampoFormulario id="calendario-obs" rotulo="Observações" erro={erros.observacoes?.message}>
          <Textarea id="calendario-obs" rows={3} disabled={salvando} {...form.register("observacoes")} />
        </CampoFormulario>
      </form>

      {calendario ? (
        <div className="mt-6 border-t pt-5">
          <ExcecoesCalendario
            calendarioId={calendario.id}
            excecoes={excecoes}
            podeEditar
            onAlterado={() => semDerrubarSucesso("execucao.modelos.excecao.refresh", () => router.refresh())}
          />
        </div>
      ) : null}
    </FormDrawer>
  );
}
