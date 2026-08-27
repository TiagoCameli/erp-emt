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
import { salvarFaixaInss } from "@/modules/rh/parametros-folha/actions";
import type { FaixaInssLista } from "@/modules/rh/parametros-folha/queries";
import {
  faixaInssSchema,
  type FaixaInssFormInput,
} from "@/modules/rh/parametros-folha/schemas";

const ID_FORM = "form-faixa-inss";

const PADRAO: FaixaInssFormInput = {
  limiteAte: "",
  aliquota: "",
};

export interface FaixaInssFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Faixa em edição. Ausente abre o drawer em modo de criação. */
  faixa?: FaixaInssLista | null;
}

/**
 * Drawer de criação e edição de faixa de INSS (limite + alíquota). Mesmo
 * formulário para os dois modos: a presença de `faixa` decide se
 * `salvarFaixaInss` edita ou cria.
 */
export function FaixaInssFormDrawer({
  aberto,
  onAbertoChange,
  faixa,
}: FaixaInssFormDrawerProps) {
  const editando = Boolean(faixa);

  const form = useForm<FaixaInssFormInput>({
    resolver: zodResolver(faixaInssSchema),
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
      });
    } else {
      form.reset(PADRAO);
    }
  }, [aberto, faixa, form]);

  async function aoEnviar(entrada: FaixaInssFormInput) {
    // Aplica o parse (trim, número) antes de chamar a action.
    const dados = faixaInssSchema.parse(entrada);
    const resultado = await salvarFaixaInss(dados, faixa?.id);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "Faixa de INSS salva" : "Faixa de INSS criada");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar faixa de INSS" : "Nova faixa de INSS"}
      descricao={
        editando
          ? "Atualize o limite ou a alíquota da faixa"
          : "Cadastre uma faixa oficial vigente do INSS"
      }
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
          id="faixa-inss-limite"
          rotulo="Limite até"
          obrigatorio
          erro={form.formState.errors.limiteAte?.message}
          ajuda="Teto salarial desta faixa, em reais"
        >
          <InputDecimal
            id="faixa-inss-limite"
            autoComplete="off"
            disabled={salvando}
            {...form.register("limiteAte")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="faixa-inss-aliquota"
          rotulo="Alíquota"
          obrigatorio
          erro={form.formState.errors.aliquota?.message}
          ajuda="Percentual desta faixa, de 0 a 100, com até 4 casas decimais"
        >
          <InputDecimal
            casas={4}
            id="faixa-inss-aliquota"
            autoComplete="off"
            disabled={salvando}
            {...form.register("aliquota")}
          />
        </CampoFormulario>
      </form>
    </FormDrawer>
  );
}
