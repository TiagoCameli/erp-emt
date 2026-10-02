"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";

import { CampoFormulario, classesFormulario, Combobox, FormDrawer, InputMoeda, submeterComAviso } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { lancarReajusteManual } from "@/modules/medicao/reajuste/actions";
import { manualFormSchema, type ManualFormInput, type ManualInput } from "@/modules/medicao/reajuste/schemas";
import type { PdfPendente } from "@/modules/medicao/reajuste/tipos";

const ID_FORM = "form-reajuste-manual";
const VAZIO: ManualFormInput = { valor: "", sentido: "", situacao: "", observacao: "", arquivoId: "" };

const OPCOES_SENTIDO = [
  { valor: "positivo", rotulo: "Positivo (a receber)" },
  { valor: "negativo", rotulo: "Negativo (a devolver)" },
];
const OPCOES_SITUACAO = [
  { valor: "provisorio", rotulo: "Provisório" },
  { valor: "definitivo", rotulo: "Definitivo" },
];

export interface ReajusteManualDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  medicaoId: string;
  numero: number;
  /** PDFs anexados à medição que ainda não estão em relatório: um deles pode ir junto. */
  pendentes: PdfPendente[];
  onLancado?: () => void;
}

/**
 * Reajuste sem relatório SIAC (Obra 012 e qualquer contrato sem SIAC): valor digitado sem sinal mais
 * o sentido (o campo de dinheiro não aceita sinal), situação dos índices, observação e, se quiser, um
 * PDF pendente da medição. Sem rateio por item: conta só no total. O que foi digitado vai como está;
 * o `manualSchema` do servidor converte para o banco e a RPC confere de novo.
 */
export function ReajusteManualDrawer({ aberto, onAbertoChange, medicaoId, numero, pendentes, onLancado }: ReajusteManualDrawerProps) {
  const form = useForm<ManualFormInput>({ resolver: zodResolver(manualFormSchema), defaultValues: VAZIO });
  const salvando = form.formState.isSubmitting;
  const erros = form.formState.errors;
  const valor = useWatch({ control: form.control, name: "valor" }) ?? "";
  const sentido = useWatch({ control: form.control, name: "sentido" }) ?? "";
  const situacao = useWatch({ control: form.control, name: "situacao" }) ?? "";
  const arquivoId = useWatch({ control: form.control, name: "arquivoId" }) ?? "";

  React.useEffect(() => {
    if (aberto) form.reset(VAZIO);
  }, [aberto, form]);

  const opcoesPdf = pendentes.map((p) => ({ valor: p.arquivoId, rotulo: p.nome }));
  const escolher = (campo: "sentido" | "situacao" | "arquivoId") => (v: string) =>
    form.setValue(campo, v, { shouldDirty: true, shouldValidate: form.formState.isSubmitted });

  async function aoEnviar(valores: ManualFormInput) {
    const dados: ManualInput = {
      valor: valores.valor,
      sentido: valores.sentido as ManualInput["sentido"],
      situacao: valores.situacao as ManualInput["situacao"],
      observacao: valores.observacao.trim(),
      arquivoId: valores.arquivoId === "" ? null : valores.arquivoId,
    };
    const resultado = await lancarReajusteManual(medicaoId, dados);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(`Reajuste lançado na ${numero}ª medição`);
    onAbertoChange(false);
    onLancado?.();
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={`Reajuste sem relatório na ${numero}ª medição`}
      descricao="Total informado à mão, sem rateio por item: entra no total da medição e no Boletim, não nos itens"
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
              "Lançar reajuste"
            )}
          </Button>
        </>
      }
    >
      <form id={ID_FORM} onSubmit={submeterComAviso(form, aoEnviar)} className={classesFormulario} noValidate>
        <CampoFormulario id="reajuste-valor" rotulo="Valor" obrigatorio erro={erros.valor?.message} largura="medio">
          <InputMoeda
            id="reajuste-valor"
            valor={valor}
            onValorChange={(v) => form.setValue("valor", v, { shouldDirty: true })}
            disabled={salvando}
          />
        </CampoFormulario>
        <CampoFormulario id="reajuste-sentido" rotulo="Sentido" obrigatorio erro={erros.sentido?.message} largura="medio">
          <Combobox
            id="reajuste-sentido"
            ariaLabel="Sentido"
            valor={sentido}
            onValorChange={escolher("sentido")}
            opcoes={OPCOES_SENTIDO}
            placeholder="Positivo ou negativo"
            disabled={salvando}
          />
        </CampoFormulario>
        <CampoFormulario id="reajuste-situacao" rotulo="Situação dos índices" obrigatorio erro={erros.situacao?.message} largura="medio">
          <Combobox
            id="reajuste-situacao"
            ariaLabel="Situação dos índices"
            valor={situacao}
            onValorChange={escolher("situacao")}
            opcoes={OPCOES_SITUACAO}
            placeholder="Provisório ou definitivo"
            disabled={salvando}
          />
        </CampoFormulario>
        <CampoFormulario
          id="reajuste-anexo"
          rotulo="Anexo"
          ajuda={pendentes.length === 0 ? "Nenhum PDF pendente nesta medição. Anexe pelo Importar relatório SIAC" : "PDF anexado à medição que ainda não está em relatório"}
        >
          <Combobox
            id="reajuste-anexo"
            ariaLabel="Anexo"
            valor={arquivoId}
            onValorChange={escolher("arquivoId")}
            opcoes={opcoesPdf}
            placeholder="Sem anexo"
            vazioTexto="Nenhum PDF pendente"
            limpavel
            disabled={salvando || pendentes.length === 0}
          />
        </CampoFormulario>
        <CampoFormulario id="reajuste-observacao" rotulo="Observação" erro={erros.observacao?.message}>
          <Textarea id="reajuste-observacao" rows={3} placeholder="De onde veio o valor (ofício, planilha do contratante)" disabled={salvando} {...form.register("observacao")} />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
