"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";

import { CampoFormulario, classesFormulario, Combobox, FormDrawer, InputQuantidade, submeterComAviso } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { lancarAjuste } from "@/modules/medicao/medicoes/ciclo-actions";
import { ajusteFormSchema, type AjusteFormInput } from "@/modules/medicao/medicoes/ciclo-schemas";
import type { ServicoAjuste } from "@/modules/medicao/medicoes/tipos";

const ID_FORM = "form-ajuste-medicao";
const VAZIO: AjusteFormInput = { itemId: "", quantidade: "", motivo: "" };

export interface AjusteDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  medicaoId: string;
  /** "REV00": a revisão em aberto que recebe o ajuste. */
  revisaoRotulo: string;
  /** Serviços da versão da planilha da medição. */
  servicos: ServicoAjuste[];
  onLancado?: () => void;
}

/**
 * Ajuste de quantidade na revisão em aberto (em conferência, ou revisão pós-aprovação): serviço,
 * quantidade (negativa tira, positiva acrescenta) e motivo. A quantidade vai como foi digitada; o
 * schema do servidor converte para texto com ponto e a RPC confere de novo (diferente de zero, até 4
 * casas, motivo). A recusa do banco aparece no toast sem perder o que foi digitado.
 */
export function AjusteDrawer({ aberto, onAbertoChange, medicaoId, revisaoRotulo, servicos, onLancado }: AjusteDrawerProps) {
  const form = useForm<AjusteFormInput>({ resolver: zodResolver(ajusteFormSchema), defaultValues: VAZIO });
  const salvando = form.formState.isSubmitting;
  const erros = form.formState.errors;
  const itemAtual = useWatch({ control: form.control, name: "itemId" }) ?? "";
  const quantidadeAtual = useWatch({ control: form.control, name: "quantidade" }) ?? "";

  React.useEffect(() => {
    if (aberto) form.reset(VAZIO);
  }, [aberto, form]);

  const opcoes = servicos.map((s) => ({ valor: s.itemId, rotulo: `${s.codigo} · ${s.descricao}${s.unidade ? ` (${s.unidade})` : ""}` }));

  async function aoEnviar(valores: AjusteFormInput) {
    const resultado = await lancarAjuste({ medicaoId, ...valores });
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(`Ajuste lançado na ${revisaoRotulo}`);
    onAbertoChange(false);
    onLancado?.();
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={`Ajuste na ${revisaoRotulo}`}
      descricao="Quantidade positiva acrescenta, negativa tira. Entra na medida do item desta revisão"
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
                Lançando...
              </>
            ) : (
              "Lançar ajuste"
            )}
          </Button>
        </>
      }
    >
      <form id={ID_FORM} onSubmit={submeterComAviso(form, aoEnviar)} className={classesFormulario} noValidate>
        <CampoFormulario id="ajuste-servico" rotulo="Serviço" obrigatorio erro={erros.itemId?.message}>
          <Combobox
            id="ajuste-servico"
            valor={itemAtual}
            onValorChange={(v) => form.setValue("itemId", v, { shouldDirty: true, shouldValidate: true })}
            opcoes={opcoes}
            placeholder="Buscar por código ou descrição"
            vazioTexto="Nenhum serviço na planilha desta medição"
            disabled={salvando}
          />
        </CampoFormulario>
        <CampoFormulario id="ajuste-quantidade" rotulo="Quantidade" obrigatorio erro={erros.quantidade?.message}>
          <InputQuantidade
            id="ajuste-quantidade"
            valor={quantidadeAtual}
            onValorChange={(v) => form.setValue("quantidade", v, { shouldDirty: true })}
            placeholder="-2,5 ou 3"
            disabled={salvando}
          />
        </CampoFormulario>
        <CampoFormulario id="ajuste-motivo" rotulo="Motivo" obrigatorio erro={erros.motivo?.message}>
          <Textarea id="ajuste-motivo" rows={3} placeholder="Por que a quantidade muda" disabled={salvando} {...form.register("motivo")} />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
