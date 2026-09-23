"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, TriangleAlert } from "lucide-react";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
  submeterComAviso,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatarLitros } from "@/modules/combustivel/_shared/rotulos";
import { registrarEsvaziamento } from "@/modules/combustivel/esvaziamentos/actions";
import {
  esvaziamentoDoForm,
  esvaziamentoFormSchema,
  litrosDescartados,
  type EsvaziamentoFormInput,
} from "@/modules/combustivel/esvaziamentos/schemas";

const ID_FORM = "form-esvaziamento";

/** Tanque da EMT com combustível (tanque de terceiro e tanque vazio não se esvaziam). */
export interface TanqueEsvaziavel {
  id: string;
  nome: string;
  nivel: number;
  combustivelNome: string | null;
}

export interface EsvaziamentoFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  tanques: TanqueEsvaziavel[];
  /** Tanque já escolhido (o "Esvaziar" da lista de tanques). */
  tanqueInicialId?: string;
}

/**
 * Esvazia um tanque, como o EsvaziarTanqueModal do Gestão Obras: descarta o
 * nível inteiro do tanque, agora, e libera o tanque para receber outro
 * combustível. A pessoa escolhe o tanque e diz o motivo (pelo menos 3
 * caracteres); os litros aparecem só para conferir. Não há edição: errou,
 * exclui com motivo e registra de novo.
 */
export function EsvaziamentoFormDrawer({ aberto, onAbertoChange, tanques, tanqueInicialId }: EsvaziamentoFormDrawerProps) {
  const iniciais = React.useCallback(
    (): EsvaziamentoFormInput => ({ tanqueId: tanqueInicialId ?? "", motivo: "" }),
    [tanqueInicialId],
  );

  const form = useForm<EsvaziamentoFormInput>({
    resolver: zodResolver(esvaziamentoFormSchema),
    defaultValues: iniciais(),
  });

  const salvando = form.formState.isSubmitting;
  const erros = form.formState.errors;

  React.useEffect(() => {
    if (aberto) form.reset(iniciais());
  }, [aberto, form, iniciais]);

  const tanqueId = useWatch({ control: form.control, name: "tanqueId" });
  const tanque = tanques.find((t) => t.id === tanqueId) ?? null;
  const litros = litrosDescartados(tanque);

  const opcoes = React.useMemo(
    () =>
      tanques.map((t) => ({
        valor: t.id,
        rotulo: `${t.nome} (${formatarLitros(t.nivel)}${t.combustivelNome ? ` de ${t.combustivelNome}` : ""})`,
      })),
    [tanques],
  );

  async function aoEnviar(valores: EsvaziamentoFormInput) {
    const resultado = await registrarEsvaziamento(esvaziamentoDoForm(valores));
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Tanque esvaziado");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Esvaziar tanque"
      descricao="Descarte explícito do combustível do tanque, para trocar de combustível"
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
                Esvaziando...
              </>
            ) : (
              "Esvaziar tanque"
            )}
          </Button>
        </>
      }
    >
      <form id={ID_FORM} onSubmit={submeterComAviso(form, aoEnviar)} className={classesFormulario} noValidate>
        <CampoFormulario id="esvaziamento-tanque" rotulo="Tanque" obrigatorio erro={erros.tanqueId?.message}>
          <Combobox
            id="esvaziamento-tanque"
            valor={tanqueId ?? ""}
            onValorChange={(valor) => form.setValue("tanqueId", valor, { shouldDirty: true, shouldValidate: true })}
            opcoes={opcoes}
            placeholder={tanques.length === 0 ? "Nenhum tanque com combustível" : "Selecione o tanque"}
            buscaPlaceholder="Buscar tanque"
            disabled={salvando}
          />
        </CampoFormulario>

        {tanque ? (
          <div
            role="note"
            className="flex items-start gap-2 rounded-md border border-status-pendente/30 bg-status-pendente/10 px-3 py-2 text-detalhe text-status-pendente"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              Registra o descarte de <strong>{formatarLitros(litros)}</strong>
              {tanque.combustivelNome ? (
                <>
                  {" "}
                  de <strong>{tanque.combustivelNome}</strong>
                </>
              ) : null}{" "}
              do tanque <strong>{tanque.nome}</strong>, com a data de agora, e libera o tanque para receber outro
              combustível.
            </p>
          </div>
        ) : null}

        <CampoFormulario
          id="esvaziamento-litros"
          rotulo="Litros descartados"
          largura="medio"
          ajuda="O nível atual do tanque inteiro"
        >
          <Input
            id="esvaziamento-litros"
            readOnly
            tabIndex={-1}
            value={tanque ? formatarLitros(litros) : ""}
            placeholder="Escolha o tanque"
            className="text-right tabular-nums"
          />
        </CampoFormulario>

        <CampoFormulario id="esvaziamento-motivo" rotulo="Motivo" obrigatorio erro={erros.motivo?.message}>
          <Textarea
            id="esvaziamento-motivo"
            rows={3}
            placeholder="Troca para Diesel S500 conforme demanda da obra Lote 09"
            disabled={salvando}
            {...form.register("motivo")}
          />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
