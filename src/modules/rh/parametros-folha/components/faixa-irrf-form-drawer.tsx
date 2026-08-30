"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { toast } from "@/components/canonicos/toast";

import {
  CampoFormulario,
  classesFormulario,
  FormDrawer,
  InputDecimal,
  submeterComAviso,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { salvarFaixaIrrf } from "@/modules/rh/parametros-folha/actions";
import type { FaixaIrrfLista } from "@/modules/rh/parametros-folha/queries";
import {
  faixaIrrfSchema,
  type FaixaIrrfFormInput,
} from "@/modules/rh/parametros-folha/schemas";

const ID_FORM = "form-faixa-irrf";

const PADRAO: FaixaIrrfFormInput = {
  limiteAte: "",
  aliquota: "",
  parcelaDeduzir: "",
};

export interface FaixaIrrfFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Faixa em edição. Ausente abre o drawer em modo de criação. */
  faixa?: FaixaIrrfLista | null;
}

/**
 * Drawer de criação e edição de faixa de IRRF (limite + alíquota + parcela a
 * deduzir). Mesmo formulário para os dois modos: a presença de `faixa`
 * decide se `salvarFaixaIrrf` edita ou cria.
 */
export function FaixaIrrfFormDrawer({
  aberto,
  onAbertoChange,
  faixa,
}: FaixaIrrfFormDrawerProps) {
  const editando = Boolean(faixa);

  const form = useForm<FaixaIrrfFormInput>({
    resolver: zodResolver(faixaIrrfSchema),
    defaultValues: PADRAO,
  });

  const salvando = form.formState.isSubmitting;

  // Sincroniza o formulário com a faixa ao abrir.
  React.useEffect(() => {
    if (!aberto) return;
    if (faixa) {
      form.reset({
        limiteAte: String(faixa.limiteAte).replace(".", ","),
        aliquota: String(faixa.aliquota).replace(".", ","),
        parcelaDeduzir: String(faixa.parcelaDeduzir).replace(".", ","),
      });
    } else {
      form.reset(PADRAO);
    }
  }, [aberto, faixa, form]);

  async function aoEnviar(entrada: FaixaIrrfFormInput) {
    // Aplica o parse (trim, número) antes de chamar a action.
    const dados = faixaIrrfSchema.parse(entrada);
    const resultado = await salvarFaixaIrrf(dados, faixa?.id);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "Faixa de IRRF salva" : "Faixa de IRRF criada");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar faixa de IRRF" : "Nova faixa de IRRF"}
      descricao={
        editando
          ? "Atualize o limite, a alíquota ou a parcela a deduzir da faixa"
          : "Cadastre uma faixa oficial vigente do IRRF"
      }
      temAlteracoesNaoSalvas={form.formState.isDirty && !salvando}
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
              <>
                <LoaderCircle className="animate-spin" />
                Salvando...
              </>
            ) : editando ? (
              "Salvar faixa"
            ) : (
              "Criar faixa"
            )}
          </Button>
        </>
      }
    >
      <form
        id={ID_FORM}
        onSubmit={submeterComAviso(form, aoEnviar)}
        className={classesFormulario}
        noValidate
      >
        <CampoFormulario
          id="faixa-irrf-limite"
          rotulo="Limite até"
          obrigatorio
          erro={form.formState.errors.limiteAte?.message}
          ajuda="Teto salarial desta faixa, em reais"
        >
          <InputDecimal
            id="faixa-irrf-limite"
            autoComplete="off"
            disabled={salvando}
            {...form.register("limiteAte")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="faixa-irrf-aliquota"
          rotulo="Alíquota"
          obrigatorio
          erro={form.formState.errors.aliquota?.message}
          ajuda="Percentual desta faixa, de 0 a 100, com até 4 casas decimais"
        >
          <InputDecimal
            casas={4}
            id="faixa-irrf-aliquota"
            autoComplete="off"
            disabled={salvando}
            {...form.register("aliquota")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="faixa-irrf-parcela"
          rotulo="Parcela a deduzir"
          obrigatorio
          erro={form.formState.errors.parcelaDeduzir?.message}
          ajuda="Valor fixo, em reais, deduzido do imposto apurado nesta faixa"
        >
          <InputDecimal
            id="faixa-irrf-parcela"
            autoComplete="off"
            disabled={salvando}
            {...form.register("parcelaDeduzir")}
          />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
