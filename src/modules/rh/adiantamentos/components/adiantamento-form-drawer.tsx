"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
  LinhaCampos,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { dataHojeISO } from "@/lib/formatadores";
import {
  criarAdiantamento,
  editarAdiantamento,
} from "@/modules/rh/adiantamentos/actions";
import type { AdiantamentoLista } from "@/modules/rh/adiantamentos/queries";
import {
  adiantamentoFormParaInput,
  adiantamentoFormSchema,
  competenciaParaMes,
  type AdiantamentoFormInput,
} from "@/modules/rh/adiantamentos/schemas";
import type { ColaboradorOpcao } from "@/modules/rh/_shared/queries";

const ID_FORM = "form-adiantamento";

/** Mês corrente (yyyy-MM) no fuso do sistema, para default da competência. */
function mesAtual(): string {
  return dataHojeISO().slice(0, 7);
}

function valoresIniciais(): AdiantamentoFormInput {
  return {
    colaboradorId: "",
    competencia: mesAtual(),
    valor: "",
    data: dataHojeISO(),
    descricao: "",
  };
}

export interface AdiantamentoFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  colaboradores: ColaboradorOpcao[];
  /** Adiantamento em edição. Ausente significa criar. */
  adiantamento?: AdiantamentoLista | null;
}

/**
 * Drawer com o formulário de adiantamento. Cria quando não recebe adiantamento
 * e edita quando recebe. Adiantamentos já incluídos numa folha ficam travados
 * e não chegam até aqui (a tabela esconde a ação). Fecha sozinho ao salvar.
 */
export function AdiantamentoFormDrawer({
  aberto,
  onAbertoChange,
  colaboradores,
  adiantamento,
}: AdiantamentoFormDrawerProps) {
  const editando = Boolean(adiantamento);

  const form = useForm<AdiantamentoFormInput>({
    resolver: zodResolver(adiantamentoFormSchema),
    defaultValues: valoresIniciais(),
  });

  // Sincroniza o formulário sempre que o drawer abre ou troca de registro.
  React.useEffect(() => {
    if (!aberto) return;
    if (adiantamento) {
      form.reset({
        colaboradorId: adiantamento.colaboradorId,
        competencia: competenciaParaMes(adiantamento.competencia),
        valor: String(adiantamento.valor).replace(".", ","),
        data: adiantamento.data,
        descricao: adiantamento.descricao ?? "",
      });
    } else {
      form.reset(valoresIniciais());
    }
  }, [aberto, adiantamento, form]);

  const salvando = form.formState.isSubmitting;

  async function aoEnviar(dados: AdiantamentoFormInput) {
    const entrada = adiantamentoFormParaInput(dados);
    const resultado = adiantamento
      ? await editarAdiantamento(adiantamento.id, entrada)
      : await criarAdiantamento(entrada);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "Adiantamento salvo" : "Adiantamento criado");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar adiantamento" : "Novo adiantamento"}
      descricao="Adiantamentos são descontados na folha gerencial da competência."
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
            {editando ? "Salvar adiantamento" : "Criar adiantamento"}
          </Button>
        </>
      }
    >
      <form
        id={ID_FORM}
        onSubmit={form.handleSubmit(aoEnviar)}
        className={classesFormulario}
      >
        <CampoFormulario
          id="adiantamento-colaborador"
          rotulo="Colaborador"
          erro={form.formState.errors.colaboradorId?.message}
        >
          <Combobox
            valor={form.watch("colaboradorId")}
            onValorChange={(valor) =>
              form.setValue("colaboradorId", valor, { shouldValidate: true })
            }
            opcoes={colaboradores.map((colaborador) => ({
              valor: colaborador.id,
              rotulo: `${colaborador.nome}${colaborador.funcao ? ` - ${colaborador.funcao}` : ""}`,
            }))}
            placeholder="Selecione o colaborador"
            className="w-full"
            id="adiantamento-colaborador"
          />
        </CampoFormulario>

        <LinhaCampos>
          <CampoFormulario
            id="adiantamento-competencia"
            rotulo="Competência"
            erro={form.formState.errors.competencia?.message}
          >
            <Input
              id="adiantamento-competencia"
              type="month"
              {...form.register("competencia")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="adiantamento-valor"
            rotulo="Valor (R$)"
            erro={form.formState.errors.valor?.message}
          >
            <Input
              id="adiantamento-valor"
              inputMode="decimal"
              placeholder="0,00"
              className="text-right tabular-nums"
              {...form.register("valor")}
            />
          </CampoFormulario>
        </LinhaCampos>

        <CampoFormulario
          id="adiantamento-data"
          rotulo="Data do adiantamento"
          erro={form.formState.errors.data?.message}
        >
          <Input
            id="adiantamento-data"
            type="date"
            {...form.register("data")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="adiantamento-descricao"
          rotulo="Descrição"
          erro={form.formState.errors.descricao?.message}
        >
          <Textarea
            id="adiantamento-descricao"
            rows={2}
            placeholder="Opcional"
            {...form.register("descricao")}
          />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
