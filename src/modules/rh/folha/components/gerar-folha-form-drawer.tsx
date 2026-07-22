"use client";

import * as React from "react";
import { LoaderCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import {
  CampoFormulario,
  classesFormulario,
  FormDrawer,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dataHojeISO } from "@/lib/formatadores";
import { gerarFolha } from "@/modules/rh/folha/actions";
import {
  gerarFolhaFormParaInput,
  gerarFolhaFormSchema,
  type GerarFolhaFormInput,
} from "@/modules/rh/folha/schemas";

const ID_FORM = "form-gerar-folha";

/** Mês corrente (yyyy-MM) no fuso do sistema, default da competência. */
function mesCorrente(): string {
  return dataHojeISO().slice(0, 7);
}

function valoresIniciais(competenciaInicial?: string): GerarFolhaFormInput {
  return {
    competencia: competenciaInicial ?? mesCorrente(),
    encargosPercentual: "",
  };
}

export interface GerarFolhaFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Competência pré-preenchida (yyyy-MM) ao regerar uma folha existente. */
  competenciaInicial?: string;
  /** Percentual de encargos pré-preenchido ao regerar. */
  encargosInicial?: string;
  /** Chamado com o id da folha gerada, para navegar ao detalhe. */
  onGerada?: (id: string) => void;
}

/**
 * Drawer de gerar folha gerencial: mês da competência + percentual de encargos.
 * Gerar consolida os colaboradores CLT ativos da competência em um rascunho;
 * regerar (mesma competência) substitui o rascunho. Fecha no sucesso e navega
 * para o detalhe.
 */
export function GerarFolhaFormDrawer({
  aberto,
  onAbertoChange,
  competenciaInicial,
  encargosInicial,
  onGerada,
}: GerarFolhaFormDrawerProps) {
  const form = useForm<GerarFolhaFormInput>({
    resolver: zodResolver(gerarFolhaFormSchema),
    defaultValues: valoresIniciais(competenciaInicial),
  });

  React.useEffect(() => {
    if (aberto) {
      form.reset({
        competencia: competenciaInicial ?? mesCorrente(),
        encargosPercentual: encargosInicial ?? "",
      });
    }
  }, [aberto, competenciaInicial, encargosInicial, form]);

  const salvando = form.formState.isSubmitting;
  const regerar = competenciaInicial !== undefined;

  async function aoEnviar(dados: GerarFolhaFormInput) {
    const resultado = await gerarFolha(gerarFolhaFormParaInput(dados));
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(regerar ? "Folha regerada" : "Folha gerada");
    onAbertoChange(false);
    onGerada?.(resultado.id);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={regerar ? "Regerar folha" : "Gerar folha"}
      descricao="Consolida os colaboradores CLT ativos da competência, com ponto, adiantamentos e encargos. Regerar substitui o rascunho da mesma competência."
      rodape={
        <>
          <Button
            type="button"
            variant="outline"
            disabled={salvando}
            onClick={() => onAbertoChange(false)}
          >
            Cancelar
          </Button>
          <Button type="submit" form={ID_FORM} disabled={salvando}>
            {salvando ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : null}
            {regerar ? "Regerar folha" : "Gerar folha"}
          </Button>
        </>
      }
    >
      <form
        id={ID_FORM}
        onSubmit={form.handleSubmit(aoEnviar)}
        className={classesFormulario}
        noValidate
      >
        <CampoFormulario
          id="gerar-folha-competencia"
          rotulo="Competência"
          erro={form.formState.errors.competencia?.message}
          ajuda={regerar ? "A competência não muda ao regerar." : undefined}
        >
          <Input
            id="gerar-folha-competencia"
            type="month"
            disabled={regerar}
            {...form.register("competencia")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="gerar-folha-encargos"
          rotulo="Encargos (%)"
          erro={form.formState.errors.encargosPercentual?.message}
          ajuda="Percentual aplicado sobre salário e extras para estimar o custo da empresa."
        >
          <Input
            id="gerar-folha-encargos"
            inputMode="decimal"
            placeholder="0"
            className="text-right tabular-nums"
            {...form.register("encargosPercentual")}
          />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
