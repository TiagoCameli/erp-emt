"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";

import { CampoFormulario, classesFormulario, Combobox, FormDrawer, InputQuantidade, submeterComAviso } from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { salvarServico } from "@/modules/execucao/modelos/actions";
import type { Servico } from "@/modules/execucao/modelos/queries";
import { servicoSchema, type ServicoInput } from "@/modules/execucao/modelos/schemas";

const ID_FORM = "form-servico";

export interface ServicoDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  unidades: { id: string; sigla: string; nome: string }[];
  /** Serviço em edição; ausente: novo. */
  servico?: Servico | null;
  onSalvo?: () => void;
}

function iniciais(s: Servico | null | undefined): ServicoInput {
  if (!s) return { codigo: "", nome: "", unidadeId: undefined, produtividadePadrao: "", ceuAberto: false, ativo: true, observacoes: "" };
  return {
    codigo: s.codigo,
    nome: s.nome,
    unidadeId: s.unidadeId ?? undefined,
    produtividadePadrao: s.produtividadePadrao === null ? "" : s.produtividadePadrao.replace(".", ","),
    ceuAberto: s.ceuAberto,
    ativo: s.ativo,
    observacoes: s.observacoes ?? "",
  };
}

export function ServicoDrawer({ aberto, onAbertoChange, unidades, servico, onSalvo }: ServicoDrawerProps) {
  const editando = Boolean(servico);
  const form = useForm<ServicoInput, unknown, z.output<typeof servicoSchema>>({ resolver: zodResolver(servicoSchema), defaultValues: iniciais(servico) });
  const salvando = form.formState.isSubmitting;
  const erros = form.formState.errors;

  React.useEffect(() => {
    if (aberto) form.reset(iniciais(servico));
  }, [aberto, form, servico]);

  const [unidadeId, produtividade, ceuAberto, ativo] = useWatch({ control: form.control, name: ["unidadeId", "produtividadePadrao", "ceuAberto", "ativo"] });
  const opcoesUnidade = [{ valor: "", rotulo: "Sem unidade" }, ...unidades.map((u) => ({ valor: u.id, rotulo: `${u.sigla} - ${u.nome}` }))];

  async function aoEnviar(valores: ServicoInput) {
    form.clearErrors("root");
    const resultado = await salvarServico(servico?.id ?? null, valores);
    if ("erro" in resultado) {
      form.setError("root", { message: resultado.erro });
      return;
    }
    toast.success(editando ? "Serviço atualizado" : "Serviço cadastrado");
    onAbertoChange(false);
    onSalvo?.();
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar serviço" : "Novo serviço"}
      descricao="Serviço da biblioteca, usado nas atividades dos cronogramas"
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
              "Salvar serviço"
            )}
          </Button>
        </>
      }
    >
      <form id={ID_FORM} onSubmit={submeterComAviso(form, () => aoEnviar(form.getValues()))} className={classesFormulario} noValidate>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <CampoFormulario id="servico-codigo" rotulo="Código" obrigatorio erro={erros.codigo?.message}>
            <Input id="servico-codigo" disabled={salvando} {...form.register("codigo")} />
          </CampoFormulario>
          <CampoFormulario id="servico-unidade" rotulo="Unidade" erro={erros.unidadeId?.message}>
            <Combobox
              id="servico-unidade"
              valor={unidadeId ?? ""}
              onValorChange={(v) => form.setValue("unidadeId", v || undefined, { shouldDirty: true, shouldValidate: true })}
              opcoes={opcoesUnidade}
              buscaPlaceholder="Buscar unidade"
              disabled={salvando}
            />
          </CampoFormulario>
        </div>
        <CampoFormulario id="servico-nome" rotulo="Nome" obrigatorio erro={erros.nome?.message}>
          <Input id="servico-nome" disabled={salvando} {...form.register("nome")} />
        </CampoFormulario>
        <CampoFormulario id="servico-produtividade" rotulo="Produtividade padrão (por dia)" erro={erros.produtividadePadrao?.message}>
          <InputQuantidade
            id="servico-produtividade"
            valor={produtividade ?? ""}
            onValorChange={(v) => form.setValue("produtividadePadrao", v, { shouldDirty: true, shouldValidate: true })}
            disabled={salvando}
          />
        </CampoFormulario>
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-corpo">
            <Checkbox
              checked={Boolean(ceuAberto)}
              onCheckedChange={(c) => form.setValue("ceuAberto", c === true, { shouldDirty: true })}
              disabled={salvando}
            />
            Céu aberto (a chuva para o serviço)
          </label>
          <label className="flex items-center gap-2 text-corpo">
            <Checkbox checked={Boolean(ativo)} onCheckedChange={(c) => form.setValue("ativo", c === true, { shouldDirty: true })} disabled={salvando} />
            Ativo
          </label>
        </div>
        <CampoFormulario id="servico-obs" rotulo="Observações" erro={erros.observacoes?.message}>
          <Textarea id="servico-obs" rows={3} disabled={salvando} {...form.register("observacoes")} />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
