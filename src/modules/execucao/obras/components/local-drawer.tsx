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
import { salvarLocal } from "@/modules/execucao/obras/actions";
import type { Local } from "@/modules/execucao/obras/queries";
import { localSchema, type LocalInput } from "@/modules/execucao/obras/schemas";
import { LADOS, ROTULO_LADO, ROTULO_TIPO_LOCAL, TIPOS_LOCAL, type TipoObra } from "@/modules/execucao/_shared/rotulos";

const ID_FORM = "form-local";
const OPCOES_TIPO = TIPOS_LOCAL.map((t) => ({ valor: t, rotulo: ROTULO_TIPO_LOCAL[t] }));
const OPCOES_LADO = [{ valor: "", rotulo: "Sem lado" }, ...LADOS.map((l) => ({ valor: l, rotulo: ROTULO_LADO[l] }))];

/** Ids do local e de todos os descendentes dele: não podem ser o pai dele. */
export function idsComDescendentes(locais: Local[], id: string): Set<string> {
  const fora = new Set<string>([id]);
  let achou = true;
  while (achou) {
    achou = false;
    for (const l of locais) {
      if (l.paiId && fora.has(l.paiId) && !fora.has(l.id)) {
        fora.add(l.id);
        achou = true;
      }
    }
  }
  return fora;
}

export interface LocalDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  obraId: string;
  tipoObra: TipoObra;
  locais: Local[];
  /** Local em edição; ausente: novo. */
  local?: Local | null;
  onSalvo?: () => void;
}

function iniciais(local: Local | null | undefined, proximaOrdem: number): LocalInput {
  if (!local) return { paiId: undefined, tipo: "bloco", codigo: "", nome: "", ordem: proximaOrdem, kmInicial: "", kmFinal: "", lado: undefined, faixa: "" };
  return {
    paiId: local.paiId ?? undefined,
    tipo: local.tipo,
    codigo: local.codigo,
    nome: local.nome,
    ordem: local.ordem,
    kmInicial: local.kmInicial === null ? "" : local.kmInicial.replace(".", ","),
    kmFinal: local.kmFinal === null ? "" : local.kmFinal.replace(".", ","),
    lado: (local.lado ?? undefined) as LocalInput["lado"],
    faixa: local.faixa ?? "",
  };
}

export function LocalDrawer({ aberto, onAbertoChange, obraId, tipoObra, locais, local, onSalvo }: LocalDrawerProps) {
  const editando = Boolean(local);
  const rodovia = tipoObra === "rodovia";
  const proximaOrdem = locais.reduce((m, l) => Math.max(m, l.ordem + 1), 0);
  const form = useForm<LocalInput, unknown, z.output<typeof localSchema>>({ resolver: zodResolver(localSchema), defaultValues: iniciais(local, proximaOrdem) });
  const salvando = form.formState.isSubmitting;
  const erros = form.formState.errors;

  React.useEffect(() => {
    if (aberto) {
      form.reset(iniciais(local, proximaOrdem));
    }
  }, [aberto, form, local, proximaOrdem]);

  const [tipo, paiId, lado] = useWatch({ control: form.control, name: ["tipo", "paiId", "lado"] });

  const excluidos = local ? idsComDescendentes(locais, local.id) : new Set<string>();
  const opcoesPai = [
    { valor: "", rotulo: "Sem pai (raiz)" },
    ...locais.filter((l) => !excluidos.has(l.id)).map((l) => ({ valor: l.id, rotulo: `${l.codigo} - ${l.nome}` })),
  ];

  async function aoEnviar(valores: LocalInput) {
    form.clearErrors("root");
    const dados: LocalInput = rodovia ? valores : { ...valores, kmInicial: "", kmFinal: "", lado: undefined, faixa: "" };
    const resultado = await salvarLocal(obraId, local?.id ?? null, dados);
    if ("erro" in resultado) {
      form.setError("root", { message: resultado.erro });
      return;
    }
    toast.success(editando ? "Local atualizado" : "Local cadastrado");
    onAbertoChange(false);
    onSalvo?.();
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar local" : "Novo local"}
      descricao="Blocos, pavimentos, ambientes ou trechos onde as atividades acontecem"
      temAlteracoesNaoSalvas={form.formState.isDirty && !salvando}
      rodape={
        <>
          {erros.root?.message ? (
            <p role="alert" className="mr-auto text-detalhe text-destructive">
              {erros.root?.message}
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
              "Salvar local"
            )}
          </Button>
        </>
      }
    >
      <form id={ID_FORM} onSubmit={submeterComAviso(form, () => aoEnviar(form.getValues()))} className={classesFormulario} noValidate>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <CampoFormulario id="local-codigo" rotulo="Código" obrigatorio erro={erros.codigo?.message}>
            <Input id="local-codigo" disabled={salvando} {...form.register("codigo")} />
          </CampoFormulario>
          <CampoFormulario id="local-tipo" rotulo="Tipo" obrigatorio erro={erros.tipo?.message}>
            <Combobox
              id="local-tipo"
              valor={tipo ?? ""}
              onValorChange={(v) => form.setValue("tipo", v as LocalInput["tipo"], { shouldDirty: true, shouldValidate: true })}
              opcoes={OPCOES_TIPO}
              disabled={salvando}
            />
          </CampoFormulario>
        </div>
        <CampoFormulario id="local-nome" rotulo="Nome" obrigatorio erro={erros.nome?.message}>
          <Input id="local-nome" disabled={salvando} {...form.register("nome")} />
        </CampoFormulario>
        <CampoFormulario id="local-pai" rotulo="Local pai" erro={erros.paiId?.message}>
          <Combobox
            id="local-pai"
            valor={paiId ?? ""}
            onValorChange={(v) => form.setValue("paiId", v || undefined, { shouldDirty: true, shouldValidate: true })}
            opcoes={opcoesPai}
            buscaPlaceholder="Buscar local"
            disabled={salvando}
          />
        </CampoFormulario>
        <CampoFormulario id="local-ordem" rotulo="Ordem" obrigatorio erro={erros.ordem?.message}>
          <Input
            id="local-ordem"
            type="number"
            inputMode="numeric"
            step={1}
            className="text-right tabular-nums"
            disabled={salvando}
            {...form.register("ordem", { valueAsNumber: true })}
          />
        </CampoFormulario>
        {rodovia ? (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <CampoFormulario id="local-km-ini" rotulo="Km inicial" erro={erros.kmInicial?.message}>
                <Input id="local-km-ini" inputMode="decimal" className="text-right tabular-nums" disabled={salvando} {...form.register("kmInicial")} />
              </CampoFormulario>
              <CampoFormulario id="local-km-fim" rotulo="Km final" erro={erros.kmFinal?.message}>
                <Input id="local-km-fim" inputMode="decimal" className="text-right tabular-nums" disabled={salvando} {...form.register("kmFinal")} />
              </CampoFormulario>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <CampoFormulario id="local-lado" rotulo="Lado" erro={erros.lado?.message}>
                <Combobox
                  id="local-lado"
                  valor={lado ?? ""}
                  onValorChange={(v) => form.setValue("lado", (v || undefined) as LocalInput["lado"], { shouldDirty: true, shouldValidate: true })}
                  opcoes={OPCOES_LADO}
                  disabled={salvando}
                />
              </CampoFormulario>
              <CampoFormulario id="local-faixa" rotulo="Faixa" erro={erros.faixa?.message}>
                <Input id="local-faixa" disabled={salvando} {...form.register("faixa")} />
              </CampoFormulario>
            </div>
          </>
        ) : null}
      </form>
    </FormDrawer>
  );
}
