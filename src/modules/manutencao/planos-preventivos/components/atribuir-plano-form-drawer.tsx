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
import { atribuirPlano } from "@/modules/manutencao/planos-preventivos/actions";
import type { PlanoLista } from "@/modules/manutencao/planos-preventivos/queries";
import {
  atribuicaoFormParaInput,
  atribuicaoFormSchema,
  type AtribuicaoFormInput,
} from "@/modules/manutencao/planos-preventivos/schemas";

const ID_FORM = "form-atribuir-plano";

function valoresIniciais(): AtribuicaoFormInput {
  return {
    equipamentoId: "",
    planoId: "",
    baseHorimetro: "",
    baseKm: "",
    baseData: dataHojeISO(),
  };
}

export interface AtribuirPlanoFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  equipamentos: EquipamentoOpcao[];
  /** Planos ativos disponíveis para atribuição. */
  planos: PlanoLista[];
}

/**
 * Drawer de atribuição de um plano a um equipamento, com a base de cálculo.
 * Os campos de base (horímetro/km) aparecem conforme o controle do
 * equipamento escolhido; a data base é sempre pedida. Fecha no sucesso.
 */
export function AtribuirPlanoFormDrawer({
  aberto,
  onAbertoChange,
  equipamentos,
  planos,
}: AtribuirPlanoFormDrawerProps) {
  const form = useForm<AtribuicaoFormInput>({
    resolver: zodResolver(atribuicaoFormSchema),
    defaultValues: valoresIniciais(),
  });

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais());
  }, [aberto, form]);

  const salvando = form.formState.isSubmitting;

  const equipamentoId = form.watch("equipamentoId");
  const equipamento = equipamentos.find((eq) => eq.id === equipamentoId);
  const controlePor = equipamento?.controlePor ?? "nenhum";

  const planosAtivos = React.useMemo(
    () => planos.filter((plano) => plano.ativo),
    [planos],
  );

  async function aoEnviar(dados: AtribuicaoFormInput) {
    const resultado = await atribuirPlano(atribuicaoFormParaInput(dados));
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Plano atribuído");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Atribuir plano"
      descricao="Vincule um plano a um equipamento e informe a base de cálculo da próxima manutenção."
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
            Atribuir plano
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
          id="atribuir-equipamento"
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
            <SelectTrigger id="atribuir-equipamento" className="w-full">
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

        <CampoFormulario
          id="atribuir-plano"
          rotulo="Plano"
          obrigatorio
          erro={form.formState.errors.planoId?.message}
        >
          <Select
            value={form.watch("planoId")}
            onValueChange={(valor) =>
              form.setValue("planoId", valor, { shouldValidate: true })
            }
            disabled={salvando || planosAtivos.length === 0}
          >
            <SelectTrigger id="atribuir-plano" className="w-full">
              <SelectValue
                placeholder={
                  planosAtivos.length === 0
                    ? "Nenhum plano ativo"
                    : "Selecione o plano"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {planosAtivos.map((plano) => (
                <SelectItem key={plano.id} value={plano.id}>
                  {plano.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CampoFormulario>

        <CampoFormulario
          id="atribuir-data"
          rotulo="Data base"
          obrigatorio
          ajuda="Ponto de partida das atividades por dias."
          erro={form.formState.errors.baseData?.message}
        >
          <Input
            id="atribuir-data"
            type="date"
            disabled={salvando}
            {...form.register("baseData")}
          />
        </CampoFormulario>

        {controlePor === "horimetro" ? (
          <CampoFormulario
            id="atribuir-horimetro"
            rotulo="Horímetro base"
            ajuda="Leitura no momento da última manutenção. Em branco se não souber."
            erro={form.formState.errors.baseHorimetro?.message}
          >
            <Input
              id="atribuir-horimetro"
              inputMode="decimal"
              placeholder="0"
              className="text-right tabular-nums"
              disabled={salvando}
              {...form.register("baseHorimetro")}
            />
          </CampoFormulario>
        ) : null}

        {controlePor === "km" ? (
          <CampoFormulario
            id="atribuir-km"
            rotulo="Quilometragem base"
            ajuda="Leitura no momento da última manutenção. Em branco se não souber."
            erro={form.formState.errors.baseKm?.message}
          >
            <Input
              id="atribuir-km"
              inputMode="decimal"
              placeholder="0"
              className="text-right tabular-nums"
              disabled={salvando}
              {...form.register("baseKm")}
            />
          </CampoFormulario>
        ) : null}
      </form>
    </FormDrawer>
  );
}
