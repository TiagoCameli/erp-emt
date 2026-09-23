"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
  InputQuantidade,
  LinhaCampos,
  submeterComAviso,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  agoraDataHoraLocal,
  dataHoraLocalParaIso,
  formatarLitros,
} from "@/modules/combustivel/_shared/rotulos";
import {
  consultarEstoqueEsvaziamento,
  registrarEsvaziamento,
} from "@/modules/combustivel/esvaziamentos/actions";
import {
  esvaziamentoDoForm,
  esvaziamentoFormSchema,
  type EsvaziamentoFormInput,
} from "@/modules/combustivel/esvaziamentos/schemas";
import { useEstoqueNaData, dicaDoEstoque } from "@/modules/combustivel/transferencias/components/use-estoque-na-data";
import { litrosParaTexto } from "@/modules/combustivel/transferencias/schemas";

const ID_FORM = "form-esvaziamento";

/** Tanque da EMT oferecido no formulário (tanque de terceiro não se esvazia). */
export interface TanqueEsvaziavel {
  id: string;
  nome: string;
  nivel: number;
  combustivelNome: string | null;
}

function valoresIniciais(): EsvaziamentoFormInput {
  return { tanqueId: "", litros: "", motivo: "", dataHora: agoraDataHoraLocal() };
}

export interface EsvaziamentoFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  tanques: TanqueEsvaziavel[];
}

/**
 * Registra um esvaziamento. Escolher o tanque preenche os litros com o nível
 * atual (esvaziar é, quase sempre, tirar tudo), e a pessoa pode mudar. Não há
 * edição: errou, exclui com motivo e registra de novo.
 */
export function EsvaziamentoFormDrawer({ aberto, onAbertoChange, tanques }: EsvaziamentoFormDrawerProps) {
  const form = useForm<EsvaziamentoFormInput>({
    resolver: zodResolver(esvaziamentoFormSchema),
    defaultValues: valoresIniciais(),
  });

  const salvando = form.formState.isSubmitting;
  const erros = form.formState.errors;

  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais());
  }, [aberto, form]);

  const [tanqueId, litros, dataHora] = useWatch({
    control: form.control,
    name: ["tanqueId", "litros", "dataHora"],
  });

  const opcoes = React.useMemo(
    () =>
      tanques.map((t) => ({
        valor: t.id,
        rotulo: `${t.nome} (${formatarLitros(t.nivel)}${t.combustivelNome ? ` de ${t.combustivelNome}` : ""})`,
      })),
    [tanques],
  );

  const dataIso = dataHoraLocalParaIso(dataHora ?? "");
  const estoque = useEstoqueNaData(consultarEstoqueEsvaziamento, tanqueId, dataIso, aberto);

  function aoEscolherTanque(valor: string) {
    form.setValue("tanqueId", valor, { shouldDirty: true, shouldValidate: true });
    const tanque = tanques.find((t) => t.id === valor);
    form.setValue("litros", tanque && tanque.nivel > 0 ? litrosParaTexto(tanque.nivel) : "", { shouldDirty: true });
  }

  async function aoEnviar(valores: EsvaziamentoFormInput) {
    const resultado = await registrarEsvaziamento(esvaziamentoDoForm(valores));
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Esvaziamento registrado");
    onAbertoChange(false);
  }

  const dicaEstoque = dicaDoEstoque(estoque, "No tanque nessa data", "Preenchido com o nível atual do tanque");

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Esvaziar tanque"
      descricao="Retira o combustível do tanque (descarte, contaminação, limpeza). Não consome o custo do PEPS"
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
                Salvando...
              </>
            ) : (
              "Registrar esvaziamento"
            )}
          </Button>
        </>
      }
    >
      <form id={ID_FORM} onSubmit={submeterComAviso(form, aoEnviar)} className={classesFormulario} noValidate>
        <CampoFormulario id="esvaziamento-tanque" rotulo="Tanque" obrigatorio erro={erros.tanqueId?.message}>
          <Combobox
            id="esvaziamento-tanque"
            valor={tanqueId ?? ""}
            onValorChange={aoEscolherTanque}
            opcoes={opcoes}
            placeholder="Selecione o tanque"
            buscaPlaceholder="Buscar tanque"
            disabled={salvando}
          />
        </CampoFormulario>

        <LinhaCampos colunas={2}>
          <CampoFormulario id="esvaziamento-data" rotulo="Data e hora" obrigatorio erro={erros.dataHora?.message}>
            <Input id="esvaziamento-data" type="datetime-local" disabled={salvando} {...form.register("dataHora")} />
          </CampoFormulario>
          <CampoFormulario
            id="esvaziamento-litros"
            rotulo="Litros"
            obrigatorio
            ajuda={dicaEstoque}
            erro={erros.litros?.message}
          >
            <InputQuantidade
              id="esvaziamento-litros"
              valor={litros ?? ""}
              onValorChange={(valor) => form.setValue("litros", valor, { shouldDirty: true })}
              onBlur={() => void form.trigger("litros")}
              disabled={salvando}
            />
          </CampoFormulario>
        </LinhaCampos>

        <CampoFormulario id="esvaziamento-motivo" rotulo="Motivo" obrigatorio erro={erros.motivo?.message}>
          <Textarea
            id="esvaziamento-motivo"
            rows={3}
            placeholder="Diesel contaminado com água, descartado"
            disabled={salvando}
            {...form.register("motivo")}
          />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
