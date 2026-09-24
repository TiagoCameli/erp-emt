"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
  InputPreco,
  submeterComAviso,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CASAS_VALOR_OPERACIONAL } from "@/lib/casas-decimais";
import { mesHojeISO } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import { agoraDataHoraLocal, isoParaDataHoraLocal } from "@/modules/combustivel/_shared/rotulos";
import { salvarAjuste } from "@/modules/frete/ajustes/actions";
import { previaDoAjuste, ROTULO_BOTAO_SINAL } from "@/modules/frete/ajustes/regras";
import {
  ajusteDoForm,
  ajusteFormSchema,
  SINAIS_AJUSTE,
  type AjusteFormInput,
} from "@/modules/frete/ajustes/schemas";
import { numeroParaCampo, textoParaNumero } from "@/modules/manutencao/servicos/numero";

const ID_FORM = "form-ajuste-saldo";

export interface OpcaoSimples {
  id: string;
  nome: string;
  ativo?: boolean;
}

/** Ajuste em edição (só o pendente se edita). */
export interface AjusteEmEdicao {
  id: string;
  transportadoraId: string;
  transportadoraNome: string;
  sinal: "credito" | "debito";
  valor: number;
  data: string;
  mesReferencia: string;
  centroCustoId: string | null;
  obraNome: string | null;
  descricao: string;
}

export interface AjusteFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  transportadoras: OpcaoSimples[];
  obras: OpcaoSimples[];
  /** Transportadora já escolhida (o "Novo ajuste" do extrato): o campo trava. */
  transportadoraFixa?: { id: string; nome: string };
  ajuste?: AjusteEmEdicao | null;
  onSalvo?: (id: string) => void;
}

/**
 * Ajuste manual de saldo, com os campos e a prévia da origem
 * (AjusteManualTransportadoraForm). Nasce pendente de aprovação: a prévia diz
 * que o valor só entra no saldo depois de aprovado.
 */
export function AjusteFormDrawer({
  aberto,
  onAbertoChange,
  transportadoras,
  obras,
  transportadoraFixa,
  ajuste,
  onSalvo,
}: AjusteFormDrawerProps) {
  const editando = Boolean(ajuste);

  const iniciais = React.useCallback(
    (): AjusteFormInput =>
      ajuste
        ? {
            transportadoraId: ajuste.transportadoraId,
            sinal: ajuste.sinal,
            valor: numeroParaCampo(ajuste.valor),
            data: isoParaDataHoraLocal(ajuste.data),
            mesReferencia: ajuste.mesReferencia.slice(0, 7),
            centroCustoId: ajuste.centroCustoId ?? "",
            descricao: ajuste.descricao,
          }
        : {
            transportadoraId: transportadoraFixa?.id ?? "",
            sinal: "credito",
            valor: "",
            data: agoraDataHoraLocal(),
            mesReferencia: mesHojeISO(),
            centroCustoId: "",
            descricao: "",
          },
    [ajuste, transportadoraFixa],
  );

  const form = useForm<AjusteFormInput>({ resolver: zodResolver(ajusteFormSchema), defaultValues: iniciais() });
  const salvando = form.formState.isSubmitting;
  const erros = form.formState.errors;

  React.useEffect(() => {
    if (aberto) form.reset(iniciais());
  }, [aberto, form, iniciais]);

  const [transportadoraId, sinal, valorTexto, centroCustoId] = useWatch({
    control: form.control,
    name: ["transportadoraId", "sinal", "valor", "centroCustoId"],
  });
  const valor = textoParaNumero(valorTexto ?? "", CASAS_VALOR_OPERACIONAL) ?? 0;

  const opcoesTransportadora = React.useMemo(
    () => transportadoras.filter((t) => t.ativo !== false || t.id === transportadoraId).map((t) => ({ valor: t.id, rotulo: t.nome })),
    [transportadoras, transportadoraId],
  );
  const opcoesObra = React.useMemo(() => obras.map((o) => ({ valor: o.id, rotulo: o.nome })), [obras]);

  const travada = transportadoraFixa ?? (ajuste ? { id: ajuste.transportadoraId, nome: ajuste.transportadoraNome } : null);
  const nomeTransportadora =
    transportadoras.find((t) => t.id === transportadoraId)?.nome ?? travada?.nome ?? "";

  async function aoEnviar(valores: AjusteFormInput) {
    const resultado = await salvarAjuste(ajuste?.id ?? null, ajusteDoForm(valores));
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(editando ? "Ajuste atualizado" : "Ajuste lançado. Ele entra no saldo depois de aprovado");
    onAbertoChange(false);
    onSalvo?.(resultado.id);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar ajuste de saldo" : "Novo ajuste de saldo"}
      descricao="Crédito soma ao saldo; débito subtrai. O ajuste nasce pendente e só entra no saldo depois de aprovado"
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
            ) : editando ? (
              "Salvar ajuste"
            ) : (
              "Lançar ajuste"
            )}
          </Button>
        </>
      }
    >
      <form id={ID_FORM} onSubmit={submeterComAviso(form, aoEnviar)} className={classesFormulario} noValidate>
        <CampoFormulario id="ajuste-transportadora" rotulo="Transportadora" obrigatorio erro={erros.transportadoraId?.message}>
          <Combobox
            id="ajuste-transportadora"
            valor={transportadoraId ?? ""}
            onValorChange={(v) => form.setValue("transportadoraId", v, { shouldDirty: true, shouldValidate: true })}
            opcoes={opcoesTransportadora}
            rotuloDoValor={travada?.nome}
            placeholder="Selecione a transportadora"
            buscaPlaceholder="Buscar transportadora"
            disabled={salvando || Boolean(transportadoraFixa)}
          />
        </CampoFormulario>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">
            Tipo de ajuste<span className="text-destructive" aria-hidden>*</span>
          </span>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de ajuste">
            {SINAIS_AJUSTE.map((s) => {
              const ativo = sinal === s;
              return (
                <Button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={ativo}
                  variant="outline"
                  disabled={salvando}
                  onClick={() => form.setValue("sinal", s, { shouldDirty: true, shouldValidate: true })}
                  className={cn(
                    "h-11",
                    ativo && s === "credito" && "border-status-aprovado bg-status-aprovado/10 text-status-aprovado",
                    ativo && s === "debito" && "border-status-rejeitado bg-status-rejeitado/10 text-status-rejeitado",
                  )}
                >
                  {ROTULO_BOTAO_SINAL[s]}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <CampoFormulario id="ajuste-valor" rotulo="Valor (R$)" obrigatorio erro={erros.valor?.message}>
            <InputPreco
              id="ajuste-valor"
              valor={valorTexto ?? ""}
              onValorChange={(v) => form.setValue("valor", v, { shouldDirty: true, shouldValidate: form.formState.isSubmitted })}
              disabled={salvando}
            />
          </CampoFormulario>
          <CampoFormulario id="ajuste-data" rotulo="Data" obrigatorio erro={erros.data?.message}>
            <Input id="ajuste-data" type="datetime-local" disabled={salvando} {...form.register("data")} />
          </CampoFormulario>
          <CampoFormulario
            id="ajuste-mes"
            rotulo="Mês de referência"
            erro={erros.mesReferencia?.message}
            ajuda="Vazio: o mês da data"
          >
            <Input id="ajuste-mes" type="month" disabled={salvando} {...form.register("mesReferencia")} />
          </CampoFormulario>
          <CampoFormulario id="ajuste-obra" rotulo="Obra (opcional)" erro={erros.centroCustoId?.message}>
            <Combobox
              id="ajuste-obra"
              valor={centroCustoId ?? ""}
              onValorChange={(v) => form.setValue("centroCustoId", v, { shouldDirty: true })}
              opcoes={opcoesObra}
              rotuloDoValor={ajuste?.obraNome ?? undefined}
              limpavel
              placeholder="Sem obra"
              buscaPlaceholder="Buscar obra"
              disabled={salvando}
            />
          </CampoFormulario>
        </div>

        <CampoFormulario id="ajuste-descricao" rotulo="Descrição" obrigatorio erro={erros.descricao?.message}>
          <Textarea
            id="ajuste-descricao"
            rows={3}
            placeholder="Motivo do ajuste (obrigatório para rastreio)"
            disabled={salvando}
            {...form.register("descricao")}
          />
        </CampoFormulario>

        {valor > 0 && sinal ? (
          <p
            role="note"
            className={cn(
              "rounded-md bg-surface px-3 py-2 text-detalhe",
              sinal === "credito" ? "text-status-aprovado" : "text-status-rejeitado",
            )}
          >
            {previaDoAjuste(sinal, valor, nomeTransportadora)}
          </p>
        ) : null}
      </form>
    </FormDrawer>
  );
}
