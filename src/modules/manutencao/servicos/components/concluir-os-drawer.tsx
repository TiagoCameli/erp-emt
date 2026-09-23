"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";

import {
  CampoFormulario,
  classesFormulario,
  FormDrawer,
  InputQuantidade,
  submeterComAviso,
} from "@/components/canonicos";
import { semDerrubarSucesso } from "@/components/canonicos/acao-sem-silencio";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dataHojeISO } from "@/lib/formatadores";
import { concluirOs } from "@/modules/manutencao/servicos/actions";
import {
  concluirFormSchema,
  validarConclusao,
  type ConcluirFormInput,
} from "@/modules/manutencao/servicos/schemas";

const ID_FORM = "form-concluir-os";

export interface ConcluirOsDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  osId: string;
  numero: string;
}

/** Concluir a OS: data de conclusão (hoje em Rio Branco) e medição opcional. */
export function ConcluirOsDrawer({ aberto, onAbertoChange, osId, numero }: ConcluirOsDrawerProps) {
  const router = useRouter();
  const form = useForm<ConcluirFormInput>({
    resolver: zodResolver(concluirFormSchema),
    defaultValues: { dataConclusao: dataHojeISO(), medicaoConclusao: "" },
  });

  React.useEffect(() => {
    if (aberto) form.reset({ dataConclusao: dataHojeISO(), medicaoConclusao: "" });
  }, [aberto, form]);

  const salvando = form.formState.isSubmitting;
  const medicao = form.watch("medicaoConclusao");

  async function aoEnviar(valores: ConcluirFormInput) {
    const validado = validarConclusao(valores.dataConclusao, valores.medicaoConclusao);
    if (!validado.ok) {
      toast.error(validado.erro);
      return;
    }
    const resultado = await concluirOs(osId, validado.dados);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(`${numero} concluída`);
    semDerrubarSucesso("manutencao.servicos.concluir", () => {
      onAbertoChange(false);
      router.refresh();
    });
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={`Concluir ${numero}`}
      descricao="Concluída, a OS só volta a ser editada se for reaberta, com motivo"
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
                Concluindo...
              </>
            ) : (
              "Concluir OS"
            )}
          </Button>
        </>
      }
    >
      <form id={ID_FORM} onSubmit={submeterComAviso(form, aoEnviar)} className={classesFormulario} noValidate>
        <CampoFormulario
          id="os-data-conclusao"
          rotulo="Data de conclusão"
          obrigatorio
          erro={form.formState.errors.dataConclusao?.message}
        >
          <Input id="os-data-conclusao" type="date" disabled={salvando} {...form.register("dataConclusao")} />
        </CampoFormulario>
        <CampoFormulario
          id="os-medicao-conclusao"
          rotulo="Medição de conclusão"
          ajuda="Horímetro ou km na entrega do equipamento. Opcional"
          erro={form.formState.errors.medicaoConclusao?.message}
        >
          <InputQuantidade
            id="os-medicao-conclusao"
            valor={medicao ?? ""}
            onValorChange={(valor) =>
              form.setValue("medicaoConclusao", valor, { shouldValidate: true, shouldDirty: true })
            }
            placeholder="0"
            disabled={salvando}
          />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
