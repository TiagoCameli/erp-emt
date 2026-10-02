"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Pencil } from "lucide-react";
import type { z } from "zod";

import { CampoFormulario, CelulaVazia, classesFormulario, FormDrawer, SecaoDetalhe, submeterComAviso } from "@/components/canonicos";
import { semDerrubarSucesso } from "@/components/canonicos/acao-sem-silencio";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { salvarConfigReajuste } from "@/modules/medicao/reajuste/actions";
import { aniversario, mesAno } from "@/modules/medicao/reajuste/formato";
import { configSchema, type ConfigReajusteInput } from "@/modules/medicao/reajuste/schemas";
import type { ConfigReajuste as DadosConfig } from "@/modules/medicao/reajuste/tipos";

const ID_FORM = "form-config-reajuste";

type ConfigSaida = z.output<typeof configSchema>;

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-legenda text-muted-foreground">{rotulo}</span>
      <span className="text-detalhe">{children}</span>
    </div>
  );
}

/** O que está gravado vira o formulário: data-base "aaaa-mm-01" vira "aaaa-mm" do input de mês. */
function valoresIniciais(config: DadosConfig): ConfigReajusteInput {
  return {
    temReajuste: config.temReajuste,
    dataBase: config.dataBase ? config.dataBase.slice(0, 7) : "",
    periodicidadeMeses: config.periodicidadeMeses,
    indiceDescricao: config.indiceDescricao ?? "",
  };
}

export interface ConfigReajusteProps {
  contratoId: string;
  config: DadosConfig;
  /** `medicao.reajuste/editar`, lido no servidor (e o contrato fora da lixeira). */
  podeEditar: boolean;
}

/**
 * Seção Reajuste do contrato (Fase 6): se tem reajuste, a data-base (mês), a periodicidade, o mês
 * do aniversário (data-base + periodicidade, que dispara o alerta de medição aprovada sem reajuste)
 * e o índice em texto. A página só monta esta seção para quem tem `medicao.reajuste/ver`; o Editar
 * aparece com `editar` e grava por `salvarConfigReajuste`, que a RPC confere de novo.
 */
export function ConfigReajuste({ contratoId, config, podeEditar }: ConfigReajusteProps) {
  const router = useRouter();
  const [editando, setEditando] = React.useState(false);
  const mesAniversario = config.temReajuste ? aniversario(config.dataBase, config.periodicidadeMeses) : "";

  return (
    <>
      <SecaoDetalhe
        titulo="Reajuste"
        card
        acao={
          podeEditar ? (
            <Button type="button" size="sm" variant="outline" onClick={() => setEditando(true)}>
              <Pencil />
              Editar
            </Button>
          ) : undefined
        }
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <Dado rotulo="Tem reajuste">{config.temReajuste ? "Sim" : "Não"}</Dado>
          <Dado rotulo="Data-base">{config.dataBase ? <span className="tabular-nums">{mesAno(config.dataBase)}</span> : <CelulaVazia />}</Dado>
          <Dado rotulo="Periodicidade">
            <span className="tabular-nums">{config.periodicidadeMeses}</span> meses
          </Dado>
          <Dado rotulo="Aniversário">{mesAniversario ? <span className="tabular-nums">{mesAniversario}</span> : <CelulaVazia />}</Dado>
          <Dado rotulo="Índice">{config.indiceDescricao ?? <CelulaVazia />}</Dado>
        </div>
      </SecaoDetalhe>

      {podeEditar ? (
        <ConfigReajusteDrawer
          aberto={editando}
          onAbertoChange={setEditando}
          contratoId={contratoId}
          config={config}
          onSalvo={() => semDerrubarSucesso("medicao.reajuste.config", () => router.refresh())}
        />
      ) : null}
    </>
  );
}

interface ConfigReajusteDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  contratoId: string;
  config: DadosConfig;
  onSalvo: () => void;
}

function ConfigReajusteDrawer({ aberto, onAbertoChange, contratoId, config, onSalvo }: ConfigReajusteDrawerProps) {
  const form = useForm<ConfigReajusteInput, unknown, ConfigSaida>({
    resolver: zodResolver(configSchema),
    defaultValues: valoresIniciais(config),
  });
  const salvando = form.formState.isSubmitting;
  const erros = form.formState.errors;
  const temReajuste = useWatch({ control: form.control, name: "temReajuste" });

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais(config));
  }, [aberto, config, form]);

  async function aoEnviar(valores: ConfigSaida) {
    const resultado = await salvarConfigReajuste(contratoId, {
      temReajuste: valores.temReajuste,
      dataBase: valores.dataBase,
      periodicidadeMeses: valores.periodicidadeMeses,
      indiceDescricao: valores.indiceDescricao,
    });
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Reajuste do contrato salvo");
    onAbertoChange(false);
    onSalvo();
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Reajuste do contrato"
      descricao="Data-base e periodicidade: depois do aniversário, medição aprovada sem relatório de reajuste vira alerta"
      temAlteracoesNaoSalvas={form.formState.isDirty && !salvando}
      rodape={
        <>
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
              "Salvar reajuste"
            )}
          </Button>
        </>
      }
    >
      <form id={ID_FORM} onSubmit={submeterComAviso(form, aoEnviar)} className={classesFormulario} noValidate>
        <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-surface px-3 py-2">
          <Label htmlFor="reajuste-tem">Tem reajuste</Label>
          <Switch
            id="reajuste-tem"
            checked={temReajuste}
            onCheckedChange={(v) => form.setValue("temReajuste", v, { shouldDirty: true, shouldValidate: form.formState.isSubmitted })}
            disabled={salvando}
          />
        </div>
        <CampoFormulario
          id="reajuste-data-base"
          rotulo="Data-base"
          obrigatorio={temReajuste}
          erro={erros.dataBase?.message}
          ajuda="Mês e ano do orçamento de referência"
          largura="medio"
        >
          <Input id="reajuste-data-base" type="month" disabled={salvando} {...form.register("dataBase")} />
        </CampoFormulario>
        <CampoFormulario
          id="reajuste-periodicidade"
          rotulo="Periodicidade (meses)"
          obrigatorio
          erro={erros.periodicidadeMeses?.message}
          ajuda="De 1 a 120 meses; o padrão é 12"
          largura="medio"
        >
          <Input
            id="reajuste-periodicidade"
            type="number"
            inputMode="numeric"
            min={1}
            max={120}
            step={1}
            disabled={salvando}
            {...form.register("periodicidadeMeses", { valueAsNumber: true })}
          />
        </CampoFormulario>
        <CampoFormulario id="reajuste-indice" rotulo="Índice" erro={erros.indiceDescricao?.message}>
          <Input id="reajuste-indice" placeholder="Ex.: índices FGV/DNIT do setor rodoviário" disabled={salvando} {...form.register("indiceDescricao")} />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
