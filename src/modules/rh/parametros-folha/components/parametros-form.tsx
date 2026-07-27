"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import {
  CampoFormulario,
  classesFormulario,
  LinhaCampos,
  SecaoFormulario,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { salvarParametros } from "@/modules/rh/parametros-folha/actions";
import type { ParametrosFolha } from "@/modules/rh/parametros-folha/queries";
import {
  parametrosSchema,
  type ParametrosFormInput,
} from "@/modules/rh/parametros-folha/schemas";

const ID_FORM = "form-parametros-folha";

const PADRAO: ParametrosFormInput = {
  irrfDeducaoPorDependente: "",
  irrfDescontoSimplificado: "",
  fgtsPercentual: "",
};

/** Converte os parâmetros salvos em texto pt-BR (vírgula decimal) para o formulário. */
function paraFormulario(parametros: ParametrosFolha): ParametrosFormInput {
  return {
    irrfDeducaoPorDependente: String(
      parametros.irrfDeducaoPorDependente,
    ).replace(".", ","),
    irrfDescontoSimplificado: String(
      parametros.irrfDescontoSimplificado,
    ).replace(".", ","),
    fgtsPercentual: String(parametros.fgtsPercentual).replace(".", ","),
  };
}

export interface ParametrosFormProps {
  /** Linha salva de `folha_parametros`, ou null se ainda não foi criada. */
  parametros: ParametrosFolha | null;
  podeEditar: boolean;
}

/**
 * Form dos parâmetros escalares da folha (config singleton): dedução por
 * dependente do IRRF, desconto simplificado do IRRF e percentual do FGTS.
 * Salva sempre via UPSERT (`salvarParametros`) — não há criação separada.
 */
export function ParametrosForm({ parametros, podeEditar }: ParametrosFormProps) {
  const form = useForm<ParametrosFormInput>({
    resolver: zodResolver(parametrosSchema),
    defaultValues: parametros ? paraFormulario(parametros) : PADRAO,
  });

  const salvando = form.formState.isSubmitting;
  const camposDesabilitados = salvando || !podeEditar;

  async function aoEnviar(entrada: ParametrosFormInput) {
    const dados = parametrosSchema.parse(entrada);
    const resultado = await salvarParametros(dados);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success("Parâmetros da folha salvos");
  }

  return (
    <SecaoFormulario titulo="Parâmetros">
      <p className="text-detalhe text-muted-foreground">
        Cadastre os parâmetros oficiais vigentes usados no cálculo da folha.
      </p>

      <form
        id={ID_FORM}
        onSubmit={form.handleSubmit(aoEnviar)}
        className={classesFormulario}
        noValidate
      >
        <LinhaCampos colunas={3}>
          <CampoFormulario
            id="parametros-deducao-dependente"
            rotulo="Dedução por dependente (IRRF)"
            obrigatorio
            erro={form.formState.errors.irrfDeducaoPorDependente?.message}
            ajuda="Valor deduzido da base de cálculo do IRRF por dependente, em reais"
          >
            <Input
              id="parametros-deducao-dependente"
              autoComplete="off"
              inputMode="decimal"
              disabled={camposDesabilitados}
              {...form.register("irrfDeducaoPorDependente")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="parametros-desconto-simplificado"
            rotulo="Desconto simplificado (IRRF)"
            obrigatorio
            erro={form.formState.errors.irrfDescontoSimplificado?.message}
            ajuda="Desconto substitutivo das deduções legais do IRRF, em reais"
          >
            <Input
              id="parametros-desconto-simplificado"
              autoComplete="off"
              inputMode="decimal"
              disabled={camposDesabilitados}
              {...form.register("irrfDescontoSimplificado")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="parametros-fgts"
            rotulo="FGTS"
            obrigatorio
            erro={form.formState.errors.fgtsPercentual?.message}
            ajuda="Percentual do FGTS, de 0 a 100, com até 3 casas decimais"
          >
            <Input
              id="parametros-fgts"
              autoComplete="off"
              inputMode="decimal"
              disabled={camposDesabilitados}
              {...form.register("fgtsPercentual")}
            />
          </CampoFormulario>
        </LinhaCampos>

        {podeEditar ? (
          <div className="flex justify-end">
            <Button type="submit" form={ID_FORM} disabled={salvando}>
              {salvando ? (
                <>
                  <LoaderCircle className="animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar parâmetros"
              )}
            </Button>
          </div>
        ) : null}
      </form>
    </SecaoFormulario>
  );
}
