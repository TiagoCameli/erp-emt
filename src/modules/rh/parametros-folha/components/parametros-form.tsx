"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  CampoFormulario,
  classesFormulario,
  ComboboxCriavel,
  InputDecimal,
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
    diaPagamentoSalario: parametros.diaPagamentoSalario ?? undefined,
    diaVencimentoGuias: parametros.diaVencimentoGuias ?? undefined,
    grupoRecolhimentoInss: parametros.grupoRecolhimentoInss ?? undefined,
    grupoRecolhimentoIrrf: parametros.grupoRecolhimentoIrrf ?? undefined,
  };
}

export interface ParametrosFormProps {
  /** Linha salva de `folha_parametros`, ou null se ainda não foi criada. */
  parametros: ParametrosFolha | null;
  podeEditar: boolean;
  /** Grupos de recolhimento já cadastrados nos encargos, para os Combobox dos retidos. */
  gruposRecolhimento: string[];
}

/**
 * Form dos parâmetros escalares da folha (config singleton): dedução por
 * dependente do IRRF, desconto simplificado do IRRF, percentual do FGTS, dia
 * de pagamento do salário, dia de vencimento das guias e o grupo de
 * recolhimento de cada retido do trabalhador (INSS e IRRF da folha). Salva
 * sempre via UPSERT (`salvarParametros`) — não há criação separada.
 */
export function ParametrosForm({
  parametros,
  podeEditar,
  gruposRecolhimento,
}: ParametrosFormProps) {
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
    <form
      id={ID_FORM}
      onSubmit={form.handleSubmit(aoEnviar)}
      className="flex flex-col gap-8"
      noValidate
    >
      <SecaoFormulario titulo="Parâmetros">
        <p className="text-detalhe text-muted-foreground">
          Cadastre os parâmetros oficiais vigentes usados no cálculo da folha.
        </p>

        <div className={classesFormulario}>
          <LinhaCampos colunas={3}>
            <CampoFormulario
              id="parametros-deducao-dependente"
              rotulo="Dedução por dependente (IRRF)"
              obrigatorio
              erro={form.formState.errors.irrfDeducaoPorDependente?.message}
              ajuda="Valor deduzido da base de cálculo do IRRF por dependente, em reais"
            >
              <InputDecimal
                id="parametros-deducao-dependente"
                autoComplete="off"
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
              <InputDecimal
                id="parametros-desconto-simplificado"
                autoComplete="off"
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
              <InputDecimal
                casas={3}
                id="parametros-fgts"
                autoComplete="off"
                disabled={camposDesabilitados}
                {...form.register("fgtsPercentual")}
              />
            </CampoFormulario>
          </LinhaCampos>
        </div>
      </SecaoFormulario>

      <SecaoFormulario titulo="Pagamento e recolhimento">
        <p className="text-detalhe text-muted-foreground">
          Dia do mês do pagamento e das guias, e o grupo de recolhimento de cada
          retido do trabalhador. Deixe vazio o que ainda não foi definido: sem
          dia ou sem grupo, a folha não gera nada no Financeiro.
        </p>

        <div className={classesFormulario}>
          <LinhaCampos colunas={2}>
            <CampoFormulario
              id="parametros-dia-pagamento"
              rotulo="Dia de pagamento do salário"
              erro={form.formState.errors.diaPagamentoSalario?.message}
              ajuda="Dia do mês, de 1 a 31"
            >
              <Input
                id="parametros-dia-pagamento"
                type="number"
                min={1}
                max={31}
                step={1}
                inputMode="numeric"
                className="text-right tabular-nums"
                disabled={camposDesabilitados}
                {...form.register("diaPagamentoSalario", {
                  setValueAs: (valor) =>
                    valor === "" ? undefined : Number(valor),
                })}
              />
            </CampoFormulario>

            <CampoFormulario
              id="parametros-dia-guias"
              rotulo="Dia de vencimento das guias"
              erro={form.formState.errors.diaVencimentoGuias?.message}
              ajuda="INSS, FGTS e IRRF da folha vencem no mesmo dia, de 1 a 31"
            >
              <Input
                id="parametros-dia-guias"
                type="number"
                min={1}
                max={31}
                step={1}
                inputMode="numeric"
                className="text-right tabular-nums"
                disabled={camposDesabilitados}
                {...form.register("diaVencimentoGuias", {
                  setValueAs: (valor) =>
                    valor === "" ? undefined : Number(valor),
                })}
              />
            </CampoFormulario>

            <CampoFormulario
              id="parametros-grupo-inss"
              rotulo="Grupo de recolhimento do INSS retido"
              erro={form.formState.errors.grupoRecolhimentoInss?.message}
              ajuda="Sem grupo, o INSS retido do trabalhador não gera guia"
            >
              <ComboboxCriavel
                id="parametros-grupo-inss"
                valor={form.watch("grupoRecolhimentoInss") ?? ""}
                onValorChange={(valor) =>
                  form.setValue(
                    "grupoRecolhimentoInss",
                    valor === "" ? undefined : valor,
                    { shouldValidate: true },
                  )
                }
                opcoes={gruposRecolhimento}
                onCriar={async (texto) => texto.trim()}
                placeholder="Sem grupo"
                disabled={camposDesabilitados}
              />
            </CampoFormulario>

            <CampoFormulario
              id="parametros-grupo-irrf"
              rotulo="Grupo de recolhimento do IRRF retido"
              erro={form.formState.errors.grupoRecolhimentoIrrf?.message}
              ajuda="Sem grupo, o IRRF retido do trabalhador não gera guia"
            >
              <ComboboxCriavel
                id="parametros-grupo-irrf"
                valor={form.watch("grupoRecolhimentoIrrf") ?? ""}
                onValorChange={(valor) =>
                  form.setValue(
                    "grupoRecolhimentoIrrf",
                    valor === "" ? undefined : valor,
                    { shouldValidate: true },
                  )
                }
                opcoes={gruposRecolhimento}
                onCriar={async (texto) => texto.trim()}
                placeholder="Sem grupo"
                disabled={camposDesabilitados}
              />
            </CampoFormulario>
          </LinhaCampos>
        </div>
      </SecaoFormulario>

      {podeEditar ? (
        <div className="flex justify-end">
          <Button type="submit" disabled={salvando}>
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
  );
}
