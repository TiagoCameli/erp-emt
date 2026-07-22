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
import { criarDiaria, editarDiaria } from "@/modules/rh/diaristas/actions";
import type { DiariaLista } from "@/modules/rh/diaristas/queries";
import {
  diariaFormParaInput,
  diariaFormSchema,
  type DiariaFormInput,
} from "@/modules/rh/diaristas/schemas";
import type { DiaristaOpcao, ObraOpcao } from "@/modules/rh/_shared/queries";

const ID_FORM = "form-diaria";
/** Valor da obra "sem obra" no combobox (Radix proíbe value vazio). */
const SEM_OBRA = "__sem_obra__";

function valoresIniciais(): DiariaFormInput {
  return {
    colaboradorId: "",
    obraId: "",
    data: dataHojeISO(),
    valor: "",
    observacao: "",
  };
}

/** Converte o valor numérico do banco na string pt-BR do formulário. */
function valorParaString(valor: number): string {
  return String(valor).replace(".", ",");
}

export interface DiariaFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  diaristas: DiaristaOpcao[];
  obras: ObraOpcao[];
  /** Diária em edição. Ausente significa registrar. */
  diaria?: DiariaLista | null;
}

/**
 * Drawer com o formulário de diária. Registra quando não recebe diária e edita
 * quando recebe. Ao escolher o diarista numa nova diária, pré-preenche o valor
 * com a diária do cadastro. Diárias já fechadas ficam travadas e não chegam
 * aqui (a tabela esconde a ação). Fecha sozinho ao salvar.
 */
export function DiariaFormDrawer({
  aberto,
  onAbertoChange,
  diaristas,
  obras,
  diaria,
}: DiariaFormDrawerProps) {
  const editando = Boolean(diaria);

  const form = useForm<DiariaFormInput>({
    resolver: zodResolver(diariaFormSchema),
    defaultValues: valoresIniciais(),
  });

  // Sincroniza o formulário sempre que o drawer abre ou troca de registro.
  React.useEffect(() => {
    if (!aberto) return;
    if (diaria) {
      form.reset({
        colaboradorId: diaria.colaboradorId,
        obraId: diaria.obraId ?? "",
        data: diaria.data,
        valor: valorParaString(diaria.valor),
        observacao: diaria.observacao ?? "",
      });
    } else {
      form.reset(valoresIniciais());
    }
  }, [aberto, diaria, form]);

  const salvando = form.formState.isSubmitting;

  /** Ao escolher o diarista numa nova diária, sugere o valor do cadastro. */
  function aoEscolherDiarista(colaboradorId: string) {
    form.setValue("colaboradorId", colaboradorId, { shouldValidate: true });
    if (editando) return;
    const escolhido = diaristas.find((d) => d.id === colaboradorId);
    const valorAtual = form.getValues("valor").trim();
    if (escolhido?.valorDiaria != null && valorAtual === "") {
      form.setValue("valor", valorParaString(escolhido.valorDiaria), {
        shouldValidate: true,
      });
    }
  }

  async function aoEnviar(dados: DiariaFormInput) {
    const entrada = diariaFormParaInput(dados);
    const resultado = diaria
      ? await editarDiaria(diaria.id, entrada)
      : await criarDiaria(entrada);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "Diária salva" : "Diária registrada");
    onAbertoChange(false);
  }

  const obraValor = form.watch("obraId");

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar diária" : "Nova diária"}
      descricao="Diárias em aberto são somadas no fechamento da competência e viram um lançamento a pagar."
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
            {editando ? "Salvar diária" : "Registrar diária"}
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
          id="diaria-colaborador"
          rotulo="Diarista"
          erro={form.formState.errors.colaboradorId?.message}
        >
          <Combobox
            valor={form.watch("colaboradorId")}
            onValorChange={aoEscolherDiarista}
            opcoes={diaristas.map((diarista) => ({
              valor: diarista.id,
              rotulo: diarista.nome,
            }))}
            placeholder="Selecione o diarista"
            className="w-full"
            id="diaria-colaborador"
          />
        </CampoFormulario>

        <CampoFormulario
          id="diaria-obra"
          rotulo="Obra"
          erro={form.formState.errors.obraId?.message}
        >
          <Combobox
            valor={obraValor === "" ? SEM_OBRA : obraValor}
            onValorChange={(valor) =>
              form.setValue("obraId", valor === SEM_OBRA ? "" : valor)
            }
            opcoes={[
              { valor: SEM_OBRA, rotulo: "Sem obra" },
              ...obras.map((obra) => ({
                valor: obra.id,
                rotulo: obra.nome + (obra.lote ? ` - Lote ${obra.lote}` : ""),
              })),
            ]}
            placeholder="Sem obra"
            className="w-full"
            id="diaria-obra"
          />
        </CampoFormulario>

        <LinhaCampos>
          <CampoFormulario
            id="diaria-data"
            rotulo="Data da diária"
            erro={form.formState.errors.data?.message}
          >
            <Input id="diaria-data" type="date" {...form.register("data")} />
          </CampoFormulario>

          <CampoFormulario
            id="diaria-valor"
            rotulo="Valor (R$)"
            erro={form.formState.errors.valor?.message}
          >
            <Input
              id="diaria-valor"
              inputMode="decimal"
              placeholder="0,00"
              className="text-right tabular-nums"
              {...form.register("valor")}
            />
          </CampoFormulario>
        </LinhaCampos>

        <CampoFormulario
          id="diaria-observacao"
          rotulo="Observação"
          erro={form.formState.errors.observacao?.message}
        >
          <Textarea
            id="diaria-observacao"
            rows={2}
            placeholder="Opcional"
            {...form.register("observacao")}
          />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
