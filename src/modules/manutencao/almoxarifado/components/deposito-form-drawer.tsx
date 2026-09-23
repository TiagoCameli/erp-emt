"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";

import {
  CampoFormulario,
  classesFormulario,
  FormDrawer,
  SelectAtivo,
  submeterComAviso,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { criarDeposito, editarDeposito } from "@/modules/manutencao/almoxarifado/actions";
import type { DepositoLinha } from "@/modules/manutencao/almoxarifado/queries";
import { depositoSchema, type DepositoInput } from "@/modules/manutencao/almoxarifado/schemas";

const ID_FORM = "form-deposito-almoxarifado";

const PADRAO: DepositoInput = { nome: "", endereco: "", ativo: true };

export interface DepositoFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Depósito em edição. Ausente abre em modo de criação. */
  deposito?: DepositoLinha | null;
}

/** Criação e edição de depósito de peças: nome, endereço e ativo. */
export function DepositoFormDrawer({ aberto, onAbertoChange, deposito }: DepositoFormDrawerProps) {
  const editando = Boolean(deposito);

  const form = useForm<DepositoInput>({
    resolver: zodResolver(depositoSchema),
    defaultValues: PADRAO,
  });

  const salvando = form.formState.isSubmitting;
  const ativo = useWatch({ control: form.control, name: "ativo" });

  React.useEffect(() => {
    if (!aberto) return;
    form.reset(
      deposito
        ? { nome: deposito.nome, endereco: deposito.endereco ?? "", ativo: deposito.ativo }
        : PADRAO,
    );
  }, [aberto, deposito, form]);

  async function aoEnviar(dados: DepositoInput) {
    const resultado = deposito ? await editarDeposito(deposito.id, dados) : await criarDeposito(dados);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(editando ? "Depósito salvo" : "Depósito criado");
    onAbertoChange(false);
  }

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar depósito" : "Novo depósito"}
      descricao={editando ? "Atualize os dados do depósito" : "Cadastre um depósito de peças da manutenção"}
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
            ) : editando ? (
              "Salvar depósito"
            ) : (
              "Criar depósito"
            )}
          </Button>
        </>
      }
    >
      <form id={ID_FORM} onSubmit={submeterComAviso(form, aoEnviar)} className={classesFormulario} noValidate>
        <CampoFormulario id="deposito-nome" rotulo="Nome" obrigatorio erro={form.formState.errors.nome?.message}>
          <Input
            id="deposito-nome"
            autoComplete="off"
            placeholder="Almoxarifado Central"
            disabled={salvando}
            {...form.register("nome")}
          />
        </CampoFormulario>

        <CampoFormulario id="deposito-endereco" rotulo="Endereço" erro={form.formState.errors.endereco?.message}>
          <Input
            id="deposito-endereco"
            autoComplete="off"
            disabled={salvando}
            {...form.register("endereco")}
          />
        </CampoFormulario>

        <SelectAtivo
          value={ativo ?? true}
          onChange={(valor) => form.setValue("ativo", valor, { shouldDirty: true })}
          disabled={salvando}
          ajuda="Depósito inativo some da escolha na entrada, mas o saldo e o histórico continuam."
        />
      </form>
    </FormDrawer>
  );
}
