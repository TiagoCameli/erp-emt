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
import { criar, editar } from "@/modules/cadastros/clientes/actions";
import {
  clientePadrao,
  clienteSchema,
  type ClienteInput,
} from "@/modules/cadastros/clientes/schemas";
import type { ClienteLista } from "@/modules/cadastros/clientes/queries";

const ID_FORM = "form-cliente";

/** Valores do formulário a partir de um cliente existente, null vira "". */
function valoresDoCliente(cliente: ClienteLista): ClienteInput {
  return {
    tipo: cliente.tipo === "pf" ? "pf" : "pj",
    nome: cliente.nome,
    nome_fantasia: cliente.nomeFantasia ?? "",
    cpf_cnpj: cliente.cpfCnpj ?? "",
    inscricao_estadual: cliente.inscricaoEstadual ?? "",
    email: cliente.email ?? "",
    telefone: cliente.telefone ?? "",
    cidade: cliente.cidade ?? "",
    uf: cliente.uf ?? "",
    endereco: cliente.endereco ?? "",
    observacoes: cliente.observacoes ?? "",
    ativo: cliente.ativo,
  };
}

export interface ClientesFormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Cliente em edição, ou null para criar um novo. */
  cliente: ClienteLista | null;
}

/**
 * Drawer de criação e edição de cliente. Reaproveita o mesmo formulário:
 * com cliente preenche os campos, sem cliente cria do zero.
 */
export function ClientesFormDrawer({
  aberto,
  onAbertoChange,
  cliente,
}: ClientesFormDrawerProps) {
  const editando = cliente !== null;

  const form = useForm<ClienteInput>({
    resolver: zodResolver(clienteSchema),
    defaultValues: cliente ? valoresDoCliente(cliente) : clientePadrao,
  });

  const salvando = form.formState.isSubmitting;

  React.useEffect(() => {
    if (aberto) {
      form.reset(cliente ? valoresDoCliente(cliente) : clientePadrao);
    }
  }, [aberto, cliente, form]);

  async function aoEnviar(dados: ClienteInput) {
    const resultado = editando
      ? await editar(cliente.id, dados)
      : await criar(dados);

    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }

    toast.success(editando ? "Cliente atualizado" : "Cliente criado");
    onAbertoChange(false);
  }

  const tipoValor = form.watch("tipo");

  return (
    <FormDrawer
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo={editando ? "Editar cliente" : "Novo cliente"}
      descricao="Órgãos e empresas contratantes das obras"
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
              "Salvar cliente"
            ) : (
              "Criar cliente"
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
          id="cliente-tipo"
          rotulo="Tipo"
          erro={form.formState.errors.tipo?.message}
        >
          <Combobox
            valor={tipoValor}
            onValorChange={(valor) =>
              form.setValue("tipo", valor as ClienteInput["tipo"], {
                shouldValidate: true,
              })
            }
            opcoes={[
              { valor: "pj", rotulo: "Pessoa jurídica" },
              { valor: "pf", rotulo: "Pessoa física" },
            ]}
            placeholder="Selecione o tipo"
            disabled={salvando}
            className="w-full"
            id="cliente-tipo"
          />
        </CampoFormulario>

        <CampoFormulario
          id="cliente-nome"
          rotulo="Nome ou razão social"
          erro={form.formState.errors.nome?.message}
        >
          <Input
            id="cliente-nome"
            autoComplete="off"
            placeholder="DNIT"
            disabled={salvando}
            {...form.register("nome")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="cliente-nome-fantasia"
          rotulo="Nome fantasia"
          erro={form.formState.errors.nome_fantasia?.message}
        >
          <Input
            id="cliente-nome-fantasia"
            autoComplete="off"
            placeholder="Nome fantasia"
            disabled={salvando}
            {...form.register("nome_fantasia")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="cliente-cpf-cnpj"
          rotulo="CPF ou CNPJ"
          erro={form.formState.errors.cpf_cnpj?.message}
        >
          <Input
            id="cliente-cpf-cnpj"
            autoComplete="off"
            placeholder="00.000.000/0001-00"
            disabled={salvando}
            {...form.register("cpf_cnpj")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="cliente-inscricao-estadual"
          rotulo="Inscrição estadual"
          erro={form.formState.errors.inscricao_estadual?.message}
        >
          <Input
            id="cliente-inscricao-estadual"
            autoComplete="off"
            placeholder="Inscrição estadual"
            disabled={salvando}
            {...form.register("inscricao_estadual")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="cliente-email"
          rotulo="Email"
          erro={form.formState.errors.email?.message}
        >
          <Input
            id="cliente-email"
            type="email"
            autoComplete="off"
            placeholder="contato@orgao.gov.br"
            disabled={salvando}
            {...form.register("email")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="cliente-telefone"
          rotulo="Telefone"
          erro={form.formState.errors.telefone?.message}
        >
          <Input
            id="cliente-telefone"
            autoComplete="off"
            placeholder="(68) 0000-0000"
            disabled={salvando}
            {...form.register("telefone")}
          />
        </CampoFormulario>

        <LinhaCampos>
          <CampoFormulario
            id="cliente-cidade"
            rotulo="Cidade"
            erro={form.formState.errors.cidade?.message}
          >
            <Input
              id="cliente-cidade"
              autoComplete="off"
              placeholder="Rio Branco"
              disabled={salvando}
              {...form.register("cidade")}
            />
          </CampoFormulario>

          <CampoFormulario
            id="cliente-uf"
            rotulo="UF"
            erro={form.formState.errors.uf?.message}
          >
            <Input
              id="cliente-uf"
              autoComplete="off"
              placeholder="AC"
              maxLength={2}
              disabled={salvando}
              {...form.register("uf")}
            />
          </CampoFormulario>
        </LinhaCampos>

        <CampoFormulario
          id="cliente-endereco"
          rotulo="Endereço"
          erro={form.formState.errors.endereco?.message}
        >
          <Input
            id="cliente-endereco"
            autoComplete="off"
            placeholder="Rua, número, bairro"
            disabled={salvando}
            {...form.register("endereco")}
          />
        </CampoFormulario>

        <CampoFormulario
          id="cliente-observacoes"
          rotulo="Observações"
          erro={form.formState.errors.observacoes?.message}
        >
          <Textarea
            id="cliente-observacoes"
            placeholder="Anotações sobre o cliente"
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
