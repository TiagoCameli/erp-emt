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
import {
  CampoFormulario,
  SelectAtivo,
  classesFormulario,
} from "@/modules/cadastros/_shared/campos";
import { ROTULO_BANCO } from "@/modules/financeiro/_shared/formato";
import {
  criarConta,
  editarConta,
} from "@/modules/financeiro/contas-bancarias/actions";
import type { ContaLista } from "@/modules/financeiro/contas-bancarias/queries";
import {
  BANCO_CONTA,
  ROTULO_TIPO_CONTA,
  TIPO_CONTA,
  contaFormSchema,
  type ContaFormInput,
} from "@/modules/financeiro/contas-bancarias/schemas";

const ID_FORM = "form-conta-bancaria";

/** Valores iniciais do formulário, a partir de uma conta ou em branco. */
function valoresIniciais(conta: ContaLista | null): ContaFormInput {
  return {
    nome: conta?.nome ?? "",
    banco: conta?.banco ?? "caixa",
    agencia: conta?.agencia ?? "",
    conta: conta?.conta ?? "",
    tipo: conta?.tipo ?? "corrente",
    saldoInicial:
      conta?.saldoInicial !== undefined
        ? String(conta.saldoInicial).replace(".", ",")
        : "",
    ativo: conta?.ativo ?? true,
  };
}

export interface ContasFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Conta em edição, ou null para criar uma nova. */
  conta: ContaLista | null;
}

/**
 * Drawer de criação e edição de conta bancária. Mesmo formulário para os dois
 * modos: quando conta é null, cria; quando vem preenchida, edita.
 */
export function ContasFormDrawer({
  aberto,
  onAbertoChange,
  conta,
}: ContasFormDrawerProps) {
  const editando = conta !== null;

  const form = useForm<ContaFormInput>({
    resolver: zodResolver(contaFormSchema),
    defaultValues: valoresIniciais(conta),
  });

  // Recarrega os valores ao trocar a conta selecionada ou reabrir.
  React.useEffect(() => {
    if (aberto) form.reset(valoresIniciais(conta));
  }, [aberto, conta, form]);

  const salvando = form.formState.isSubmitting;

  async function aoEnviar(valores: ContaFormInput) {
    const saldoInicial =
      valores.saldoInicial.trim() === ""
        ? 0
        : Number(valores.saldoInicial.replace(",", "."));

    const dados = {
      nome: valores.nome,
      banco: valores.banco,
      agencia: valores.agencia,
      conta: valores.conta,
      tipo: valores.tipo,
      saldoInicial,
      ativo: valores.ativo,
    };

    const resultado = editando
      ? await editarConta(conta.id, dados)
      : await criarConta(dados);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "Conta salva" : "Conta criada");
    onAbertoChange(false);
  }

  const bancoValor = form.watch("banco");
  const tipoValor = form.watch("tipo");

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar conta bancária" : "Nova conta bancária"}
      descricao={
        editando
          ? "Atualize os dados desta conta"
          : "Cadastre uma conta bancária ou um caixa"
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
              "Salvar conta"
            ) : (
              "Criar conta"
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
          id="conta-nome"
          rotulo="Nome"
          obrigatorio
          erro={form.formState.errors.nome?.message}
        >
          <Input
            id="conta-nome"
            placeholder="Caixa da obra BR-364"
            disabled={salvando}
            {...form.register("nome")}
          />
        </CampoFormulario>

        <div className="grid grid-cols-2 gap-4">
          <CampoFormulario
            id="conta-banco"
            rotulo="Banco"
            obrigatorio
            erro={form.formState.errors.banco?.message}
          >
            <Select
              value={bancoValor}
              onValueChange={(valor) =>
                form.setValue("banco", valor as ContaFormInput["banco"], {
                  shouldValidate: true,
                })
              }
              disabled={salvando}
            >
              <SelectTrigger id="conta-banco" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BANCO_CONTA.map((banco) => (
                  <SelectItem key={banco} value={banco}>
                    {ROTULO_BANCO[banco]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CampoFormulario>

          <CampoFormulario
            id="conta-tipo"
            rotulo="Tipo"
            obrigatorio
            erro={form.formState.errors.tipo?.message}
          >
            <Select
              value={tipoValor}
              onValueChange={(valor) =>
                form.setValue("tipo", valor as ContaFormInput["tipo"], {
                  shouldValidate: true,
                })
              }
              disabled={salvando}
            >
              <SelectTrigger id="conta-tipo" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPO_CONTA.map((tipo) => (
                  <SelectItem key={tipo} value={tipo}>
                    {ROTULO_TIPO_CONTA[tipo]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CampoFormulario>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <CampoFormulario
            id="conta-agencia"
            rotulo="Agência"
            erro={form.formState.errors.agencia?.message}
          >
            <Input
              id="conta-agencia"
              placeholder="0001"
              className="codigo-doc"
              disabled={salvando}
              {...form.register("agencia")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="conta-numero"
            rotulo="Conta"
            erro={form.formState.errors.conta?.message}
          >
            <Input
              id="conta-numero"
              placeholder="12345-6"
              className="codigo-doc"
              disabled={salvando}
              {...form.register("conta")}
            />
          </CampoFormulario>
        </div>

        <CampoFormulario
          id="conta-saldo-inicial"
          rotulo="Saldo inicial"
          ajuda="Saldo de abertura da conta. O saldo atual soma a partir daqui as parcelas pagas nesta conta."
          erro={form.formState.errors.saldoInicial?.message}
        >
          <Input
            id="conta-saldo-inicial"
            inputMode="decimal"
            placeholder="0,00"
            className="tabular-nums text-right"
            disabled={salvando}
            {...form.register("saldoInicial")}
          />
        </CampoFormulario>

        <SelectAtivo
          value={form.watch("ativo")}
          onChange={(valor) => form.setValue("ativo", valor)}
          disabled={salvando}
        />
      </form>
    </FormDrawer>
  );
}
