"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import {
  CampoFormulario,
  classesFormulario,
  Combobox,
  FormDrawer,
  LinhaCampos,
  SelectAtivo,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { criar, editar } from "@/modules/cadastros/fornecedores/actions";
import type { FornecedorLista } from "@/modules/cadastros/fornecedores/queries";
import {
  fornecedorSchema,
  ROTULO_TIPO,
  TIPOS_FORNECEDOR,
  type FornecedorInput,
} from "@/modules/cadastros/fornecedores/schemas";

const ID_FORM = "form-fornecedor";

function valoresPadrao(fornecedor: FornecedorLista | null): FornecedorInput {
  return {
    tipo: fornecedor?.tipo ?? "pj",
    razaoSocial: fornecedor?.razaoSocial ?? "",
    nomeFantasia: fornecedor?.nomeFantasia ?? "",
    cnpjCpf: fornecedor?.cnpjCpf ?? "",
    inscricaoEstadual: fornecedor?.inscricaoEstadual ?? "",
    email: fornecedor?.email ?? "",
    telefone: fornecedor?.telefone ?? "",
    cidade: fornecedor?.cidade ?? "",
    uf: fornecedor?.uf ?? "",
    endereco: fornecedor?.endereco ?? "",
    observacoes: fornecedor?.observacoes ?? "",
    ativo: fornecedor?.ativo ?? true,
  };
}

export interface FornecedoresFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Quando presente, o drawer edita; senão, cria. */
  fornecedor: FornecedorLista | null;
}

/**
 * Drawer de cadastro de fornecedor: cria quando não recebe fornecedor,
 * edita quando recebe. Use uma key na montagem (id do fornecedor ou "novo")
 * para resetar o formulário entre aberturas.
 */
export function FornecedoresFormDrawer({
  aberto,
  onAbertoChange,
  fornecedor,
}: FornecedoresFormDrawerProps) {
  const editando = fornecedor !== null;

  const form = useForm<FornecedorInput>({
    resolver: zodResolver(fornecedorSchema),
    defaultValues: valoresPadrao(fornecedor),
  });

  const salvando = form.formState.isSubmitting;

  async function aoEnviar(dados: FornecedorInput) {
    const resultado = editando
      ? await editar(fornecedor.id, dados)
      : await criar(dados);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "Fornecedor salvo" : "Fornecedor criado");
    onAbertoChange(false);
  }

  const tipoValor = form.watch("tipo");

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar fornecedor" : "Novo fornecedor"}
      descricao={
        editando
          ? "Atualize os dados do fornecedor"
          : "Cadastre um novo fornecedor de materiais, peças, serviços ou fretes"
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
              "Salvar fornecedor"
            ) : (
              "Criar fornecedor"
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
          id="fornecedor-tipo"
          rotulo="Tipo"
          erro={form.formState.errors.tipo?.message}
        >
          <Combobox
            valor={tipoValor}
            onValorChange={(valor) =>
              form.setValue("tipo", valor as FornecedorInput["tipo"], {
                shouldValidate: true,
              })
            }
            opcoes={TIPOS_FORNECEDOR.map((tipo) => ({
              valor: tipo,
              rotulo: ROTULO_TIPO[tipo],
            }))}
            disabled={salvando}
            className="w-full"
            id="fornecedor-tipo"
          />
        </CampoFormulario>

        <CampoFormulario
          id="fornecedor-razao-social"
          rotulo="Razão social"
          erro={form.formState.errors.razaoSocial?.message}
        >
          <Input
            id="fornecedor-razao-social"
            placeholder="Nome ou razão social"
            disabled={salvando}
            {...form.register("razaoSocial")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="fornecedor-nome-fantasia"
          rotulo="Nome fantasia"
          erro={form.formState.errors.nomeFantasia?.message}
        >
          <Input
            id="fornecedor-nome-fantasia"
            placeholder="Nome fantasia"
            disabled={salvando}
            {...form.register("nomeFantasia")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="fornecedor-cnpj-cpf"
          rotulo="CNPJ ou CPF"
          erro={form.formState.errors.cnpjCpf?.message}
        >
          <Input
            id="fornecedor-cnpj-cpf"
            placeholder="00.000.000/0001-00"
            disabled={salvando}
            {...form.register("cnpjCpf")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="fornecedor-inscricao-estadual"
          rotulo="Inscrição estadual"
          erro={form.formState.errors.inscricaoEstadual?.message}
        >
          <Input
            id="fornecedor-inscricao-estadual"
            placeholder="Inscrição estadual"
            disabled={salvando}
            {...form.register("inscricaoEstadual")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="fornecedor-email"
          rotulo="Email"
          erro={form.formState.errors.email?.message}
        >
          <Input
            id="fornecedor-email"
            type="email"
            placeholder="contato@fornecedor.com"
            disabled={salvando}
            {...form.register("email")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="fornecedor-telefone"
          rotulo="Telefone"
          erro={form.formState.errors.telefone?.message}
        >
          <Input
            id="fornecedor-telefone"
            placeholder="(68) 90000-0000"
            disabled={salvando}
            {...form.register("telefone")}
          />
        </CampoFormulario>

        <LinhaCampos colunas={3}>
          <CampoFormulario
            id="fornecedor-cidade"
            rotulo="Cidade"
            className="sm:col-span-2"
            erro={form.formState.errors.cidade?.message}
          >
            <Input
              id="fornecedor-cidade"
              placeholder="Cruzeiro do Sul"
              disabled={salvando}
              {...form.register("cidade")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="fornecedor-uf"
            rotulo="UF"
            erro={form.formState.errors.uf?.message}
          >
            <Input
              id="fornecedor-uf"
              placeholder="AC"
              maxLength={2}
              disabled={salvando}
              {...form.register("uf")}
            />
          </CampoFormulario>
        </LinhaCampos>

        <CampoFormulario
          id="fornecedor-endereco"
          rotulo="Endereço"
          erro={form.formState.errors.endereco?.message}
        >
          <Input
            id="fornecedor-endereco"
            placeholder="Rua, número, bairro"
            disabled={salvando}
            {...form.register("endereco")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="fornecedor-observacoes"
          rotulo="Observações"
          erro={form.formState.errors.observacoes?.message}
        >
          <Textarea
            id="fornecedor-observacoes"
            placeholder="Anotações sobre o fornecedor"
            rows={3}
            disabled={salvando}
            {...form.register("observacoes")}
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
