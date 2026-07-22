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
  SelectAtivo,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { dataHojeISO } from "@/lib/formatadores";
import { criarEpi, editarEpi } from "@/modules/rh/epis/actions";
import type { EpiLista } from "@/modules/rh/epis/queries";
import {
  epiFormParaInput,
  epiFormSchema,
  type EpiFormInput,
} from "@/modules/rh/epis/schemas";
import type { ColaboradorOpcao } from "@/modules/rh/_shared/queries";

const ID_FORM = "form-epi";

function valoresIniciais(): EpiFormInput {
  return {
    colaboradorId: "",
    descricao: "",
    ca: "",
    quantidade: "1",
    dataEntrega: dataHojeISO(),
    dataDevolucao: "",
    assinado: false,
    observacao: "",
  };
}

export interface EpiFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  colaboradores: ColaboradorOpcao[];
  /** EPI em edição. Ausente significa criar. */
  epi?: EpiLista | null;
}

/**
 * Drawer com o formulário de EPI. Cria quando não recebe registro e edita
 * quando recebe. A devolução é opcional (EPI ainda em uso). Fecha sozinho ao
 * salvar.
 */
export function EpiFormDrawer({
  aberto,
  onAbertoChange,
  colaboradores,
  epi,
}: EpiFormDrawerProps) {
  const editando = Boolean(epi);

  const form = useForm<EpiFormInput>({
    resolver: zodResolver(epiFormSchema),
    defaultValues: valoresIniciais(),
  });

  // Sincroniza o formulário sempre que o drawer abre ou troca de registro.
  React.useEffect(() => {
    if (!aberto) return;
    if (epi) {
      form.reset({
        colaboradorId: epi.colaboradorId,
        descricao: epi.descricao,
        ca: epi.ca ?? "",
        quantidade: String(epi.quantidade),
        dataEntrega: epi.dataEntrega,
        dataDevolucao: epi.dataDevolucao ?? "",
        assinado: epi.assinado,
        observacao: epi.observacao ?? "",
      });
    } else {
      form.reset(valoresIniciais());
    }
  }, [aberto, epi, form]);

  const salvando = form.formState.isSubmitting;

  async function aoEnviar(dados: EpiFormInput) {
    const entrada = epiFormParaInput(dados);
    const resultado = epi
      ? await editarEpi(epi.id, entrada)
      : await criarEpi(entrada);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "EPI salvo" : "EPI criado");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar EPI" : "Novo EPI"}
      descricao="Entrega de equipamento de proteção individual por colaborador."
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
            {editando ? "Salvar EPI" : "Criar EPI"}
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
          id="epi-colaborador"
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
            id="epi-colaborador"
          />
        </CampoFormulario>

        <CampoFormulario
          id="epi-descricao"
          rotulo="EPI"
          erro={form.formState.errors.descricao?.message}
        >
          <Input
            id="epi-descricao"
            placeholder="Ex: Botina de segurança"
            {...form.register("descricao")}
          />
        </CampoFormulario>

        <LinhaCampos>
          <CampoFormulario
            id="epi-ca"
            rotulo="CA"
            erro={form.formState.errors.ca?.message}
          >
            <Input
              id="epi-ca"
              placeholder="Certificado de Aprovação"
              {...form.register("ca")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="epi-quantidade"
            rotulo="Quantidade"
            erro={form.formState.errors.quantidade?.message}
          >
            <Input
              id="epi-quantidade"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              className="text-right tabular-nums"
              {...form.register("quantidade")}
            />
          </CampoFormulario>
        </LinhaCampos>

        <LinhaCampos>
          <CampoFormulario
            id="epi-data-entrega"
            rotulo="Data de entrega"
            erro={form.formState.errors.dataEntrega?.message}
          >
            <Input
              id="epi-data-entrega"
              type="date"
              {...form.register("dataEntrega")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="epi-data-devolucao"
            rotulo="Data de devolução"
            erro={form.formState.errors.dataDevolucao?.message}
          >
            <Input
              id="epi-data-devolucao"
              type="date"
              {...form.register("dataDevolucao")}
            />
          </CampoFormulario>
        </LinhaCampos>

        <SelectAtivo
          value={form.watch("assinado")}
          onChange={(valor) => form.setValue("assinado", valor)}
          disabled={salvando}
          rotulo="Termo assinado"
          ajuda="Marque quando o colaborador assinar o termo de entrega."
        />

        <CampoFormulario
          id="epi-observacao"
          rotulo="Observação"
          erro={form.formState.errors.observacao?.message}
        >
          <Textarea
            id="epi-observacao"
            rows={2}
            placeholder="Opcional"
            {...form.register("observacao")}
          />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
