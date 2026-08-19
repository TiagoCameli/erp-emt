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
  SelectAtivo,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { salvarFuncao } from "@/modules/cadastros/funcoes/actions";
import type { FuncaoLista } from "@/modules/cadastros/funcoes/queries";
import {
  funcaoSchema,
  type FuncaoFormInput,
} from "@/modules/cadastros/funcoes/schemas";

const ID_FORM = "form-funcao";

const PADRAO: FuncaoFormInput = {
  nome: "",
  salarioBase: "",
  cbo: "",
  ativo: true,
};

export interface FuncaoFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Função em edição. Ausente abre o drawer em modo de criação. */
  funcao?: FuncaoLista | null;
}

/**
 * Drawer de criação e edição de função (cargo). Mesmo formulário para os
 * dois modos: a presença de `funcao` decide se `salvarFuncao` edita ou cria.
 */
export function FuncaoFormDrawer({
  aberto,
  onAbertoChange,
  funcao,
}: FuncaoFormDrawerProps) {
  const editando = Boolean(funcao);

  const form = useForm<FuncaoFormInput>({
    resolver: zodResolver(funcaoSchema),
    defaultValues: PADRAO,
  });

  const salvando = form.formState.isSubmitting;

  // Sincroniza o formulário com a função ao abrir.
  React.useEffect(() => {
    if (!aberto) return;
    if (funcao) {
      form.reset({
        nome: funcao.nome,
        salarioBase:
          funcao.salarioBase !== null
            ? String(funcao.salarioBase).replace(".", ",")
            : "",
        cbo: funcao.cbo ?? "",
        ativo: funcao.ativo,
      });
    } else {
      form.reset(PADRAO);
    }
  }, [aberto, funcao, form]);

  async function aoEnviar(entrada: FuncaoFormInput) {
    // Aplica o default e normaliza (trim, dinheiro) antes de chamar a action.
    const dados = funcaoSchema.parse(entrada);
    const resultado = await salvarFuncao(dados, funcao?.id);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "Função salva" : "Função criada");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar função" : "Nova função"}
      descricao={
        editando
          ? "Atualize os dados da função"
          : "Cadastre uma função para usar nos colaboradores"
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
              "Salvar função"
            ) : (
              "Criar função"
            )}
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
          id="funcao-nome"
          rotulo="Nome"
          obrigatorio
          erro={form.formState.errors.nome?.message}
        >
          <Input
            id="funcao-nome"
            autoComplete="off"
            placeholder="Pedreiro"
            disabled={salvando}
            {...form.register("nome")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="funcao-salario-base"
          rotulo="Salário base"
          erro={form.formState.errors.salarioBase?.message}
          ajuda="Opcional. Usado como referência ao lançar o colaborador."
        >
          <InputDecimal
            id="funcao-salario-base"
            autoComplete="off"
            placeholder="0,00"
            disabled={salvando}
            {...form.register("salarioBase")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="funcao-cbo"
          rotulo="CBO"
          erro={form.formState.errors.cbo?.message}
        >
          <Input
            id="funcao-cbo"
            autoComplete="off"
            placeholder="7152-10"
            disabled={salvando}
            {...form.register("cbo")}
          />
        </CampoFormulario>

        <SelectAtivo
          value={form.watch("ativo") ?? true}
          onChange={(valor) => form.setValue("ativo", valor)}
          disabled={salvando}
          rotulo="Ativa"
          ajuda="Funções inativas somem do Combobox de colaboradores, mas continuam no histórico."
        />
      </form>
    </FormDrawer>
  );
}
