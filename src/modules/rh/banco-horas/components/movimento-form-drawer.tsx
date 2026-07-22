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
  criarMovimento,
  editarMovimento,
} from "@/modules/rh/banco-horas/actions";
import type { MovimentoLista } from "@/modules/rh/banco-horas/queries";
import {
  movimentoFormParaInput,
  movimentoFormSchema,
  ROTULO_TIPO_MOVIMENTO,
  TIPOS_MOVIMENTO,
  type MovimentoFormInput,
} from "@/modules/rh/banco-horas/schemas";
import type { ColaboradorOpcao } from "@/modules/rh/_shared/queries";

const ID_FORM = "form-movimento";

function valoresIniciais(): MovimentoFormInput {
  return {
    colaboradorId: "",
    data: dataHojeISO(),
    tipo: "credito",
    horas: "",
    motivo: "",
    observacao: "",
  };
}

export interface MovimentoFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  colaboradores: ColaboradorOpcao[];
  /** Movimento em edição. Ausente significa criar. */
  movimento?: MovimentoLista | null;
}

/**
 * Drawer com o formulário de movimento de banco de horas. Cria quando não
 * recebe movimento e edita quando recebe. Fecha sozinho ao salvar.
 */
export function MovimentoFormDrawer({
  aberto,
  onAbertoChange,
  colaboradores,
  movimento,
}: MovimentoFormDrawerProps) {
  const editando = Boolean(movimento);

  const form = useForm<MovimentoFormInput>({
    resolver: zodResolver(movimentoFormSchema),
    defaultValues: valoresIniciais(),
  });

  // Sincroniza o formulário sempre que o drawer abre ou troca de registro.
  React.useEffect(() => {
    if (!aberto) return;
    if (movimento) {
      form.reset({
        colaboradorId: movimento.colaboradorId,
        data: movimento.data,
        tipo: movimento.tipo,
        horas: String(movimento.horas).replace(".", ","),
        motivo: movimento.motivo ?? "",
        observacao: movimento.observacao ?? "",
      });
    } else {
      form.reset(valoresIniciais());
    }
  }, [aberto, movimento, form]);

  const salvando = form.formState.isSubmitting;

  async function aoEnviar(dados: MovimentoFormInput) {
    const entrada = movimentoFormParaInput(dados);
    const resultado = movimento
      ? await editarMovimento(movimento.id, entrada)
      : await criarMovimento(entrada);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "Movimento salvo" : "Movimento criado");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar movimento" : "Novo movimento"}
      descricao="Crédito soma horas ao saldo; débito subtrai. O saldo é por colaborador."
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
            {editando ? "Salvar movimento" : "Criar movimento"}
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
          id="movimento-colaborador"
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
              rotulo: colaborador.funcao
                ? `${colaborador.nome} - ${colaborador.funcao}`
                : colaborador.nome,
            }))}
            placeholder="Selecione o colaborador"
            className="w-full"
            id="movimento-colaborador"
          />
        </CampoFormulario>

        <LinhaCampos>
          <CampoFormulario
            id="movimento-data"
            rotulo="Data"
            erro={form.formState.errors.data?.message}
          >
            <Input id="movimento-data" type="date" {...form.register("data")} />
          </CampoFormulario>

          <CampoFormulario
            id="movimento-horas"
            rotulo="Horas"
            erro={form.formState.errors.horas?.message}
          >
            <Input
              id="movimento-horas"
              inputMode="decimal"
              placeholder="0,00"
              className="text-right tabular-nums"
              {...form.register("horas")}
            />
          </CampoFormulario>
        </LinhaCampos>

        <CampoFormulario
          id="movimento-tipo"
          rotulo="Tipo"
          erro={form.formState.errors.tipo?.message}
        >
          <Combobox
            valor={form.watch("tipo")}
            onValorChange={(valor) =>
              form.setValue("tipo", valor as MovimentoFormInput["tipo"], {
                shouldValidate: true,
              })
            }
            opcoes={TIPOS_MOVIMENTO.map((tipo) => ({
              valor: tipo,
              rotulo: ROTULO_TIPO_MOVIMENTO[tipo],
            }))}
            placeholder="Selecione o tipo"
            className="w-full"
            id="movimento-tipo"
          />
        </CampoFormulario>

        <CampoFormulario
          id="movimento-motivo"
          rotulo="Motivo"
          erro={form.formState.errors.motivo?.message}
        >
          <Input
            id="movimento-motivo"
            placeholder="Opcional"
            {...form.register("motivo")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="movimento-observacao"
          rotulo="Observação"
          erro={form.formState.errors.observacao?.message}
        >
          <Textarea
            id="movimento-observacao"
            rows={2}
            placeholder="Opcional"
            {...form.register("observacao")}
          />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
