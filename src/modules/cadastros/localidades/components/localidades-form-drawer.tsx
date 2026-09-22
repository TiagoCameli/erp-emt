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
  SelectAtivo,
  submeterComAviso,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { criar, editar } from "@/modules/cadastros/localidades/actions";
import type { LocalidadeLista } from "@/modules/cadastros/localidades/queries";
import {
  localidadeSchema,
  type LocalidadeFormInput,
} from "@/modules/cadastros/localidades/schemas";

const ID_FORM = "form-localidade";

const PADRAO: LocalidadeFormInput = {
  nome: "",
  endereco: "",
  ativo: true,
};

export interface LocalidadesFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Localidade em edição. Ausente abre o drawer em modo de criação. */
  localidade?: LocalidadeLista | null;
}

/**
 * Drawer de criação e edição de localidade. Mesmo formulário para os dois
 * modos: a presença de `localidade` define qual action chamar.
 */
export function LocalidadesFormDrawer({
  aberto,
  onAbertoChange,
  localidade,
}: LocalidadesFormDrawerProps) {
  const editando = Boolean(localidade);

  const form = useForm<LocalidadeFormInput>({
    resolver: zodResolver(localidadeSchema),
    defaultValues: PADRAO,
  });

  const salvando = form.formState.isSubmitting;

  React.useEffect(() => {
    if (!aberto) return;
    if (localidade) {
      form.reset({
        nome: localidade.nome,
        endereco: localidade.endereco ?? "",
        ativo: localidade.ativo,
      });
    } else {
      form.reset(PADRAO);
    }
  }, [aberto, localidade, form]);

  async function aoEnviar(entrada: LocalidadeFormInput) {
    const dados = localidadeSchema.parse(entrada);
    const resultado = localidade
      ? await editar(localidade.id, dados)
      : await criar(dados);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "Localidade salva" : "Localidade criada");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar localidade" : "Nova localidade"}
      descricao={
        editando
          ? "Atualize os dados da localidade"
          : "Cadastre uma origem ou destino de frete"
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
              "Salvar localidade"
            ) : (
              "Criar localidade"
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
          id="localidade-nome"
          rotulo="Nome"
          obrigatorio
          erro={form.formState.errors.nome?.message}
        >
          <Input
            id="localidade-nome"
            autoComplete="off"
            placeholder="Pedreira Vale do Abunã"
            disabled={salvando}
            {...form.register("nome")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="localidade-endereco"
          rotulo="Endereço"
          erro={form.formState.errors.endereco?.message}
        >
          <Input
            id="localidade-endereco"
            autoComplete="off"
            placeholder="BR-364, km 120"
            disabled={salvando}
            {...form.register("endereco")}
          />
        </CampoFormulario>

        <SelectAtivo
          value={form.watch("ativo") ?? true}
          onChange={(valor) => form.setValue("ativo", valor)}
          disabled={salvando}
          rotulo="Ativa"
          ajuda="Localidades inativas somem das listas de seleção do frete, mas continuam no histórico."
        />
      </form>
    </FormDrawer>
  );
}
