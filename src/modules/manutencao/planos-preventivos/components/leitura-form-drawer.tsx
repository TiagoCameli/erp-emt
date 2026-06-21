"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { FormDrawer } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { dataHojeISO } from "@/lib/formatadores";
import {
  CampoFormulario,
  classesFormulario,
} from "@/modules/cadastros/_shared/campos";
import type { EquipamentoOpcao } from "@/modules/manutencao/_shared/queries";
import { registrarLeitura } from "@/modules/manutencao/planos-preventivos/actions";
import {
  leituraFormParaInput,
  leituraFormSchema,
  ROTULO_TIPO_LEITURA,
  TIPOS_LEITURA,
  type LeituraFormInput,
  type TipoLeitura,
} from "@/modules/manutencao/planos-preventivos/schemas";

const ID_FORM = "form-leitura-equipamento";

function valoresIniciais(): LeituraFormInput {
  return {
    equipamentoId: "",
    tipo: "horimetro",
    valor: "",
    data: dataHojeISO(),
  };
}

export interface LeituraFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  equipamentos: EquipamentoOpcao[];
}

/**
 * Drawer de registro manual de leitura de horímetro/km. O tipo já vem do
 * controle do equipamento escolhido, mas pode ser trocado. Fecha no sucesso.
 */
export function LeituraFormDrawer({
  aberto,
  onAbertoChange,
  equipamentos,
}: LeituraFormDrawerProps) {
  const form = useForm<LeituraFormInput>({
    resolver: zodResolver(leituraFormSchema),
    defaultValues: valoresIniciais(),
  });

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais());
  }, [aberto, form]);

  const salvando = form.formState.isSubmitting;

  const equipamentoId = form.watch("equipamentoId");
  const equipamento = equipamentos.find((eq) => eq.id === equipamentoId);

  // Ao escolher o equipamento, alinha o tipo ao controle dele (horímetro/km).
  React.useEffect(() => {
    if (equipamento?.controlePor === "horimetro") {
      form.setValue("tipo", "horimetro");
    } else if (equipamento?.controlePor === "km") {
      form.setValue("tipo", "km");
    }
  }, [equipamento?.controlePor, form]);

  async function aoEnviar(dados: LeituraFormInput) {
    const resultado = await registrarLeitura(leituraFormParaInput(dados));
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Leitura registrada");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Registrar leitura"
      descricao="Informe o horímetro ou a quilometragem atual do equipamento. A previsão usa a leitura mais recente."
      rodape={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => onAbertoChange(false)}
            disabled={salvando}
          >
            Cancelar
          </Button>
          <Button type="submit" form={ID_FORM} disabled={salvando}>
            {salvando ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : null}
            Registrar leitura
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
          id="leitura-equipamento"
          rotulo="Equipamento"
          obrigatorio
          erro={form.formState.errors.equipamentoId?.message}
        >
          <Select
            value={form.watch("equipamentoId")}
            onValueChange={(valor) =>
              form.setValue("equipamentoId", valor, { shouldValidate: true })
            }
            disabled={salvando}
          >
            <SelectTrigger id="leitura-equipamento" className="w-full">
              <SelectValue placeholder="Selecione o equipamento" />
            </SelectTrigger>
            <SelectContent>
              {equipamentos.map((eq) => (
                <SelectItem key={eq.id} value={eq.id}>
                  {eq.descricao}
                  {eq.placa ? ` (${eq.placa})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CampoFormulario>

        <div className="grid grid-cols-2 gap-4">
          <CampoFormulario
            id="leitura-tipo"
            rotulo="Tipo"
            obrigatorio
            erro={form.formState.errors.tipo?.message}
          >
            <Select
              value={form.watch("tipo")}
              onValueChange={(valor) =>
                form.setValue("tipo", valor as TipoLeitura, {
                  shouldValidate: true,
                })
              }
              disabled={salvando}
            >
              <SelectTrigger id="leitura-tipo" className="w-full">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_LEITURA.map((tipo) => (
                  <SelectItem key={tipo} value={tipo}>
                    {ROTULO_TIPO_LEITURA[tipo]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CampoFormulario>

          <CampoFormulario
            id="leitura-valor"
            rotulo="Valor"
            obrigatorio
            erro={form.formState.errors.valor?.message}
          >
            <Input
              id="leitura-valor"
              inputMode="decimal"
              placeholder="0"
              className="text-right tabular-nums"
              disabled={salvando}
              {...form.register("valor")}
            />
          </CampoFormulario>
        </div>

        <CampoFormulario
          id="leitura-data"
          rotulo="Data"
          obrigatorio
          erro={form.formState.errors.data?.message}
        >
          <Input
            id="leitura-data"
            type="date"
            disabled={salvando}
            {...form.register("data")}
          />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
