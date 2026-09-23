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
  InputPreco,
  InputQuantidade,
  LinhaCampos,
  MoneyText,
  submeterComAviso,
} from "@/components/canonicos";
import { toast } from "@/components/canonicos/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CASAS_TAXA } from "@/lib/casas-decimais";
import { editarEntrada } from "@/modules/manutencao/almoxarifado/actions";
import {
  numeroParaTexto,
  paraNumero,
  totalDaLinha,
} from "@/modules/manutencao/almoxarifado/calculo";
import type { EntradaLinha, Opcao } from "@/modules/manutencao/almoxarifado/queries";
import {
  edicaoEntradaDoForm,
  edicaoEntradaFormSchema,
  type EdicaoEntradaFormInput,
} from "@/modules/manutencao/almoxarifado/schemas";

const ID_FORM = "form-editar-entrada-almoxarifado";

const VAZIO: EdicaoEntradaFormInput = {
  fornecedorId: "",
  notaFiscal: "",
  data: "",
  quantidade: "",
  valorUnitario: "",
};

function valoresDa(entrada: EntradaLinha | null): EdicaoEntradaFormInput {
  if (!entrada) return VAZIO;
  return {
    fornecedorId: entrada.fornecedorId,
    notaFiscal: entrada.notaFiscal ?? "",
    data: entrada.data,
    quantidade: numeroParaTexto(entrada.quantidade),
    valorUnitario: numeroParaTexto(entrada.valorUnitario),
  };
}

export interface EntradaEditarDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  entrada: EntradaLinha | null;
  fornecedores: Opcao[];
}

/**
 * Editar UMA linha de entrada pela `fn_almox_editar_entrada`: fornecedor, NF,
 * data, quantidade e valor unitário. Depósito e peça não mudam (mudariam o saldo
 * de outro par): para isso, exclua a linha e registre de novo.
 *
 * Diminuir a quantidade de uma entrada que já foi para OS pode deixar o saldo
 * negativo; o banco recusa e a action traduz a recusa.
 */
export function EntradaEditarDrawer({
  aberto,
  onAbertoChange,
  entrada,
  fornecedores,
}: EntradaEditarDrawerProps) {
  const form = useForm<EdicaoEntradaFormInput>({
    resolver: zodResolver(edicaoEntradaFormSchema),
    defaultValues: valoresDa(entrada),
  });

  const salvando = form.formState.isSubmitting;

  React.useEffect(() => {
    if (!aberto) return;
    form.reset(valoresDa(entrada));
  }, [aberto, entrada, form]);

  const opcoesFornecedores = React.useMemo(
    () => fornecedores.map((f) => ({ valor: f.id, rotulo: f.nome })),
    [fornecedores],
  );

  const [fornecedorId, quantidade, valorUnitario] = useWatch({
    control: form.control,
    name: ["fornecedorId", "quantidade", "valorUnitario"],
  });
  const q = paraNumero(quantidade ?? "", CASAS_TAXA);
  const u = paraNumero(valorUnitario ?? "", CASAS_TAXA);
  const total = q !== null && u !== null ? totalDaLinha(q, u) : 0;

  async function aoEnviar(dados: EdicaoEntradaFormInput) {
    if (!entrada) return;
    const resultado = await editarEntrada(entrada.id, edicaoEntradaDoForm(dados));
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Entrada salva");
    onAbertoChange(false);
  }

  const erros = form.formState.errors;

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Editar entrada"
      descricao={
        entrada
          ? `${entrada.insumoNome} no depósito ${entrada.depositoNome}`
          : "Atualize a linha da entrada"
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
          <Button type="submit" form={ID_FORM} disabled={salvando || !entrada}>
            {salvando ? (
              <>
                <LoaderCircle className="animate-spin" />
                Salvando...
              </>
            ) : (
              "Salvar entrada"
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
          id="editar-entrada-fornecedor"
          rotulo="Fornecedor"
          obrigatorio
          erro={erros.fornecedorId?.message}
        >
          <Combobox
            id="editar-entrada-fornecedor"
            valor={fornecedorId ?? ""}
            rotuloDoValor={entrada?.fornecedorNome}
            onValorChange={(valor) =>
              form.setValue("fornecedorId", valor, { shouldDirty: true, shouldValidate: true })
            }
            opcoes={opcoesFornecedores}
            placeholder="Selecione o fornecedor"
            disabled={salvando}
          />
        </CampoFormulario>

        <LinhaCampos>
          <CampoFormulario id="editar-entrada-nf" rotulo="Nota fiscal" erro={erros.notaFiscal?.message}>
            <Input
              id="editar-entrada-nf"
              autoComplete="off"
              disabled={salvando}
              {...form.register("notaFiscal")}
            />
          </CampoFormulario>
          <CampoFormulario
            id="editar-entrada-data"
            rotulo="Data"
            obrigatorio
            largura="medio"
            erro={erros.data?.message}
          >
            <Input
              id="editar-entrada-data"
              type="date"
              disabled={salvando}
              {...form.register("data")}
            />
          </CampoFormulario>
        </LinhaCampos>

        <LinhaCampos colunas={3}>
          <CampoFormulario
            id="editar-entrada-quantidade"
            rotulo={entrada?.unidade ? `Quantidade (${entrada.unidade})` : "Quantidade"}
            obrigatorio
            erro={erros.quantidade?.message}
          >
            <InputQuantidade
              id="editar-entrada-quantidade"
              valor={quantidade ?? ""}
              onValorChange={(valor) => form.setValue("quantidade", valor, { shouldDirty: true })}
              onBlur={() => void form.trigger("quantidade")}
              disabled={salvando}
            />
          </CampoFormulario>
          <CampoFormulario
            id="editar-entrada-valor"
            rotulo="Valor unitário"
            obrigatorio
            erro={erros.valorUnitario?.message}
          >
            <InputPreco
              id="editar-entrada-valor"
              valor={valorUnitario ?? ""}
              onValorChange={(valor) => form.setValue("valorUnitario", valor, { shouldDirty: true })}
              onBlur={() => void form.trigger("valorUnitario")}
              disabled={salvando}
            />
          </CampoFormulario>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Total</span>
            <span className="flex h-9 items-center justify-end">
              <MoneyText valor={total} />
            </span>
          </div>
        </LinhaCampos>
      </form>
    </FormDrawer>
  );
}
